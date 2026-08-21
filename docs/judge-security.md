# Judge security model

`apps/judge-worker` executes untrusted, user-submitted code (Python, JavaScript, C++). This
document describes the sandbox, what it protects against, and — per PRD §12 — what it explicitly
does not.

## Threat model

Treat every submission as hostile: it may try to read/write outside its workspace, exhaust CPU,
memory, disk, or process count, reach the network, or otherwise escape. Nothing about a submission
(including its stated language) is trusted before it runs.

## Where code runs

Code is never executed inside the API process or the judge worker's own Node process — see
`apps/judge-worker/src/execution/evaluate.ts`. Every compile and every test-case run is a separate
`docker run` invocation (`apps/judge-worker/src/execution/dockerArgs.ts`,
`dockerProcess.ts`), so a crash or resource exhaustion inside a submission's container cannot touch
the worker process that scheduled it.

## Isolation applied to every container

| Control                   | Flag(s)                                                                        | Purpose                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| No network                | `--network none`                                                               | A submission cannot exfiltrate data or call out anywhere.                                                 |
| Non-root, fixed UID       | `--user 65534:65534`                                                           | Never runs as root or as the host user.                                                                   |
| No Linux capabilities     | `--cap-drop ALL`, `--security-opt no-new-privileges`                           | No capability-based privilege escalation.                                                                 |
| Memory limit              | `--memory`, `--memory-swap` (both set to the problem's limit)                  | Bounds RAM; swap is disabled beyond the same limit so a submission can't work around the cap by swapping. |
| CPU limit                 | `--cpus 1`                                                                     | Bounds CPU share.                                                                                         |
| Process limit             | `--pids-limit 64`                                                              | Blocks fork bombs.                                                                                        |
| Read-only root filesystem | `--read-only`, `--tmpfs /tmp:rw,size=64m`                                      | Nothing is persisted; only a small scratch `/tmp` is writable.                                            |
| Isolated workspace mount  | `-v <per-submission temp dir>:/workspace:ro` (`:rw` only for the compile step) | The only host path ever mounted; unique per submission, deleted immediately after (`workspace.ts`).       |
| No Docker socket          | never mounted                                                                  | A container can never control the Docker daemon that runs it.                                             |
| Wall-clock timeout        | host-side timer + `docker kill` (`dockerProcess.ts`)                           | Enforces the problem's time limit; Docker has no native per-run wall-clock timeout.                       |
| Output cap                | 1MB, captured host-side while streaming stdout                                 | A submission that floods stdout can't exhaust worker memory; treated as a runtime error.                  |

Compilation (C++ only) runs in the same kind of sandbox as execution, with a fixed generous memory
limit and a short (10s) compile timeout independent of the problem's own limits.

## Cleanup and retries

Containers are started without `--rm`; the worker explicitly inspects (to read
`.State.OOMKilled`, which distinguishes an out-of-memory kill from a generic non-zero exit) and
then force-removes every container in all cases, success or failure. The per-submission workspace
directory is removed in a `finally` block regardless of outcome. BullMQ retries (3 attempts,
exponential backoff) are safe to repeat: `worker.ts` skips any submission already in a terminal
state before doing any Docker work.

## Running the worker itself in a container

`apps/judge-worker` shells out to the `docker` CLI, so it needs a Docker daemon to talk to. In
`docker-compose.yml`, that's the **host's own daemon**: the judge-worker container mounts
`/var/run/docker.sock` and runs as root to reliably read it (Docker-outside-of-Docker, not
Docker-in-Docker — there's no nested daemon). This is a **different, higher trust boundary** than
everything above: the judge-worker container is our own code, never attacker-controlled, so giving
it Docker-daemon-equivalent host access is an accepted tradeoff for orchestrating sandboxes, not a
gap in the sandbox itself. The per-submission containers it spawns never get the socket, never run
as root, and are the ones actually running untrusted code.

One consequence: because judge-worker asks the _host_ daemon to create sibling containers, any
`-v` mount it requests must be a path the host can resolve — not a path inside judge-worker's own
container filesystem. `docker-compose.yml` bind-mounts `./.judge-workspaces` (repo root) into the
judge-worker container at `/judge-workspaces`, and sets `JUDGE_WORKSPACE_DIR=/judge-workspaces`
(what the Node process itself uses) alongside `JUDGE_WORKSPACE_HOST_DIR=${PWD}/.judge-workspaces`
(what gets passed to sibling containers' `-v` flags — see `workspace.ts`). Running `docker compose`
from anywhere other than the repo root breaks this. Outside Docker Compose — `npm run dev:worker`
directly on a host with Docker Desktop/Engine — neither variable is needed: the worker's own temp
directory already **is** a host path.

## Known limitations

- **Docker is not a complete sandbox.** Namespaces and cgroups reduce but don't eliminate the
  kernel attack surface a container shares with the host. For real production use, PRD §12
  recommends a stronger boundary — [gVisor](https://gvisor.dev/), [Firecracker](https://firecracker-microvm.github.io/),
  or dedicated judge hosts — none of which are implemented here.
- **Memory usage is best-effort.** Peak memory is sampled by polling `docker stats` every ~30ms
  while a container runs (`memorySampler.ts`), not by reading a precise cgroup accounting number.
  A process that starts and exits between polls leaves `memoryKb` as `null` rather than a
  fabricated figure. This also means it works unmodified on Docker Desktop, where the daemon runs
  inside its own VM and the host has no direct view into container cgroups at all.
- **Runtime includes container start-up overhead.** `runtimeMs` is a host-side wall-clock
  measurement around the whole `docker run`, not just the submitted program's execution.
- **Image tags are not pinned to digests.** `python:3.12-slim`, `node:20-slim`, and `gcc:13`
  (`execution/languages.ts`) can shift under a fixed tag; pin to digests for full build
  reproducibility in a real deployment.
- **No filesystem quota beyond the tmpfs size.** `/tmp` is capped at 64MB via the tmpfs mount, but
  there's no separate disk-usage accounting beyond that.

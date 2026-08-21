// Fixed non-root UID/GID ("nobody" on Debian-based images) so submitted
// code never runs as root or as the host user, and never matches an
// in-container user with any pre-existing privileges.
const SANDBOX_UID = 65534;

export interface RunContainerOptions {
  name: string;
  image: string;
  /** Must be resolvable by the Docker daemon this runs against — the host path under Docker-outside-of-Docker, see workspace.ts. */
  workspaceDir: string;
  /** true for execution runs; false only for the compile step, which must write the built binary. */
  readOnlyWorkspace: boolean;
  memoryMb: number;
  command: string[];
}

/**
 * Builds the full `docker run` argv for one sandboxed invocation (PRD §12):
 * no network, non-root, all capabilities dropped, CPU/memory/process
 * limits, a read-only root filesystem with only a small tmpfs and the
 * submission's own isolated workspace mounted, and never the Docker
 * socket or any other host path.
 */
export function buildRunArgs(opts: RunContainerOptions): string[] {
  const mode = opts.readOnlyWorkspace ? "ro" : "rw";
  return [
    "run",
    "--name",
    opts.name,
    "--network",
    "none",
    "--user",
    `${SANDBOX_UID}:${SANDBOX_UID}`,
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--memory",
    `${opts.memoryMb}m`,
    "--memory-swap",
    `${opts.memoryMb}m`,
    "--cpus",
    "1",
    "--pids-limit",
    "64",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,size=64m",
    "-v",
    `${opts.workspaceDir}:/workspace:${mode}`,
    "-w",
    "/workspace",
    "-i",
    opts.image,
    ...opts.command,
  ];
}

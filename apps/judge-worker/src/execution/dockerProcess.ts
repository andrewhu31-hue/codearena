import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { startMemorySampling } from "./memorySampler.js";

const execFileAsync = promisify(execFile);

// Bounds total stdout captured from a container (PRD §12 "output limits");
// a submission that tries to print gigabytes must not exhaust worker memory.
const MAX_OUTPUT_BYTES = 1_000_000;

export interface DockerRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputExceeded: boolean;
  oomKilled: boolean;
  runtimeMs: number;
  /** Best-effort peak memory in KB; null if no sample was captured. */
  memoryKb: number | null;
}

/**
 * Runs one `docker run` invocation to completion (or until `timeoutMs`
 * elapses, in which case the container is killed). Deliberately does not
 * pass `--rm` to `docker run`: cleanup happens explicitly here, after
 * `docker inspect` has had a chance to read `.State.OOMKilled` — a `--rm`'d
 * container can already be gone by the time our process sees it exit.
 */
export async function runDockerContainer(
  args: string[],
  containerName: string,
  stdin: string,
  timeoutMs: number,
): Promise<DockerRunResult> {
  const start = Date.now();
  const sampler = startMemorySampling(containerName);

  let stdout = "";
  let stderr = "";
  let outputExceeded = false;
  let timedOut = false;

  const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      timedOut = true;
      void execFileAsync("docker", ["kill", containerName]).catch(() => {});
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.stdout.on("data", (chunk: Buffer) => {
      if (outputExceeded) return;
      if (stdout.length + chunk.length > MAX_OUTPUT_BYTES) {
        outputExceeded = true;
        void execFileAsync("docker", ["kill", containerName]).catch(() => {});
        return;
      }
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk.toString("utf8");
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });

    child.stdin.write(stdin);
    child.stdin.end();
  });

  const memoryKb = sampler.stop();

  const oomKilled =
    !timedOut && exitCode !== 0 && exitCode !== null ? await wasOomKilled(containerName) : false;

  // Always clean up, whatever happened above (PRD §12 "automatic cleanup").
  await execFileAsync("docker", ["rm", "-f", containerName]).catch(() => {});

  return {
    exitCode,
    stdout,
    stderr,
    timedOut,
    outputExceeded,
    oomKilled,
    runtimeMs: Date.now() - start,
    memoryKb,
  };
}

async function wasOomKilled(containerName: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("docker", [
      "inspect",
      containerName,
      "--format",
      "{{.State.OOMKilled}}",
    ]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

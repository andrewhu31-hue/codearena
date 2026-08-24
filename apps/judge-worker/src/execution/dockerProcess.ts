import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { startMemorySampling } from "./memorySampler.js";

const execFileAsync = promisify(execFile);

// Bounds total stdout captured from a container (PRD §12 "output limits");
// a submission that tries to print gigabytes must not exhaust worker memory.
const MAX_OUTPUT_BYTES = 1_000_000;

export type TimeoutCategory =
  | "none"
  | "contestant_timeout"
  | "startup_timeout"
  | "teardown_timeout";

export type FailureCategory =
  | "none"
  | "contestant_timeout"
  | "startup_timeout"
  | "teardown_timeout"
  | "infrastructure_failure"
  | "runtime_failure";

export interface LifecycleEvent {
  name:
  | "docker_spawn_requested"
  | "child_spawned"
  | "stdin_write_started"
  | "stdin_write_completed"
  | "stdin_end_called"
  | "stdin_finish"
  | "stdin_closed"
  | "stdout_received"
  | "stderr_received"
  | "timeout_fired"
  | "kill_requested"
  | "kill_completed"
  | "child_exit"
  | "child_close";
  atMs: number;
  sinceStartMs: number;
  detail?: string;
}

export interface DockerRunOptions {
  contestantTimeoutMs: number;
  startupTimeoutMs?: number;
  teardownTimeoutMs?: number;
  onLifecycleEvent?: (event: LifecycleEvent) => void;
}

export interface DockerRunResult {
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  timeoutCategory: TimeoutCategory;
  failureCategory: FailureCategory;
  outputExceeded: boolean;
  oomKilled: boolean;
  timeoutFired: boolean;
  teardownTimeoutFired: boolean;
  killRequested: boolean;
  killCompleted: boolean;
  startupMs: number | null;
  runtimeMs: number;
  wallTimeMs: number;
  lifecycleEvents: LifecycleEvent[];
  infrastructureError: string | null;
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
  options: DockerRunOptions,
): Promise<DockerRunResult> {
  const start = Date.now();
  const events: LifecycleEvent[] = [];
  const emit = (name: LifecycleEvent["name"], detail?: string) => {
    const atMs = Date.now();
    const event: LifecycleEvent = { name, atMs, sinceStartMs: atMs - start, detail };
    events.push(event);
    options.onLifecycleEvent?.(event);
  };

  emit("docker_spawn_requested");
  const sampler = startMemorySampling(containerName);

  let stdout = "";
  let stderr = "";
  let outputExceeded = false;
  let timeoutFired = false;
  let timeoutCategory: TimeoutCategory = "none";
  let infrastructureError: string | null = null;
  let killRequested = false;
  let killCompleted = false;
  let teardownTimeoutFired = false;
  let startupMs: number | null = null;
  let contestantStartMs: number | null = null;
  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;
  let closeAtMs: number | null = null;

  const startupTimeoutMs = options.startupTimeoutMs ?? 60_000;
  const teardownTimeoutMs = options.teardownTimeoutMs ?? 5_000;
  let startupTimer: NodeJS.Timeout | null = null;
  let contestantTimer: NodeJS.Timeout | null = null;
  let teardownTimer: NodeJS.Timeout | null = null;
  let runningProbeTimer: NodeJS.Timeout | null = null;
  let stdinFinished = false;
  let contestantTimerStarted = false;
  let finish: () => void = () => { };

  const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  emit("child_spawned");

  const requestKill = async (reason: TimeoutCategory): Promise<void> => {
    if (killRequested) return;
    killRequested = true;
    emit("kill_requested", reason);
    try {
      await execFileAsync("docker", ["kill", containerName]);
      killCompleted = true;
      emit("kill_completed", reason);
    } catch (err) {
      infrastructureError = String(err);
      emit("kill_completed", `${reason}:kill_error`);
    }
  };

  const clearTimers = () => {
    if (startupTimer) clearTimeout(startupTimer);
    if (contestantTimer) clearTimeout(contestantTimer);
    if (teardownTimer) clearTimeout(teardownTimer);
    if (runningProbeTimer) clearInterval(runningProbeTimer);
    startupTimer = null;
    contestantTimer = null;
    teardownTimer = null;
  };

  const isContainerRunning = async (): Promise<boolean> => {
    try {
      const { stdout } = await execFileAsync("docker", [
        "inspect",
        containerName,
        "--format",
        "{{.State.Running}}",
      ]);
      return stdout.trim() === "true";
    } catch {
      return false;
    }
  };

  const maybeStartContestantTimer = async () => {
    if (!stdinFinished || contestantTimerStarted) return;
    const running = await isContainerRunning();
    if (!running) return;

    contestantTimerStarted = true;
    startupMs = Date.now() - start;
    contestantStartMs = Date.now();
    if (startupTimer) {
      clearTimeout(startupTimer);
      startupTimer = null;
    }
    contestantTimer = setTimeout(() => {
      timeoutFired = true;
      timeoutCategory = "contestant_timeout";
      emit("timeout_fired", "contestant_timeout");
      teardownTimer = setTimeout(() => {
        teardownTimeoutFired = true;
        if (timeoutCategory === "contestant_timeout") {
          timeoutCategory = "teardown_timeout";
        }
        emit("timeout_fired", "teardown_timeout");
        child.kill("SIGKILL");
        finish();
      }, teardownTimeoutMs);
      void requestKill("contestant_timeout");
    }, options.contestantTimeoutMs);
  };

  await new Promise<void>((resolve) => {
    let settled = false;
    finish = () => {
      if (settled) return;
      settled = true;
      if (closeAtMs === null) closeAtMs = Date.now();
      clearTimers();
      resolve();
    };

    startupTimer = setTimeout(() => {
      timeoutFired = true;
      timeoutCategory = "startup_timeout";
      emit("timeout_fired", "startup_timeout");
      teardownTimer = setTimeout(() => {
        teardownTimeoutFired = true;
        if (timeoutCategory === "startup_timeout" && !killCompleted) {
          // Keep startup classification stable when cleanup is otherwise healthy.
          // Only reclassify to teardown timeout if kill never completed.
          timeoutCategory = "teardown_timeout";
        }
        emit("timeout_fired", "teardown_timeout");
        child.kill("SIGKILL");
        finish();
      }, teardownTimeoutMs);
      void requestKill("startup_timeout");
    }, startupTimeoutMs);

    child.on("error", (err) => {
      infrastructureError = String(err);
      finish();
    });

    child.stdout.on("data", (chunk: Buffer) => {
      emit("stdout_received");
      if (outputExceeded) return;
      if (stdout.length + chunk.length > MAX_OUTPUT_BYTES) {
        outputExceeded = true;
        void requestKill("none");
        return;
      }
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      emit("stderr_received");
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk.toString("utf8");
    });

    child.on("exit", (code, signal) => {
      exitCode = code;
      exitSignal = signal;
      emit("child_exit", signal ?? undefined);
    });

    child.on("close", (code, signal) => {
      if (exitCode === null) exitCode = code;
      if (exitSignal === null) exitSignal = signal;
      closeAtMs = Date.now();
      emit("child_close", signal ?? undefined);
      finish();
    });

    emit("stdin_write_started");
    child.stdin.write(stdin, () => {
      emit("stdin_write_completed");
      emit("stdin_end_called");
      child.stdin.end();
    });

    child.stdin.on("finish", () => {
      emit("stdin_finish");
      stdinFinished = true;
      void maybeStartContestantTimer();
      runningProbeTimer = setInterval(() => {
        void maybeStartContestantTimer();
      }, 50);
    });

    child.stdin.on("close", () => {
      emit("stdin_closed");
    });
  });

  const memoryKb = sampler.stop();

  const contestantRuntimeMs =
    contestantStartMs === null || closeAtMs === null
      ? 0
      : Math.max(0, closeAtMs - contestantStartMs);

  const oomKilled =
    timeoutCategory === "none" && exitCode !== 0 && exitCode !== null
      ? await wasOomKilled(containerName)
      : false;

  // Always clean up, whatever happened above (PRD §12 "automatic cleanup").
  await execFileAsync("docker", ["rm", "-f", containerName]).catch(() => { });

  const failureCategory = classifyFailure({
    timeoutCategory,
    infrastructureError,
    outputExceeded,
    exitCode,
    oomKilled,
  });

  return {
    exitCode,
    exitSignal,
    stdout,
    stderr,
    timedOut: failureCategory === "contestant_timeout",
    timeoutCategory,
    failureCategory,
    outputExceeded,
    oomKilled,
    timeoutFired,
    teardownTimeoutFired,
    killRequested,
    killCompleted,
    startupMs,
    runtimeMs: contestantRuntimeMs,
    wallTimeMs: Date.now() - start,
    lifecycleEvents: events,
    infrastructureError,
    memoryKb,
  };
}

export function classifyFailure(input: {
  timeoutCategory: TimeoutCategory;
  infrastructureError: string | null;
  outputExceeded: boolean;
  exitCode: number | null;
  oomKilled: boolean;
}): FailureCategory {
  if (input.timeoutCategory === "contestant_timeout") return "contestant_timeout";
  if (input.timeoutCategory === "startup_timeout") return "startup_timeout";
  if (input.timeoutCategory === "teardown_timeout") return "teardown_timeout";
  if (input.infrastructureError) return "infrastructure_failure";
  if (input.oomKilled) return "runtime_failure";
  if (input.outputExceeded) return "runtime_failure";
  if (input.exitCode !== 0) return "runtime_failure";
  return "none";
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

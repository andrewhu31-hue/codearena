import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseDockerMemUsageKb } from "./memoryUsage.js";

const execFileAsync = promisify(execFile);
const POLL_INTERVAL_MS = 30;

export interface MemorySampler {
  /** Stops polling and returns the peak sample seen, or null if none was captured. */
  stop: () => number | null;
}

/**
 * Best-effort peak memory tracking via repeated `docker stats` polls while
 * the container runs. This is inherently approximate: very short-lived
 * processes can finish between polls and leave no sample (memoryKb stays
 * null rather than a fabricated number), and it talks to the Docker daemon
 * rather than reading host cgroups, so it also works unmodified on Docker
 * Desktop (macOS/Windows), where the daemon runs inside its own VM and the
 * host has no direct view of container cgroups at all.
 */
export function startMemorySampling(containerName: string): MemorySampler {
  let peakKb: number | null = null;
  let stopped = false;

  const poll = async (): Promise<void> => {
    while (!stopped) {
      try {
        const { stdout } = await execFileAsync("docker", [
          "stats",
          "--no-stream",
          "--format",
          "{{.MemUsage}}",
          containerName,
        ]);
        const kb = parseDockerMemUsageKb(stdout.trim());
        // A reading of exactly 0 means the daemon's cgroup accounting
        // hasn't initialized yet (caught in the container's first instant),
        // not that the process is genuinely using no memory — discard it
        // rather than reporting a misleadingly precise "0KB".
        if (kb !== null && kb > 0 && (peakKb === null || kb > peakKb)) peakKb = kb;
      } catch {
        // Container not started yet, or already exited/removed — ignore.
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  };

  void poll();

  return {
    stop: () => {
      stopped = true;
      return peakKb;
    },
  };
}

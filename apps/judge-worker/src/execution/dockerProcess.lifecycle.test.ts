import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildRunArgs } from "./dockerArgs.js";
import { isDockerAvailable } from "./dockerAvailable.js";
import { createWorkspace, cleanupWorkspace, type Workspace } from "./workspace.js";
import {
  classifyFailure,
  runDockerContainer,
  type LifecycleEvent,
  type TimeoutCategory,
} from "./dockerProcess.js";

const describeIfDocker = isDockerAvailable() ? describe : describe.skip;
const PYTHON_IMAGE = "python:3.12-slim";
const PYTHON_CMD = ["python3", "/workspace/solution.py"];
const ECHO_SOURCE =
  "import sys\n" +
  "line = sys.stdin.readline()\n" +
  "if line.endswith('\\n'):\n" +
  "    line = line[:-1]\n" +
  "sys.stdout.write(line)\n";

function workspaceRoots() {
  const sharedRoot = process.env.JUDGE_TEST_SHARED_WORKSPACE;
  if (sharedRoot) {
    return { containerBase: sharedRoot, hostBase: sharedRoot };
  }
  const fallback = join(tmpdir(), "codearena-judge-test");
  return { containerBase: fallback, hostBase: fallback };
}

const usedContainerNames: string[] = [];

async function assertNoContainerLeak(containerName: string): Promise<void> {
  const output = execFileSync(
    "docker",
    ["ps", "-a", "--filter", `name=^/${containerName}$`, "--format", "{{.ID}}"],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  expect(output).toHaveLength(0);
}

afterEach(async () => {
  for (const name of usedContainerNames.splice(0)) {
    try {
      execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
    } catch {
      // Ignore removal failures; leak assertion below is the signal we care about.
    }
    await assertNoContainerLeak(name);
  }
}, 120_000);

describeIfDocker("runDockerContainer lifecycle telemetry", () => {
  it("runs one direct Python echo execution and captures lifecycle events", async () => {
    const workspace: Workspace = await createWorkspace(
      `diag-${randomUUID()}`,
      "solution.py",
      ECHO_SOURCE,
      workspaceRoots().containerBase,
      workspaceRoots().hostBase,
    );
    const containerName = `codearena-lifecycle-${randomUUID().slice(0, 8)}`;
    usedContainerNames.push(containerName);

    try {
      const args = buildRunArgs({
        name: containerName,
        image: PYTHON_IMAGE,
        workspaceDir: workspace.hostDir,
        readOnlyWorkspace: true,
        memoryMb: 256,
        command: PYTHON_CMD,
      });

      const events: LifecycleEvent[] = [];
      const result = await runDockerContainer(args, containerName, "hi\n", {
        contestantTimeoutMs: 5_000,
        startupTimeoutMs: 60_000,
        teardownTimeoutMs: 5_000,
        onLifecycleEvent: (event) => events.push(event),
      });

      expect(result.stdout).toBe("hi");
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
      expect(result.exitSignal).toBeNull();
      expect(result.timeoutFired).toBe(false);
      expect(result.timeoutCategory).toBe("none");
      expect(result.failureCategory).toBe("none");
      expect(result.runtimeMs).toBeLessThan(5_000);
      expect(result.wallTimeMs).toBeGreaterThanOrEqual(result.runtimeMs);

      const eventNames = new Set(events.map((e) => e.name));
      expect(eventNames.has("docker_spawn_requested")).toBe(true);
      expect(eventNames.has("child_spawned")).toBe(true);
      expect(eventNames.has("stdin_write_started")).toBe(true);
      expect(eventNames.has("stdin_write_completed")).toBe(true);
      expect(eventNames.has("stdin_end_called")).toBe(true);
      expect(eventNames.has("stdin_finish")).toBe(true);
      expect(eventNames.has("stdin_closed")).toBe(true);
      expect(eventNames.has("stdout_received")).toBe(true);
      expect(eventNames.has("child_exit")).toBe(true);
      expect(eventNames.has("child_close")).toBe(true);
    } finally {
      await cleanupWorkspace(workspace);
    }
  }, 180_000);

  it("handles multiple concurrent echo executions without leaked containers", async () => {
    const runs = Array.from({ length: 2 }).map(async (_, index) => {
      const workspace = await createWorkspace(
        `diag-concurrent-${index}-${randomUUID()}`,
        "solution.py",
        ECHO_SOURCE,
        workspaceRoots().containerBase,
        workspaceRoots().hostBase,
      );
      const containerName = `codearena-concurrent-${randomUUID().slice(0, 8)}`;
      usedContainerNames.push(containerName);

      try {
        const args = buildRunArgs({
          name: containerName,
          image: PYTHON_IMAGE,
          workspaceDir: workspace.hostDir,
          readOnlyWorkspace: true,
          memoryMb: 256,
          command: PYTHON_CMD,
        });

        const result = await runDockerContainer(args, containerName, `msg-${index}\n`, {
          contestantTimeoutMs: 8_000,
          startupTimeoutMs: 60_000,
          teardownTimeoutMs: 5_000,
        });
        return { index, result };
      } finally {
        await cleanupWorkspace(workspace);
      }
    });

    const settled = await Promise.all(runs);
    for (const { index, result } of settled) {
      expect(result.timeoutCategory).not.toBe("teardown_timeout");
      expect(result.failureCategory).not.toBe("teardown_timeout");
      if (result.failureCategory === "none") {
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe(`msg-${index}`);
      } else {
        expect(result.failureCategory).toBe("startup_timeout");
      }
    }
  }, 240_000);

  it("flags contestant timeout separately from startup/teardown telemetry categories", async () => {
    const workspace = await createWorkspace(
      `diag-timeout-${randomUUID()}`,
      "solution.py",
      "while True:\n    pass\n",
      workspaceRoots().containerBase,
      workspaceRoots().hostBase,
    );
    const containerName = `codearena-timeout-${randomUUID().slice(0, 8)}`;
    usedContainerNames.push(containerName);

    try {
      const args = buildRunArgs({
        name: containerName,
        image: PYTHON_IMAGE,
        workspaceDir: workspace.hostDir,
        readOnlyWorkspace: true,
        memoryMb: 256,
        command: PYTHON_CMD,
      });

      const result = await runDockerContainer(args, containerName, "", {
        contestantTimeoutMs: 300,
        startupTimeoutMs: 60_000,
        teardownTimeoutMs: 20_000,
      });

      expect(result.timeoutCategory).toBe("contestant_timeout");
      expect(result.failureCategory).toBe("contestant_timeout");
      expect(result.timeoutFired).toBe(true);
      expect(result.killRequested).toBe(true);
    } finally {
      await cleanupWorkspace(workspace);
    }
  }, 240_000);

  it("classifies very slow startup as startup_timeout", async () => {
    const workspace = await createWorkspace(
      `diag-startup-timeout-${randomUUID()}`,
      "solution.py",
      ECHO_SOURCE,
      workspaceRoots().containerBase,
      workspaceRoots().hostBase,
    );
    const containerName = `codearena-startup-timeout-${randomUUID().slice(0, 8)}`;
    usedContainerNames.push(containerName);

    try {
      const args = buildRunArgs({
        name: containerName,
        image: PYTHON_IMAGE,
        workspaceDir: workspace.hostDir,
        readOnlyWorkspace: true,
        memoryMb: 256,
        command: PYTHON_CMD,
      });

      const result = await runDockerContainer(args, containerName, "x\n", {
        contestantTimeoutMs: 10_000,
        startupTimeoutMs: 1,
        teardownTimeoutMs: 5_000,
      });

      expect(result.timeoutCategory).toBe("startup_timeout");
      expect(result.failureCategory).toBe("startup_timeout");
      expect(result.timedOut).toBe(false);
    } finally {
      await cleanupWorkspace(workspace);
    }
  }, 240_000);

  it("classifies teardown overrun as teardown_timeout", async () => {
    const workspace = await createWorkspace(
      `diag-teardown-timeout-${randomUUID()}`,
      "solution.py",
      "while True:\n    pass\n",
      workspaceRoots().containerBase,
      workspaceRoots().hostBase,
    );
    const containerName = `codearena-teardown-timeout-${randomUUID().slice(0, 8)}`;
    usedContainerNames.push(containerName);

    try {
      const args = buildRunArgs({
        name: containerName,
        image: PYTHON_IMAGE,
        workspaceDir: workspace.hostDir,
        readOnlyWorkspace: true,
        memoryMb: 256,
        command: PYTHON_CMD,
      });

      const result = await runDockerContainer(args, containerName, "", {
        contestantTimeoutMs: 250,
        startupTimeoutMs: 60_000,
        teardownTimeoutMs: 1,
      });

      expect(result.timeoutCategory).toBe("teardown_timeout");
      expect(result.failureCategory).toBe("teardown_timeout");
      expect(result.timedOut).toBe(false);
      expect(result.teardownTimeoutFired).toBe(true);
    } finally {
      await cleanupWorkspace(workspace);
    }
  }, 240_000);
});

describe("classifyFailure telemetry categories", () => {
  const base = {
    infrastructureError: null,
    outputExceeded: false,
    exitCode: 0,
    oomKilled: false,
  };

  it.each<[TimeoutCategory, ReturnType<typeof classifyFailure>]>([
    ["contestant_timeout", "contestant_timeout"],
    ["startup_timeout", "startup_timeout"],
    ["teardown_timeout", "teardown_timeout"],
    ["none", "none"],
  ])("maps timeoutCategory %s", (timeoutCategory, expected) => {
    expect(classifyFailure({ ...base, timeoutCategory })).toBe(expected);
  });

  it("detects infrastructure failures when process-level errors are present", () => {
    expect(
      classifyFailure({
        ...base,
        timeoutCategory: "none",
        infrastructureError: "spawn docker ENOENT",
      }),
    ).toBe("infrastructure_failure");
  });
});

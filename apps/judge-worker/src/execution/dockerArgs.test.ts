import { describe, expect, it } from "vitest";
import { buildRunArgs } from "./dockerArgs.js";

const baseOpts = {
  name: "codearena-test-container",
  image: "python:3.12-slim",
  workspaceDir: "/tmp/workspace-abc",
  memoryMb: 256,
  command: ["python3", "/workspace/solution.py"],
};

describe("buildRunArgs", () => {
  it("disables networking", () => {
    const args = buildRunArgs({ ...baseOpts, readOnlyWorkspace: true });
    expect(args).toContain("--network");
    expect(args[args.indexOf("--network") + 1]).toBe("none");
  });

  it("runs as a fixed non-root, non-privileged UID", () => {
    const args = buildRunArgs({ ...baseOpts, readOnlyWorkspace: true });
    const userIndex = args.indexOf("--user");
    expect(userIndex).toBeGreaterThan(-1);
    const [uid, gid] = (args[userIndex + 1] as string).split(":");
    expect(Number(uid)).toBeGreaterThan(0);
    expect(Number(gid)).toBeGreaterThan(0);
  });

  it("drops all capabilities and blocks privilege escalation", () => {
    const args = buildRunArgs({ ...baseOpts, readOnlyWorkspace: true });
    expect(args).toContain("--cap-drop");
    expect(args[args.indexOf("--cap-drop") + 1]).toBe("ALL");
    expect(args).toContain("no-new-privileges");
  });

  it("caps memory, cpus, and process count", () => {
    const args = buildRunArgs({ ...baseOpts, readOnlyWorkspace: true, memoryMb: 512 });
    expect(args[args.indexOf("--memory") + 1]).toBe("512m");
    expect(args[args.indexOf("--memory-swap") + 1]).toBe("512m");
    expect(args[args.indexOf("--cpus") + 1]).toBe("1");
    expect(args[args.indexOf("--pids-limit") + 1]).toBe("64");
  });

  it("makes the root filesystem read-only with only a small writable tmpfs", () => {
    const args = buildRunArgs({ ...baseOpts, readOnlyWorkspace: true });
    expect(args).toContain("--read-only");
    expect(args[args.indexOf("--tmpfs") + 1]).toBe("/tmp:rw,size=64m");
  });

  it("mounts the workspace read-only for execution runs", () => {
    const args = buildRunArgs({ ...baseOpts, readOnlyWorkspace: true });
    const mountIndex = args.indexOf("-v");
    expect(args[mountIndex + 1]).toBe(`${baseOpts.workspaceDir}:/workspace:ro`);
  });

  it("mounts the workspace read-write only for the compile step", () => {
    const args = buildRunArgs({ ...baseOpts, readOnlyWorkspace: false });
    const mountIndex = args.indexOf("-v");
    expect(args[mountIndex + 1]).toBe(`${baseOpts.workspaceDir}:/workspace:rw`);
  });

  it("never mounts the Docker socket or any other host path", () => {
    const args = buildRunArgs({ ...baseOpts, readOnlyWorkspace: false });
    const mounts = args.filter((_, i) => args[i - 1] === "-v");
    expect(mounts).toHaveLength(1);
    expect(mounts[0]).not.toContain("docker.sock");
  });

  it("never runs privileged", () => {
    const args = buildRunArgs({ ...baseOpts, readOnlyWorkspace: true });
    expect(args).not.toContain("--privileged");
  });

  it("appends the given command after the image", () => {
    const args = buildRunArgs({ ...baseOpts, readOnlyWorkspace: true });
    expect(args.slice(-2)).toEqual(["python3", "/workspace/solution.py"]);
  });
});

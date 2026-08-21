import { randomUUID } from "node:crypto";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface Workspace {
  /** Path judge-worker itself reads/writes through. */
  containerDir: string;
  /**
   * Path the Docker daemon should use when mounting this workspace into a
   * sandbox container. Equal to `containerDir` unless judge-worker itself
   * is running inside a container talking to the host's Docker daemon
   * (Docker-outside-of-Docker) — see docs/judge-security.md.
   */
  hostDir: string;
}

/**
 * Creates a unique, per-submission directory containing only that
 * submission's own source file — never a broader host path (PRD §12 "no
 * sensitive host mounts"). Made world-writable: the sandbox container runs
 * as a fixed non-root UID that won't match the host/judge-worker user, and
 * the compile step needs to write its output binary here. This is safe
 * specifically because the directory is freshly created, uniquely named,
 * holds nothing but this one submission's files, and is deleted
 * immediately after use.
 */
export async function createWorkspace(
  submissionId: string,
  sourceFilename: string,
  sourceCode: string,
  containerBaseDir: string,
  hostBaseDir: string,
): Promise<Workspace> {
  const name = `codearena-judge-${submissionId}-${randomUUID().slice(0, 8)}`;
  const containerDir = path.join(containerBaseDir, name);
  const hostDir = path.join(hostBaseDir, name);

  await mkdir(containerDir, { recursive: true });
  await chmod(containerDir, 0o777);
  await writeFile(path.join(containerDir, sourceFilename), sourceCode, { mode: 0o644 });

  return { containerDir, hostDir };
}

export async function cleanupWorkspace(workspace: Workspace): Promise<void> {
  await rm(workspace.containerDir, { recursive: true, force: true });
}

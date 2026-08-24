import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRunArgs } from "./dockerArgs.js";
import { runDockerContainer } from "./dockerProcess.js";
import { createWorkspace, cleanupWorkspace } from "./workspace.js";

async function main() {
    const sourceCode =
        "# isolated-direct\n" +
        "import sys\n" +
        "line = sys.stdin.readline()\n" +
        "if line.endswith('\\n'):\n" +
        "    line = line[:-1]\n" +
        "sys.stdout.write(line)\n";

    const input = "hi\n";
    const workspace = await createWorkspace(
        `diag-${randomUUID()}`,
        "solution.py",
        sourceCode,
        join(tmpdir(), "codearena-judge-test"),
        join(tmpdir(), "codearena-judge-test"),
    );

    const containerName = `codearena-direct-${randomUUID().slice(0, 8)}`;
    const args = buildRunArgs({
        name: containerName,
        image: "python:3.12-slim",
        workspaceDir: workspace.hostDir,
        readOnlyWorkspace: true,
        memoryMb: 256,
        command: ["python3", "/workspace/solution.py"],
    });

    const started = Date.now();
    const result = await runDockerContainer(args, containerName, input, {
        contestantTimeoutMs: 5000,
        startupTimeoutMs: 60000,
        teardownTimeoutMs: 5000,
    });
    const ended = Date.now();

    await cleanupWorkspace(workspace);

    console.log(
        JSON.stringify(
            {
                dockerCommand: ["docker", ...args].join(" "),
                image: "python:3.12-slim",
                input,
                sourceCode,
                wallMeasuredMs: ended - started,
                result,
            },
            null,
            2,
        ),
    );
}

void main();

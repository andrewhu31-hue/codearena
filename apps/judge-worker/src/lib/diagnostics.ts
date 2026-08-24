import { monitorEventLoopDelay } from "node:perf_hooks";
import type { Redis } from "ioredis";

export function inferPrismaPoolSize(databaseUrl: string): number | null {
    try {
        const url = new URL(databaseUrl);
        const limit = url.searchParams.get("connection_limit");
        if (!limit) return null;
        const parsed = Number(limit);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    } catch {
        return null;
    }
}

export function startEventLoopDelayMonitor(
    logger: { info: (obj: Record<string, unknown>, msg: string) => void },
    intervalMs = 10_000,
): NodeJS.Timeout {
    const histogram = monitorEventLoopDelay({ resolution: 20 });
    histogram.enable();

    const timer = setInterval(() => {
        const nsToMs = 1_000_000;
        logger.info(
            {
                eventLoopDelayMs: {
                    p50: Number((histogram.percentile(50) / nsToMs).toFixed(3)),
                    p95: Number((histogram.percentile(95) / nsToMs).toFixed(3)),
                    max: Number((histogram.max / nsToMs).toFixed(3)),
                },
            },
            "Node event-loop delay snapshot",
        );
        histogram.reset();
    }, intervalMs);

    if (typeof timer.unref === "function") timer.unref();
    return timer;
}

export function instrumentRedisCommandLatency(
    redis: Redis,
    label: string,
    logger: { debug: (obj: Record<string, unknown>, msg: string) => void; warn: (obj: Record<string, unknown>, msg: string) => void },
): void {
    const redisWithPatchedSend = redis as Redis & {
        sendCommand: (command: { name?: string; args?: unknown[] }) => Promise<unknown>;
    };
    const originalSendCommand = redisWithPatchedSend.sendCommand.bind(redisWithPatchedSend);

    redisWithPatchedSend.sendCommand = async (command: { name?: string; args?: unknown[] }) => {
        const startedAt = Date.now();
        try {
            const result = await originalSendCommand(command);
            const latencyMs = Date.now() - startedAt;
            const args = Array.isArray(command.args) ? command.args : [];
            const lockRelated = args.some((arg) => String(arg).includes(":lock"));
            const payload = {
                redisCommand: String(command.name || "unknown").toLowerCase(),
                redisLatencyMs: latencyMs,
                redisClientLabel: label,
                lockRelated,
            };
            if (lockRelated || latencyMs >= 250) {
                logger.warn(payload, "Redis command latency observed");
            } else {
                logger.debug(payload, "Redis command latency observed");
            }
            return result;
        } catch (err) {
            logger.warn(
                {
                    err,
                    redisCommand: String(command.name || "unknown").toLowerCase(),
                    redisClientLabel: label,
                    redisLatencyMs: Date.now() - startedAt,
                },
                "Redis command failed",
            );
            throw err;
        }
    };
}

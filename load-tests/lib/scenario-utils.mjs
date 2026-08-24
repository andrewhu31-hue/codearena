export function mapVuToUser(vuNumber, users) {
    if (!Array.isArray(users) || users.length === 0) {
        throw new Error("users must be a non-empty array");
    }
    if (!Number.isInteger(vuNumber) || vuNumber < 1) {
        throw new Error("vuNumber must be a positive integer");
    }
    return users[(vuNumber - 1) % users.length];
}

export function buildIdempotencyKey(runTag, userId) {
    if (!runTag || !userId) throw new Error("runTag and userId are required");
    return `${runTag}:${userId}`;
}

export function parseRetryAfterToMs(headerValue, nowMs = Date.now()) {
    if (!headerValue || typeof headerValue !== "string") return null;
    const trimmed = headerValue.trim();
    if (!trimmed) return null;

    const asSeconds = Number(trimmed);
    if (Number.isFinite(asSeconds) && asSeconds >= 0) {
        return Math.round(asSeconds * 1000);
    }

    const dateMs = Date.parse(trimmed);
    if (Number.isFinite(dateMs)) {
        const delta = dateMs - nowMs;
        return delta > 0 ? delta : 0;
    }

    return null;
}

export function computeBackoffDelayMs({
    attempt,
    baseMs,
    capMs,
    jitterRatio,
    rng,
    retryAfterMs,
}) {
    const safeAttempt = Math.max(0, Number(attempt) || 0);
    const safeBase = Math.max(1, Number(baseMs) || 1);
    const safeCap = Math.max(safeBase, Number(capMs) || safeBase);
    const safeJitter = Math.max(0, Math.min(1, Number(jitterRatio) || 0));

    const exp = Math.min(safeCap, safeBase * 2 ** safeAttempt);
    const random = typeof rng === "function" ? rng() : Math.random();
    const boundedRandom = Math.max(0, Math.min(1, Number.isFinite(random) ? random : 0));
    const jitter = exp * safeJitter * boundedRandom;
    const backoff = Math.min(safeCap, Math.round(exp + jitter));

    if (typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
        return Math.min(safeCap, Math.max(backoff, Math.round(retryAfterMs)));
    }

    return backoff;
}

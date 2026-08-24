export interface BoundedRetryOptions {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    shouldRetry: (err: unknown) => boolean;
    onRetry?: (ctx: { err: unknown; attempt: number; backoffMs: number }) => void;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withBoundedRetry<T>(
    op: (attempt: number) => Promise<T>,
    options: BoundedRetryOptions,
): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
        try {
            return await op(attempt);
        } catch (err) {
            lastError = err;
            if (!options.shouldRetry(err) || attempt === options.maxAttempts) throw err;
            const backoffMs = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (attempt - 1));
            options.onRetry?.({ err, attempt, backoffMs });
            await delay(backoffMs);
        }
    }
    throw lastError;
}

export function hasPrismaCode(err: unknown, code: string): boolean {
    return (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: unknown }).code === code
    );
}

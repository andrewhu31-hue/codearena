export function computeQueueWaitMs(startedAtMs: number, queuedAtMs: number | undefined): number {
  if (!Number.isFinite(startedAtMs) || queuedAtMs === undefined || !Number.isFinite(queuedAtMs)) {
    return 0;
  }

  return Math.max(0, startedAtMs - queuedAtMs);
}

export function assertQueueWaitMsWithinBound(queueWaitMs: number, maxExpectedMs: number): void {
  if (!Number.isFinite(queueWaitMs) || queueWaitMs < 0) {
    throw new Error(`queueWaitMs must be a finite non-negative number, got ${queueWaitMs}`);
  }

  if (!Number.isFinite(maxExpectedMs) || maxExpectedMs <= 0) {
    throw new Error(`maxExpectedMs must be a finite positive number, got ${maxExpectedMs}`);
  }

  if (queueWaitMs > maxExpectedMs) {
    throw new Error(`queueWaitMs ${queueWaitMs}ms exceeded max expected ${maxExpectedMs}ms`);
  }
}

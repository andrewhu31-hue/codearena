const UNIT_MULTIPLIERS_TO_KB: Record<string, number> = {
  b: 1 / 1024,
  kib: 1,
  kb: 1,
  mib: 1024,
  mb: 1024,
  gib: 1024 * 1024,
  gb: 1024 * 1024,
};

/**
 * Parses the "used" side of `docker stats --format {{.MemUsage}}` output,
 * e.g. "12.34MiB / 512MiB" -> ~12636 (KB). Returns null for anything
 * unparseable rather than guessing, since this feeds a resource-usage
 * number we report back to users.
 */
export function parseDockerMemUsageKb(memUsage: string): number | null {
  const used = memUsage.split("/")[0]?.trim();
  if (!used) return null;

  const match = /^([\d.]+)\s*([a-zA-Z]+)$/.exec(used);
  if (!match) return null;

  const amount = Number(match[1]);
  const multiplier = UNIT_MULTIPLIERS_TO_KB[(match[2] as string).toLowerCase()];
  if (!Number.isFinite(amount) || multiplier === undefined) return null;

  return Math.round(amount * multiplier);
}

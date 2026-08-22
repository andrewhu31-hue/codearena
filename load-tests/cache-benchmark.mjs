// Reproducible benchmark comparing a PostgreSQL leaderboard read against
// the equivalent Redis sorted-set read (PRD §17). Seeds its own dataset,
// measures both, captures a real `EXPLAIN ANALYZE` query plan, writes
// JSON + Markdown, and cleans up after itself. Every number here comes
// from this run — nothing is hardcoded (PRD §1/§22).
//
// Usage: DATABASE_URL=... REDIS_URL=... node cache-benchmark.mjs
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Redis } from "ioredis";
import { prisma } from "@codearena/database";

const DATASET_SIZE = Number(process.env.BENCHMARK_DATASET_SIZE || 1000);
const ITERATIONS = Number(process.env.BENCHMARK_ITERATIONS || 200);
const TOP_N = 100;
const PENALTY_TIEBREAK_MULTIPLIER = 1_000_000_000; // matches apps/api/src/services/contest.service.ts

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) throw new Error("REDIS_URL is required");
const redis = new Redis(REDIS_URL);

function percentile(sortedAsc, p) {
  const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
  return sortedAsc[idx];
}

function stats(samplesMs) {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    avgMs: sum / sorted.length,
    minMs: sorted[0],
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    maxMs: sorted[sorted.length - 1],
  };
}

async function main() {
  const stamp = Date.now();
  const contest = await prisma.contest.create({
    data: {
      name: `Cache Benchmark ${stamp}`,
      startTime: new Date(Date.now() - 3_600_000),
      endTime: new Date(Date.now() + 3_600_000),
      visibility: "PRIVATE",
    },
  });

  console.log(`Seeding ${DATASET_SIZE} users + contest scores...`);
  const userRows = Array.from({ length: DATASET_SIZE }, (_, i) => ({
    id: randomUUID(),
    email: `cachebench-${stamp}-${i}@example.com`,
    username: `cachebench${stamp}${i}`,
    passwordHash: "x",
  }));
  await prisma.user.createMany({ data: userRows });

  const scoreRows = userRows.map((u) => ({
    contestId: contest.id,
    userId: u.id,
    score: Math.floor(Math.random() * 1000),
    solvedCount: Math.floor(Math.random() * 10),
    penaltyMs: Math.floor(Math.random() * 3_600_000),
  }));
  await prisma.contestScore.createMany({ data: scoreRows });

  const leaderboardKey = `benchmark:leaderboard:${contest.id}`;
  const zaddArgs = [];
  for (const row of scoreRows) {
    const combined = row.score * PENALTY_TIEBREAK_MULTIPLIER - Math.floor(row.penaltyMs / 60_000);
    zaddArgs.push(combined, row.userId);
  }
  await redis.zadd(leaderboardKey, ...zaddArgs);

  const readFromPostgres = () =>
    prisma.contestScore.findMany({
      where: { contestId: contest.id },
      orderBy: [{ score: "desc" }, { penaltyMs: "asc" }],
      take: TOP_N,
    });
  const readFromRedis = () => redis.zrevrange(leaderboardKey, 0, TOP_N - 1);

  // Warm up both backends once (connection/plan-cache) before measuring.
  await readFromPostgres();
  await readFromRedis();

  console.log(`Running ${ITERATIONS} sequential iterations of each read...`);
  const pgSamples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await readFromPostgres();
    pgSamples.push(performance.now() - start);
  }

  const redisSamples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await readFromRedis();
    redisSamples.push(performance.now() - start);
  }

  const explainRows = await prisma.$queryRawUnsafe(
    `EXPLAIN ANALYZE SELECT * FROM contest_scores WHERE "contestId" = $1 ORDER BY score DESC, "penaltyMs" ASC LIMIT ${TOP_N}`,
    contest.id,
  );
  const queryPlan = explainRows.map((r) => Object.values(r)[0]).join("\n");

  const pgStats = stats(pgSamples);
  const redisStats = stats(redisSamples);
  const p95ImprovementPct = ((pgStats.p95Ms - redisStats.p95Ms) / pgStats.p95Ms) * 100;

  const result = {
    generatedAt: new Date().toISOString(),
    environment: "local developer machine (see load-tests/README.md)",
    datasetSize: DATASET_SIZE,
    topN: TOP_N,
    iterations: ITERATIONS,
    postgres: pgStats,
    redis: redisStats,
    p95ImprovementPct,
  };

  const resultsDir = fileURLToPath(new URL("./results", import.meta.url));
  writeFileSync(`${resultsDir}/cache-benchmark.json`, JSON.stringify(result, null, 2));

  const md = `# PostgreSQL vs Redis leaderboard read benchmark

Generated ${result.generatedAt}. Environment: ${result.environment}.

Dataset: ${DATASET_SIZE} \`ContestScore\` rows for one contest. Query: top ${TOP_N} ranked by
score desc, penalty asc. ${ITERATIONS} sequential iterations per backend, same process, both
warmed up once before measuring.

| Backend    | avg          | p50          | p95          | p99          | max          |
| ---------- | ------------ | ------------ | ------------ | ------------ | ------------ |
| PostgreSQL | ${pgStats.avgMs.toFixed(3)}ms | ${pgStats.p50Ms.toFixed(3)}ms | ${pgStats.p95Ms.toFixed(3)}ms | ${pgStats.p99Ms.toFixed(3)}ms | ${pgStats.maxMs.toFixed(3)}ms |
| Redis      | ${redisStats.avgMs.toFixed(3)}ms | ${redisStats.p50Ms.toFixed(3)}ms | ${redisStats.p95Ms.toFixed(3)}ms | ${redisStats.p99Ms.toFixed(3)}ms | ${redisStats.maxMs.toFixed(3)}ms |

Redis p95 was **${Math.abs(p95ImprovementPct).toFixed(1)}% ${p95ImprovementPct >= 0 ? "faster" : "slower"}** than PostgreSQL for this query, dataset size, and machine.

## PostgreSQL query plan (\`EXPLAIN ANALYZE\`)

\`\`\`
${queryPlan}
\`\`\`
`;
  writeFileSync(`${resultsDir}/cache-benchmark.md`, md);

  console.log("PostgreSQL:", pgStats);
  console.log("Redis:", redisStats);
  console.log(`Redis p95 improvement: ${p95ImprovementPct.toFixed(1)}%`);

  console.log("Cleaning up...");
  await prisma.contestScore.deleteMany({ where: { contestId: contest.id } });
  await prisma.contest.delete({ where: { id: contest.id } });
  await prisma.user.deleteMany({ where: { id: { in: userRows.map((u) => u.id) } } });
  await redis.del(leaderboardKey);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await redis.quit();
  });

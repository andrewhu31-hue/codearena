// Turns each scenario's `k6 --summary-export` JSON into one Markdown
// report. Never fabricates a number: a scenario that wasn't run is
// reported as "not run", not omitted or guessed at (PRD §17/§22).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const resultsDir = fileURLToPath(new URL("./results", import.meta.url));

const scenarios = [
  { name: "General API traffic", file: "general-traffic-summary.json" },
  { name: "Contest-start spike", file: "contest-spike-summary.json" },
  { name: "Concurrent submissions", file: "concurrent-submissions-summary.json" },
];

function fmt(n) {
  return typeof n === "number" ? n.toFixed(2) : "—";
}

// k6's --summary-export JSON puts each metric's fields directly on the
// metric object (no nested "values" key). Shape depends on metric type:
// counters have {count, rate}; rates have {passes, fails, value};
// trends have {avg, min, med, max, "p(90)", "p(95)", ...}.
function metricLine(metrics, key, label) {
  const metric = metrics[key];
  if (!metric) return `- ${label}: not recorded`;

  if (metric.value !== undefined && (metric.passes !== undefined || metric.fails !== undefined)) {
    return `- ${label}: ${fmt(metric.value * 100)}%`;
  }
  if (metric.avg === undefined && metric.count !== undefined) {
    return `- ${label}: count=${metric.count} (${fmt(metric.rate)}/s)`;
  }
  return (
    `- ${label}: avg=${fmt(metric.avg)}ms min=${fmt(metric.min)}ms med=${fmt(metric.med)}ms ` +
    `p90=${fmt(metric["p(90)"])}ms p95=${fmt(metric["p(95)"])}ms max=${fmt(metric.max)}ms`
  );
}

let md = `# k6 load test summary\n\nGenerated ${new Date().toISOString()}.\n\n`;
md +=
  "Environment: a single local developer machine (see `load-tests/README.md` for exact specs " +
  "and commands) — not production infrastructure. Treat these as relative, reproducible numbers " +
  "from this run, not a performance claim about any deployed environment.\n\n";

for (const scenario of scenarios) {
  const path = `${resultsDir}/${scenario.file}`;
  md += `## ${scenario.name}\n\n`;
  if (!existsSync(path)) {
    md += "_Not run._\n\n";
    continue;
  }

  const summary = JSON.parse(readFileSync(path, "utf8"));
  const metrics = summary.metrics ?? {};

  md += `- Iterations: ${metrics.iterations?.count ?? "—"} (${fmt(metrics.iterations?.rate)}/s)\n`;
  md += `- Requests: ${metrics.http_reqs?.count ?? "—"} (${fmt(metrics.http_reqs?.rate)}/s)\n`;
  md += metricLine(metrics, "http_req_duration", "Request duration") + "\n";
  md += metricLine(metrics, "http_req_failed", "Request failure rate") + "\n";
  if (metrics.judge_duration_ms) {
    md += metricLine(metrics, "judge_duration_ms", "Judge duration (submit → terminal)") + "\n";
  }
  if (metrics.submissions_accepted) {
    md += metricLine(metrics, "submissions_accepted", "Submissions accepted") + "\n";
  }
  if (metrics.submissions_not_judged_in_time) {
    md +=
      metricLine(metrics, "submissions_not_judged_in_time", "Not judged within the poll window") +
      "\n";
  }
  md += "\n";
}

writeFileSync(`${resultsDir}/summary.md`, md);
console.log(`Wrote ${resultsDir}/summary.md`);

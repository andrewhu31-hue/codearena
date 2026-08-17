import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // Prevent accidental leakage of submitted source into logs (PRD §15).
  redact: { paths: ["*.sourceCode"], censor: "[REDACTED]" },
});

import { z } from "zod";

export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const LANGUAGES = ["PYTHON", "JAVASCRIPT", "CPP"] as const;
export type Language = (typeof LANGUAGES)[number];

export const exampleSchema = z.object({
  input: z.string(),
  output: z.string(),
  explanation: z.string().optional(),
});
export type ProblemExample = z.infer<typeof exampleSchema>;

export const testCaseInputSchema = z.object({
  input: z.string(),
  expectedOutput: z.string(),
});
export type TestCaseInput = z.infer<typeof testCaseInputSchema>;

export const createProblemSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be lowercase, hyphen-separated"),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(1),
  difficulty: z.enum(DIFFICULTIES),
  inputFormat: z.string().trim().default(""),
  outputFormat: z.string().trim().default(""),
  constraints: z.string().trim().default(""),
  examples: z.array(exampleSchema).default([]),
  timeLimitMs: z.number().int().positive().max(30_000).default(1000),
  memoryLimitMb: z.number().int().positive().max(1024).default(256),
  supportedLanguages: z.array(z.enum(LANGUAGES)).min(1),
  sampleTests: z.array(testCaseInputSchema).default([]),
  hiddenTests: z.array(testCaseInputSchema).default([]),
});
export type CreateProblemInput = z.infer<typeof createProblemSchema>;

export const updateProblemSchema = createProblemSchema
  .omit({ slug: true, sampleTests: true, hiddenTests: true })
  .partial()
  .extend({
    sampleTests: z.array(testCaseInputSchema).optional(),
    hiddenTests: z.array(testCaseInputSchema).optional(),
  });
export type UpdateProblemInput = z.infer<typeof updateProblemSchema>;

export interface ProblemSummary {
  id: string;
  slug: string;
  title: string;
  difficulty: Difficulty;
  supportedLanguages: Language[];
}

export interface ProblemDetail extends ProblemSummary {
  description: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  examples: ProblemExample[];
  timeLimitMs: number;
  memoryLimitMb: number;
  sampleTests: TestCaseInput[];
}

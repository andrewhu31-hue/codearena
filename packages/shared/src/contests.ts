import { z } from "zod";

export const CONTEST_VISIBILITIES = ["PUBLIC", "PRIVATE"] as const;
export type ContestVisibility = (typeof CONTEST_VISIBILITIES)[number];

export const CONTEST_STATUSES = ["UPCOMING", "ACTIVE", "ENDED"] as const;
export type ContestStatus = (typeof CONTEST_STATUSES)[number];

export const contestProblemInputSchema = z.object({
  problemId: z.string().uuid(),
  points: z.number().int().positive().max(10_000).default(100),
  order: z.number().int().min(0).default(0),
});
export type ContestProblemInput = z.infer<typeof contestProblemInputSchema>;

export const createContestSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().default(""),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    visibility: z.enum(CONTEST_VISIBILITIES).default("PRIVATE"),
    problems: z.array(contestProblemInputSchema).default([]),
  })
  .refine((input) => input.endTime > input.startTime, {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });
export type CreateContestInput = z.infer<typeof createContestSchema>;

export const updateContestSchema = z
  .object({
    name: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().optional(),
    startTime: z.coerce.date().optional(),
    endTime: z.coerce.date().optional(),
    visibility: z.enum(CONTEST_VISIBILITIES).optional(),
    problems: z.array(contestProblemInputSchema).optional(),
  })
  .refine((input) => !input.startTime || !input.endTime || input.endTime > input.startTime, {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });
export type UpdateContestInput = z.infer<typeof updateContestSchema>;

export interface ContestSummary {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  visibility: ContestVisibility;
  status: ContestStatus;
}

export interface ContestProblemSummary {
  problemId: string;
  slug: string;
  title: string;
  points: number;
  order: number;
}

export interface ContestDetail extends ContestSummary {
  description: string;
  problems: ContestProblemSummary[];
  isRegistered: boolean;
}

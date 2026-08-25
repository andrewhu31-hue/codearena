export const SUBMISSION_QUEUE_NAME = "submissions";

export function resolveSubmissionQueueName(source: NodeJS.ProcessEnv = process.env): string {
  const configured = source.SUBMISSION_QUEUE_NAME?.trim();
  return configured || SUBMISSION_QUEUE_NAME;
}

export interface SubmissionJobData {
  submissionId: string;
}

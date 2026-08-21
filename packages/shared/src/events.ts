import type { SubmissionStatus, Verdict } from "./submissions.js";

/**
 * Redis pub/sub channel judge-worker publishes to and every API instance
 * subscribes to, so a change made by the worker (which has no Socket.IO
 * server of its own) reaches Socket.IO clients connected to any API
 * replica. Distinct from the `@socket.io/redis-adapter`'s own internal
 * channels, which only fan `io.emit()` calls out across API instances.
 */
export const REALTIME_CHANNEL = "codearena:realtime";

export interface SubmissionRealtimeEvent {
  type: "submission";
  submissionId: string;
  userId: string;
  status: SubmissionStatus;
  verdict: Verdict | null;
  testsPassed: number;
  testsTotal: number;
}

export interface LeaderboardRealtimeEvent {
  type: "leaderboard";
  contestId: string;
}

export type RealtimeEvent = SubmissionRealtimeEvent | LeaderboardRealtimeEvent;

export const socketRoom = {
  submission: (submissionId: string) => `submission:${submissionId}`,
  contest: (contestId: string) => `contest:${contestId}`,
};

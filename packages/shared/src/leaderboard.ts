export interface LeaderboardProblemResult {
  problemId: string;
  attempts: number;
  solved: boolean;
  /** Minutes from contest start to the accepted submission; null unless solved. */
  penaltyMinutes: number | null;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  score: number;
  solvedCount: number;
  penaltyMs: number;
  problems: LeaderboardProblemResult[];
}

export interface LeaderboardResponse {
  contestId: string;
  entries: LeaderboardEntry[];
}

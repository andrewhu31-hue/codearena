"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { contestsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useLeaderboardRealtime } from "@/lib/realtime";
import { NavBar } from "../../../components/NavBar";

export function LeaderboardView({ contestId }: { contestId: string }) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["leaderboard", contestId];

  const query = useQuery({
    queryKey,
    queryFn: () => contestsApi.getLeaderboard(contestId),
    // Safety-net poll; Socket.IO pushes an instant refetch below when it's connected.
    refetchInterval: 10_000,
  });

  useLeaderboardRealtime(accessToken, contestId, () => {
    void queryClient.invalidateQueries({ queryKey });
  });

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Leaderboard</h1>
          <Link
            href={`/contests/${contestId}`}
            className="text-sm text-indigo-400 hover:text-indigo-300"
          >
            Back to contest
          </Link>
        </div>

        {query.isLoading && <p className="mt-6 text-slate-400">Loading leaderboard…</p>}
        {query.isError && (
          <p className="mt-6 text-sm text-red-400">Could not reach the server. Try again.</p>
        )}

        {query.data && query.data.entries.length === 0 && (
          <p className="mt-6 text-slate-400">No one has scored yet.</p>
        )}

        {query.data && query.data.entries.length > 0 && (
          <table className="mt-6 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-slate-500">
                <th className="pb-2 font-normal">Rank</th>
                <th className="pb-2 font-normal">User</th>
                <th className="pb-2 font-normal">Score</th>
                <th className="pb-2 font-normal">Solved</th>
                <th className="pb-2 font-normal">Penalty</th>
              </tr>
            </thead>
            <tbody>
              {query.data.entries.map((entry) => (
                <tr key={entry.userId} className="border-b border-slate-900">
                  <td className="py-2 text-slate-400">{entry.rank}</td>
                  <td className="py-2 text-slate-200">{entry.username}</td>
                  <td className="py-2 text-slate-200">{entry.score}</td>
                  <td className="py-2 text-slate-400">{entry.solvedCount}</td>
                  <td className="py-2 text-slate-400">{Math.round(entry.penaltyMs / 60_000)}m</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}

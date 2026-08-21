"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiRequestError, contestsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { NavBar } from "../../components/NavBar";

export function ContestDetailView({ contestId }: { contestId: string }) {
  const { user, accessToken, status: authStatus } = useAuth();
  const queryClient = useQueryClient();

  const contestQuery = useQuery({
    queryKey: ["contest", contestId, Boolean(accessToken)],
    queryFn: () => contestsApi.getById(accessToken, contestId),
    enabled: authStatus !== "loading",
  });

  const registerMutation = useMutation({
    mutationFn: () => contestsApi.register(accessToken as string, contestId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contest", contestId] });
    },
  });

  const contest = contestQuery.data;

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-3xl px-6 py-16">
        {contestQuery.isLoading && <p className="text-slate-400">Loading contest…</p>}

        {contestQuery.isError && (
          <div className="text-sm text-red-400">
            {contestQuery.error instanceof ApiRequestError && contestQuery.error.status === 404 ? (
              <p>This contest doesn&apos;t exist.</p>
            ) : (
              <p>Could not reach the server. Try again.</p>
            )}
            <Link
              href="/contests"
              className="mt-2 inline-block text-indigo-400 hover:text-indigo-300"
            >
              Back to contests
            </Link>
          </div>
        )}

        {contest && (
          <>
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold">{contest.name}</h1>
              <span className="text-sm text-slate-400">{contest.status}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {new Date(contest.startTime).toLocaleString()} –{" "}
              {new Date(contest.endTime).toLocaleString()}
            </p>
            {contest.description && (
              <p className="mt-4 whitespace-pre-wrap text-slate-300">{contest.description}</p>
            )}

            <div className="mt-6 flex items-center gap-3">
              <Link
                href={`/contests/${contestId}/leaderboard`}
                className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-700"
              >
                View leaderboard
              </Link>

              {authStatus === "unauthenticated" && (
                <Link href="/login" className="text-sm text-indigo-400 hover:text-indigo-300">
                  Log in to register
                </Link>
              )}

              {authStatus === "authenticated" &&
                user &&
                !contest.isRegistered &&
                contest.status !== "ENDED" && (
                  <button
                    type="button"
                    disabled={registerMutation.isPending}
                    onClick={() => registerMutation.mutate()}
                    className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {registerMutation.isPending ? "Registering…" : "Register"}
                  </button>
                )}

              {contest.isRegistered && (
                <span className="text-sm text-emerald-400">You&apos;re registered</span>
              )}
            </div>

            {registerMutation.isError && (
              <p className="mt-2 text-sm text-red-400">
                {registerMutation.error instanceof ApiRequestError
                  ? registerMutation.error.message
                  : "Could not register. Try again."}
              </p>
            )}

            <h2 className="mt-8 text-sm font-semibold text-slate-400">Problems</h2>
            {contest.problems.length === 0 && (
              <p className="mt-2 text-slate-500">No problems have been added yet.</p>
            )}
            {contest.problems.length > 0 && (
              <ul className="mt-2 divide-y divide-slate-800 rounded border border-slate-800">
                {contest.problems.map((problem) => (
                  <li key={problem.problemId}>
                    <Link
                      href={`/problems/${problem.slug}?contestId=${contestId}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-slate-900"
                    >
                      <span>{problem.title}</span>
                      <span className="text-sm text-slate-500">{problem.points} pts</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </>
  );
}

"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ContestStatus } from "@codearena/shared";
import { contestsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { NavBar } from "../components/NavBar";

const STATUS_STYLES: Record<ContestStatus, string> = {
  UPCOMING: "text-indigo-400",
  ACTIVE: "text-emerald-400",
  ENDED: "text-slate-500",
};

export default function ContestsPage() {
  const { accessToken, status: authStatus } = useAuth();

  const query = useQuery({
    queryKey: ["contests", Boolean(accessToken)],
    queryFn: () => contestsApi.list(accessToken),
    enabled: authStatus !== "loading",
  });

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Contests</h1>

        {query.isLoading && <p className="mt-6 text-slate-400">Loading contests…</p>}

        {query.isError && (
          <div className="mt-6 text-sm text-red-400">
            <p>Could not reach the server.</p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-2 rounded bg-slate-800 px-3 py-1.5 text-slate-100 hover:bg-slate-700"
            >
              Retry
            </button>
          </div>
        )}

        {query.data && query.data.contests.length === 0 && (
          <p className="mt-6 text-slate-400">No contests yet.</p>
        )}

        {query.data && query.data.contests.length > 0 && (
          <ul className="mt-6 divide-y divide-slate-800 rounded border border-slate-800">
            {query.data.contests.map((contest) => (
              <li key={contest.id}>
                <Link
                  href={`/contests/${contest.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-slate-900"
                >
                  <span>{contest.name}</span>
                  <span className={`text-sm ${STATUS_STYLES[contest.status]}`}>
                    {contest.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

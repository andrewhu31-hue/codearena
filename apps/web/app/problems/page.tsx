"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { Difficulty } from "@codearena/shared";
import { problemsApi } from "@/lib/api-client";
import { NavBar } from "../components/NavBar";

const DIFFICULTY_STYLES: Record<Difficulty, string> = {
  EASY: "text-emerald-400",
  MEDIUM: "text-amber-400",
  HARD: "text-rose-400",
};

export default function ProblemsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["problems"],
    queryFn: () => problemsApi.list(),
  });

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Problems</h1>

        {isLoading && <p className="mt-6 text-slate-400">Loading problems…</p>}

        {isError && (
          <div className="mt-6 text-sm text-red-400">
            <p>Could not reach the server.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-2 rounded bg-slate-800 px-3 py-1.5 text-slate-100 hover:bg-slate-700"
            >
              Retry
            </button>
          </div>
        )}

        {data && data.problems.length === 0 && (
          <p className="mt-6 text-slate-400">No problems have been published yet.</p>
        )}

        {data && data.problems.length > 0 && (
          <ul className="mt-6 divide-y divide-slate-800 rounded border border-slate-800">
            {data.problems.map((problem) => (
              <li key={problem.id}>
                <Link
                  href={`/problems/${problem.slug}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-slate-900"
                >
                  <span>{problem.title}</span>
                  <span className={`text-sm ${DIFFICULTY_STYLES[problem.difficulty]}`}>
                    {problem.difficulty}
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

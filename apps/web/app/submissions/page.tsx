"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { Verdict } from "@codearena/shared";
import { submissionsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { NavBar } from "../components/NavBar";

const VERDICT_STYLES: Record<Verdict, string> = {
  ACCEPTED: "text-emerald-400",
  WRONG_ANSWER: "text-rose-400",
  TIME_LIMIT_EXCEEDED: "text-amber-400",
  MEMORY_LIMIT_EXCEEDED: "text-amber-400",
  RUNTIME_ERROR: "text-rose-400",
  COMPILATION_ERROR: "text-rose-400",
  INTERNAL_ERROR: "text-rose-400",
};

export default function SubmissionsPage() {
  const { accessToken, status: authStatus } = useAuth();

  const query = useQuery({
    queryKey: ["submissions", "mine"],
    queryFn: () => submissionsApi.listMine(accessToken as string),
    enabled: Boolean(accessToken),
    refetchInterval: (q) => {
      const hasPending = q.state.data?.submissions.some(
        (s) => s.status === "QUEUED" || s.status === "RUNNING",
      );
      return hasPending ? 2000 : false;
    },
  });

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Submission history</h1>

        {authStatus === "loading" && <p className="mt-6 text-slate-400">Loading…</p>}

        {authStatus === "unauthenticated" && (
          <div className="mt-6">
            <p className="text-slate-400">You need to be logged in to view your submissions.</p>
            <Link href="/login" className="mt-2 inline-block text-indigo-400 hover:text-indigo-300">
              Go to login
            </Link>
          </div>
        )}

        {authStatus === "authenticated" && query.isLoading && (
          <p className="mt-6 text-slate-400">Loading submissions…</p>
        )}

        {authStatus === "authenticated" && query.isError && (
          <p className="mt-6 text-sm text-red-400">Could not reach the server. Try again.</p>
        )}

        {authStatus === "authenticated" && query.data && query.data.submissions.length === 0 && (
          <p className="mt-6 text-slate-400">
            You haven&apos;t submitted anything yet.{" "}
            <Link href="/problems" className="text-indigo-400 hover:text-indigo-300">
              Browse problems
            </Link>
            .
          </p>
        )}

        {authStatus === "authenticated" && query.data && query.data.submissions.length > 0 && (
          <table className="mt-6 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-slate-500">
                <th className="pb-2 font-normal">Problem</th>
                <th className="pb-2 font-normal">Language</th>
                <th className="pb-2 font-normal">Status</th>
                <th className="pb-2 font-normal">Verdict</th>
                <th className="pb-2 font-normal">Tests</th>
                <th className="pb-2 font-normal">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {query.data.submissions.map((s) => (
                <tr key={s.id} className="border-b border-slate-900">
                  <td className="py-2">
                    <Link
                      href={`/problems/${s.problemSlug}`}
                      className="text-slate-200 hover:text-white"
                    >
                      {s.problemTitle}
                    </Link>
                  </td>
                  <td className="py-2 text-slate-400">{s.language}</td>
                  <td className="py-2 text-slate-400">{s.status}</td>
                  <td
                    className={`py-2 ${s.verdict ? VERDICT_STYLES[s.verdict] : "text-slate-500"}`}
                  >
                    {s.verdict ?? "—"}
                  </td>
                  <td className="py-2 text-slate-400">
                    {s.testsPassed}/{s.testsTotal}
                  </td>
                  <td className="py-2 text-slate-500">{new Date(s.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}

import Link from "next/link";
import { NavBar } from "./components/NavBar";

export default function LandingPage() {
  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-4xl font-bold tracking-tight">CodeArena</h1>
        <p className="mt-4 max-w-xl text-slate-400">
          A competitive programming platform: browse problems, submit solutions, and compete in
          timed contests with live rankings.
        </p>
        <Link
          href="/problems"
          className="mt-8 inline-block rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500"
        >
          Browse problems
        </Link>
        <p className="mt-8 text-sm text-slate-500">
          Timed contests and live leaderboards arrive in a later milestone. Submissions are
          currently judged by a deterministic placeholder that verifies the queue/worker pipeline;
          real Python/JavaScript/C++ execution arrives in Milestone 3.
        </p>
      </main>
    </>
  );
}

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
        <p className="mt-8 text-sm text-slate-500">
          Problem catalog, the submission workspace, and contests arrive in later milestones.
          Milestone 1 covers registration, login, and session management.
        </p>
      </main>
    </>
  );
}

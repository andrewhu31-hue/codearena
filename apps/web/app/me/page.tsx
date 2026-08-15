"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { NavBar } from "../components/NavBar";

export default function MePage() {
  const { user, status } = useAuth();

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-2xl px-6 py-16">
        {status === "loading" && <p className="text-slate-400">Loading your account…</p>}

        {status === "unauthenticated" && (
          <div>
            <p className="text-slate-400">You need to be logged in to view this page.</p>
            <Link href="/login" className="mt-4 inline-block text-indigo-400 hover:text-indigo-300">
              Go to login
            </Link>
          </div>
        )}

        {status === "authenticated" && user && (
          <div>
            <h1 className="text-2xl font-semibold">Welcome, {user.username}</h1>
            <dl className="mt-6 space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-24 text-slate-500">Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 text-slate-500">Role</dt>
                <dd>{user.role}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 text-slate-500">Joined</dt>
                <dd>{new Date(user.createdAt).toLocaleDateString()}</dd>
              </div>
            </dl>
            <p className="mt-8 text-sm text-slate-500">
              Submission history and contest activity will appear here starting in Milestone 2.
            </p>
          </div>
        )}
      </main>
    </>
  );
}

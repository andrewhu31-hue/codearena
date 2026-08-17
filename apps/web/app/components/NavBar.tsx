"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export function NavBar() {
  const { user, status, logout } = useAuth();

  return (
    <header className="border-b border-slate-800">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-semibold">
            CodeArena
          </Link>
          <Link href="/problems" className="text-sm text-slate-300 hover:text-white">
            Problems
          </Link>
          {user && (
            <Link href="/submissions" className="text-sm text-slate-300 hover:text-white">
              Submissions
            </Link>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm">
          {status === "loading" ? (
            <span className="text-slate-500">Loading…</span>
          ) : user ? (
            <>
              <Link href="/me" className="text-slate-300 hover:text-white">
                {user.username}
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded bg-slate-800 px-3 py-1.5 text-slate-100 hover:bg-slate-700"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-slate-300 hover:text-white">
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-500"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

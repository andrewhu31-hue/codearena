"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Language, SubmissionStatus } from "@codearena/shared";
import {
  getCppContract,
  renderCppStarterTemplate,
  CPP_STANDALONE_FALLBACK_TEMPLATE,
} from "@codearena/shared";
import { ApiRequestError, problemsApi, submissionsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useSubmissionRealtime } from "@/lib/realtime";
import { NavBar } from "../../components/NavBar";
import { CodeEditor } from "../../components/CodeEditor";

const STARTER_TEMPLATES: Record<Language, string> = {
  PYTHON: "class Solution:\n    def solve(self, input: str):\n        pass\n",
  JAVASCRIPT: "class Solution {\n  solve(input) {\n    \n  }\n}\n",
  // A slug with no registered class-method contract has no adapter to
  // generate a judge harness with, so the CPP fallback guides the
  // contestant toward a standalone program (their own main()) instead of
  // a class stub that would only fail to link — see getStarterTemplate.
  CPP: CPP_STANDALONE_FALLBACK_TEMPLATE,
};

// CPP is deliberately absent here — its templates are generated from the
// shared contract registry (see getStarterTemplate) so the displayed
// template and the judge harness can never drift apart.
const LEETCODE_STYLE_STARTERS: Record<"PYTHON" | "JAVASCRIPT", Partial<Record<string, string>>> = {
  PYTHON: {
    "two-sum":
      "class Solution:\n    def twoSum(self, nums: list[int], target: int) -> list[int]:\n        pass\n",
    "reverse-string":
      "class Solution:\n    def reverseString(self, s: str) -> str:\n        pass\n",
    "fizz-buzz": "class Solution:\n    def fizzBuzz(self, n: int) -> list[str]:\n        pass\n",
    "binary-search":
      "class Solution:\n    def search(self, nums: list[int], target: int) -> int:\n        pass\n",
    "longest-substring":
      "class Solution:\n    def lengthOfLongestSubstring(self, s: str) -> int:\n        pass\n",
    "merge-intervals":
      "class Solution:\n    def merge(self, intervals: list[list[int]]) -> list[list[int]]:\n        pass\n",
  },
  JAVASCRIPT: {
    "two-sum": "class Solution {\n  twoSum(nums, target) {\n    \n  }\n}\n",
    "reverse-string": "class Solution {\n  reverseString(s) {\n    \n  }\n}\n",
    "fizz-buzz": "class Solution {\n  fizzBuzz(n) {\n    \n  }\n}\n",
    "binary-search": "class Solution {\n  search(nums, target) {\n    \n  }\n}\n",
    "longest-substring": "class Solution {\n  lengthOfLongestSubstring(s) {\n    \n  }\n}\n",
    "merge-intervals": "class Solution {\n  merge(intervals) {\n    \n  }\n}\n",
  },
};

function slugToCamelCase(slug: string): string {
  const parts = slug
    .split("-")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return "solve";
  return parts
    .map((part, i) =>
      i === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join("");
}

function slugToSnakeCase(slug: string): string {
  const normalized = slug
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .split("-")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .join("_");
  return normalized || "solve";
}

function buildDefaultLeetCodeTemplate(
  language: "PYTHON" | "JAVASCRIPT",
  problemSlug: string,
): string {
  const camel = slugToCamelCase(problemSlug);
  const snake = slugToSnakeCase(problemSlug);

  if (language === "PYTHON") {
    return `class Solution:\n    def ${snake}(self, *args):\n        pass\n`;
  }

  return `class Solution {\n  ${camel}(...args) {\n    \n  }\n}\n`;
}

function getStarterTemplate(language: Language, problemSlug: string): string {
  if (language === "CPP") {
    // Driven entirely by the shared contract registry: the same source the
    // judge-worker harness generator reads, so template and harness can
    // never disagree. A slug with no registered contract falls back to a
    // standalone-program template (see STARTER_TEMPLATES.CPP) since there
    // is no adapter to generate a class harness with.
    const contract = getCppContract(problemSlug);
    return contract ? renderCppStarterTemplate(contract) : STARTER_TEMPLATES.CPP;
  }

  const languageTemplates = LEETCODE_STYLE_STARTERS[language];
  return languageTemplates[problemSlug] ?? buildDefaultLeetCodeTemplate(language, problemSlug);
}

const VERDICT_STYLES: Record<string, string> = {
  ACCEPTED: "text-emerald-400",
  WRONG_ANSWER: "text-rose-400",
  TIME_LIMIT_EXCEEDED: "text-amber-400",
  MEMORY_LIMIT_EXCEEDED: "text-amber-400",
  RUNTIME_ERROR: "text-rose-400",
  COMPILATION_ERROR: "text-rose-400",
  INTERNAL_ERROR: "text-rose-400",
};

const PENDING_STATUSES: SubmissionStatus[] = ["QUEUED", "RUNNING"];

export function ProblemWorkspace({ slug }: { slug: string }) {
  const { user, accessToken, status: authStatus } = useAuth();
  const queryClient = useQueryClient();
  const contestId = useSearchParams().get("contestId");
  const [language, setLanguage] = useState<Language | null>(null);
  const [sourceByLanguage, setSourceByLanguage] = useState<Partial<Record<Language, string>>>({});
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    // Ensure each problem opens with its own starter template rather than stale editor state.
    setSourceByLanguage({});
    setLanguage(null);
    setActiveSubmissionId(null);
    setSubmitError(null);
  }, [slug]);

  const problemQuery = useQuery({
    queryKey: ["problem", slug],
    queryFn: () => problemsApi.getBySlug(slug),
  });

  const problem = problemQuery.data;
  const activeLanguage = language ?? problem?.supportedLanguages[0] ?? null;
  const sourceCode =
    (activeLanguage && sourceByLanguage[activeLanguage]) ??
    (activeLanguage ? getStarterTemplate(activeLanguage, slug) : "");

  const submissionQueryKey = ["submission", activeSubmissionId];
  const submissionQuery = useQuery({
    queryKey: submissionQueryKey,
    queryFn: () => submissionsApi.getById(accessToken as string, activeSubmissionId as string),
    enabled: Boolean(activeSubmissionId && accessToken),
    // Safety-net poll; Socket.IO pushes an instant refetch below when it's connected.
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && PENDING_STATUSES.includes(data.status) ? 3000 : false;
    },
  });

  useSubmissionRealtime(accessToken, activeSubmissionId, () => {
    void queryClient.invalidateQueries({ queryKey: submissionQueryKey });
  });

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!accessToken || !problem || !activeLanguage) throw new Error("Not ready to submit");
      return submissionsApi.create(accessToken, {
        problemId: problem.id,
        language: activeLanguage,
        sourceCode,
        contestId: contestId ?? undefined,
      });
    },
    onSuccess: (submission) => {
      setSubmitError(null);
      setActiveSubmissionId(submission.id);
    },
    onError: (err) => {
      setSubmitError(err instanceof ApiRequestError ? err.message : "Could not submit. Try again.");
    },
  });

  const supportedLanguages = useMemo(() => problem?.supportedLanguages ?? [], [problem]);

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-5xl px-6 py-12">
        {problemQuery.isLoading && <p className="text-slate-400">Loading problem…</p>}

        {problemQuery.isError && (
          <div className="text-sm text-red-400">
            {problemQuery.error instanceof ApiRequestError && problemQuery.error.status === 404 ? (
              <p>This problem doesn&apos;t exist.</p>
            ) : (
              <p>Could not reach the server. Try again.</p>
            )}
            <Link
              href="/problems"
              className="mt-2 inline-block text-indigo-400 hover:text-indigo-300"
            >
              Back to problems
            </Link>
          </div>
        )}

        {problem && activeLanguage && (
          <>
            {contestId && (
              <div className="mb-6 rounded border border-indigo-800 bg-indigo-950/40 px-4 py-2 text-sm text-indigo-300">
                Submitting as part of{" "}
                <Link href={`/contests/${contestId}`} className="underline hover:text-indigo-200">
                  this contest
                </Link>
                .
              </div>
            )}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              <section>
                <h1 className="text-2xl font-semibold">{problem.title}</h1>
                <p className="mt-1 text-sm text-slate-500">
                  {problem.difficulty} · {problem.timeLimitMs}ms · {problem.memoryLimitMb}MB
                </p>
                <p className="mt-4 whitespace-pre-wrap text-slate-300">{problem.description}</p>

                {problem.inputFormat && (
                  <div className="mt-4">
                    <h2 className="text-sm font-semibold text-slate-400">Input format</h2>
                    <p className="mt-1 whitespace-pre-wrap text-slate-300">{problem.inputFormat}</p>
                  </div>
                )}
                {problem.outputFormat && (
                  <div className="mt-4">
                    <h2 className="text-sm font-semibold text-slate-400">Output format</h2>
                    <p className="mt-1 whitespace-pre-wrap text-slate-300">
                      {problem.outputFormat}
                    </p>
                  </div>
                )}
                {problem.constraints && (
                  <div className="mt-4">
                    <h2 className="text-sm font-semibold text-slate-400">Constraints</h2>
                    <p className="mt-1 whitespace-pre-wrap text-slate-300">{problem.constraints}</p>
                  </div>
                )}

                {problem.examples.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <h2 className="text-sm font-semibold text-slate-400">Examples</h2>
                    {problem.examples.map((example, i) => (
                      <pre
                        key={i}
                        className="overflow-x-auto rounded border border-slate-800 bg-slate-900 p-3 text-xs text-slate-300"
                      >
                        Input:{"\n"}
                        {example.input}
                        {"\n\n"}Output:{"\n"}
                        {example.output}
                        {example.explanation ? `\n\n${example.explanation}` : ""}
                      </pre>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-center justify-between">
                  <select
                    value={activeLanguage}
                    onChange={(e) => setLanguage(e.target.value as Language)}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                  >
                    {supportedLanguages.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-3 overflow-hidden rounded border border-slate-800">
                  <CodeEditor
                    language={activeLanguage}
                    value={sourceCode}
                    onChange={(next) =>
                      setSourceByLanguage((prev) => ({ ...prev, [activeLanguage]: next }))
                    }
                  />
                </div>

                {authStatus === "unauthenticated" && (
                  <p className="mt-3 text-sm text-slate-400">
                    <Link href="/login" className="text-indigo-400 hover:text-indigo-300">
                      Log in
                    </Link>{" "}
                    to submit a solution.
                  </p>
                )}

                {authStatus === "authenticated" && user && (
                  <button
                    type="button"
                    disabled={submitMutation.isPending}
                    onClick={() => submitMutation.mutate()}
                    className="mt-3 rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {submitMutation.isPending ? "Submitting…" : "Submit"}
                  </button>
                )}

                {submitError && <p className="mt-2 text-sm text-red-400">{submitError}</p>}

                {activeSubmissionId && (
                  <div className="mt-4 rounded border border-slate-800 p-4">
                    {submissionQuery.isLoading && (
                      <p className="text-sm text-slate-400">Loading submission…</p>
                    )}
                    {submissionQuery.data && (
                      <>
                        <p className="text-sm">
                          Status:{" "}
                          <span className="text-slate-300">{submissionQuery.data.status}</span>
                        </p>
                        {submissionQuery.data.verdict && (
                          <p className="mt-1 text-sm">
                            Verdict:{" "}
                            <span className={VERDICT_STYLES[submissionQuery.data.verdict]}>
                              {submissionQuery.data.verdict}
                            </span>
                          </p>
                        )}
                        <p className="mt-1 text-sm text-slate-400">
                          Tests passed: {submissionQuery.data.testsPassed}/
                          {submissionQuery.data.testsTotal}
                        </p>
                        {(submissionQuery.data.runtimeMs !== null ||
                          submissionQuery.data.memoryKb !== null) && (
                          <p className="mt-1 text-sm text-slate-500">
                            {submissionQuery.data.runtimeMs !== null &&
                              `${submissionQuery.data.runtimeMs}ms`}
                            {submissionQuery.data.runtimeMs !== null &&
                              submissionQuery.data.memoryKb !== null &&
                              " · "}
                            {submissionQuery.data.memoryKb !== null &&
                              `${Math.round(submissionQuery.data.memoryKb / 1024)}MB`}
                          </p>
                        )}
                        {submissionQuery.data.compilerOutput && (
                          <pre className="mt-2 overflow-x-auto rounded border border-slate-800 bg-slate-950 p-2 text-xs text-rose-300">
                            {submissionQuery.data.compilerOutput}
                          </pre>
                        )}
                      </>
                    )}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HINT_LEVEL_DESCRIPTIONS, HINT_LEVEL_LABELS, type HintLevel } from "@codearena/shared";
import { ApiRequestError, aiApi } from "@/lib/api-client";

/**
 * Progressive AI hints for a problem. Levels unlock in order; the server
 * decides what's allowed (e.g. no hints while the problem is in a contest
 * that hasn't ended), this panel only reflects it.
 */
export function AiHints({ slug, accessToken }: { slug: string; accessToken: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["ai-hints", slug];

  const statusQuery = useQuery({
    queryKey: ["ai-status"],
    queryFn: aiApi.status,
    staleTime: 60_000,
  });
  const hintsQuery = useQuery({
    queryKey,
    queryFn: () => aiApi.getHints(accessToken, slug),
    enabled: statusQuery.data?.enabled === true,
  });

  const unlock = useMutation({
    mutationFn: (level: HintLevel) => aiApi.unlockHint(accessToken, slug, level),
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  });

  if (!statusQuery.data?.enabled) return null;

  const data = hintsQuery.data;
  const next = data?.nextLevel ?? null;
  const unlockError =
    unlock.error instanceof ApiRequestError
      ? unlock.error.message
      : unlock.error
        ? "Couldn't get a hint. Try again."
        : null;

  return (
    <div className="mt-6 rounded border border-slate-800 p-4" aria-live="polite">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-300">Hints</h2>
        <span className="text-xs text-slate-500">AI-generated · no code</span>
      </div>

      {hintsQuery.isLoading && <p className="mt-2 text-sm text-slate-500">Loading hints…</p>}

      {data?.blockedReason && <p className="mt-2 text-sm text-amber-400">{data.blockedReason}</p>}

      {data && data.hints.length > 0 && (
        <ol className="mt-3 space-y-3">
          {data.hints.map((hint) => (
            <li key={hint.level} className="rounded bg-slate-900 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
                {hint.level}. {hint.label}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{hint.content}</p>
            </li>
          ))}
        </ol>
      )}

      {data && !data.blockedReason && next !== null && (
        <div className="mt-3">
          <button
            type="button"
            disabled={unlock.isPending}
            onClick={() => unlock.mutate(next)}
            className="rounded border border-indigo-700 px-3 py-1.5 text-sm text-indigo-300 hover:bg-indigo-950 disabled:opacity-50"
          >
            {unlock.isPending ? "Thinking…" : `Show hint ${next}: ${HINT_LEVEL_LABELS[next]}`}
          </button>
          <p className="mt-1 text-xs text-slate-500">{HINT_LEVEL_DESCRIPTIONS[next]}</p>
        </div>
      )}

      {data && !data.blockedReason && next === null && (
        <p className="mt-3 text-xs text-slate-500">All hints unlocked.</p>
      )}

      {unlockError && <p className="mt-2 text-sm text-red-400">{unlockError}</p>}
    </div>
  );
}

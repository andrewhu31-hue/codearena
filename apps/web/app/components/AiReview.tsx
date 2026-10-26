"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiRequestError, aiApi } from "@/lib/api-client";

/** AI code review for an ACCEPTED submission; stored server-side after the first request. */
export function AiReview({
  submissionId,
  accessToken,
}: {
  submissionId: string;
  accessToken: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["ai-review", submissionId];

  const statusQuery = useQuery({
    queryKey: ["ai-status"],
    queryFn: aiApi.status,
    staleTime: 60_000,
  });
  const existing = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        return await aiApi.getReview(accessToken, submissionId);
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: statusQuery.data?.enabled === true,
  });

  const create = useMutation({
    mutationFn: () => aiApi.createReview(accessToken, submissionId),
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  });

  if (!statusQuery.data?.enabled) return null;

  const review = existing.data?.review;
  const error =
    create.error instanceof ApiRequestError
      ? create.error.message
      : create.error
        ? "Couldn't get a review. Try again."
        : null;

  return (
    <div
      className="mt-4 rounded border border-emerald-900 bg-emerald-950/20 p-4"
      aria-live="polite"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-emerald-300">AI code review</h3>
        <span className="text-xs text-slate-500">AI-generated</span>
      </div>

      {!review && (
        <>
          <p className="mt-1 text-sm text-slate-400">
            Accepted! Get feedback on complexity, style and whether there&apos;s a better approach.
          </p>
          <button
            type="button"
            disabled={create.isPending || existing.isLoading}
            onClick={() => create.mutate()}
            className="mt-2 rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {create.isPending ? "Reviewing…" : "Review my code"}
          </button>
        </>
      )}

      {review && (
        <div className="mt-2 space-y-3 text-sm text-slate-300">
          <p>{review.summary}</p>
          <p className="text-slate-400">
            Time: <span className="text-slate-200">{review.timeComplexity}</span> · Space:{" "}
            <span className="text-slate-200">{review.spaceComplexity}</span>
          </p>
          {review.strengths.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Strengths
              </h4>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {review.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {review.improvements.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Could be better
              </h4>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {review.improvements.map((s, i) => (
                  <li key={i} className="whitespace-pre-wrap">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {review.alternativeApproach && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Alternative approach
              </h4>
              <p className="mt-1 whitespace-pre-wrap">{review.alternativeApproach}</p>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AiHints } from "./AiHints";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderHints(routes: Record<string, () => Response>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${new URL(url).pathname}`;
    const handler = routes[key];
    if (!handler) throw new Error(`unexpected request ${key}`);
    return handler();
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AiHints slug="two-sum" accessToken="token" />
    </QueryClientProvider>,
  );
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AiHints", () => {
  it("renders nothing when AI is disabled on the server", async () => {
    const fetchMock = renderHints({
      "GET /api/v1/ai/status": () => jsonResponse({ enabled: false }),
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Hints")).not.toBeInTheDocument();
  });

  it("unlocks the next hint level on click", async () => {
    renderHints({
      "GET /api/v1/ai/status": () => jsonResponse({ enabled: true }),
      "GET /api/v1/ai/problems/two-sum/hints": () =>
        jsonResponse({ problemId: "p", hints: [], nextLevel: 1, blockedReason: null }),
      "POST /api/v1/ai/problems/two-sum/hints": () =>
        jsonResponse({
          problemId: "p",
          hints: [{ level: 1, label: "Nudge", content: "Think about complements." }],
          nextLevel: 2,
          blockedReason: null,
        }),
    });
    await userEvent.click(await screen.findByRole("button", { name: /Show hint 1: Nudge/ }));
    expect(await screen.findByText("Think about complements.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show hint 2: Approach/ })).toBeInTheDocument();
  });

  it("explains when hints are blocked by a contest", async () => {
    renderHints({
      "GET /api/v1/ai/status": () => jsonResponse({ enabled: true }),
      "GET /api/v1/ai/problems/two-sum/hints": () =>
        jsonResponse({
          problemId: "p",
          hints: [],
          nextLevel: null,
          blockedReason:
            "AI hints and reviews are turned off for this problem until its contest has ended.",
        }),
    });
    expect(await screen.findByText(/until its contest has ended/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

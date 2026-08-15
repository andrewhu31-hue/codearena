import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider } from "@/lib/auth-context";
import LoginPage from "./page";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("LoginPage", () => {
  beforeEach(() => {
    push.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/v1/auth/refresh")) {
          return jsonResponse(401, {
            error: { code: "UNAUTHORIZED", message: "Missing refresh token", requestId: "test" },
          });
        }
        if (url.endsWith("/api/v1/auth/login")) {
          return jsonResponse(200, {
            user: {
              id: "u1",
              email: "user@example.com",
              username: "user",
              role: "CONTESTANT",
              createdAt: new Date().toISOString(),
            },
            accessToken: "fake-token",
            accessTokenExpiresAt: new Date().toISOString(),
          });
        }
        throw new Error(`Unexpected fetch to ${url}`);
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("logs in and navigates to /me on success", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    await user.type(screen.getByLabelText(/email/i), "user@example.com");
    await user.type(screen.getByLabelText(/password/i), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/me"));
  });

  it("shows an error message on failed login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/v1/auth/refresh")) {
          return jsonResponse(401, {
            error: { code: "UNAUTHORIZED", message: "Missing refresh token", requestId: "test" },
          });
        }
        return jsonResponse(401, {
          error: { code: "UNAUTHORIZED", message: "Invalid credentials", requestId: "test" },
        });
      }),
    );

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    await user.type(screen.getByLabelText(/email/i), "user@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid credentials/i);
    expect(push).not.toHaveBeenCalled();
  });
});

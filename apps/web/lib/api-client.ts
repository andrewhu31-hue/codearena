import type { ApiErrorBody, AuthResponse, LoginInput, RegisterInput } from "@codearena/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = body.error.code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json();
  if (!res.ok) throw new ApiRequestError(res.status, body as ApiErrorBody);
  return body as T;
}

export const authApi = {
  register: (input: RegisterInput) =>
    request<AuthResponse>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  login: (input: LoginInput) =>
    request<AuthResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  refresh: () => request<AuthResponse>("/api/v1/auth/refresh", { method: "POST" }),

  logout: () => request<void>("/api/v1/auth/logout", { method: "POST" }),

  me: (accessToken: string) =>
    request<AuthResponse["user"]>("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
};

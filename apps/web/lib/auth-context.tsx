"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthUser, LoginInput, RegisterInput } from "@codearena/shared";
import { authApi } from "./api-client";
import { disconnectSocket } from "./socket-client";

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  status: "loading" | "authenticated" | "unauthenticated";
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Access tokens live only in memory (never localStorage) to limit exposure
// if a script-injection vulnerability is ever found (PRD §8/§12 threat model).
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");

  useEffect(() => {
    authApi
      .refresh()
      .then((auth) => {
        setUser(auth.user);
        setAccessToken(auth.accessToken);
        setStatus("authenticated");
      })
      .catch(() => {
        setStatus("unauthenticated");
      });
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const auth = await authApi.login(input);
    setUser(auth.user);
    setAccessToken(auth.accessToken);
    setStatus("authenticated");
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const auth = await authApi.register(input);
    setUser(auth.user);
    setAccessToken(auth.accessToken);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    disconnectSocket();
    setUser(null);
    setAccessToken(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo(
    () => ({ user, accessToken, status, login, register, logout }),
    [user, accessToken, status, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

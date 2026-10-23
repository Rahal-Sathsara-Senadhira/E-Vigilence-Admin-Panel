import {
  can,
  type CurrentUser,
  type LoginResult,
  type Permission,
  type SessionPayload,
} from "@ev/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, applySession, refreshSession, setSessionListener } from "../lib/api";

type Status = "loading" | "signedOut" | "signedIn";

interface AuthContextValue {
  status: Status;
  user: CurrentUser | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyCode: (challengeToken: string, code: string) => Promise<void>;
  beginSetup: (challengeToken: string) => Promise<{ secret: string; otpauthUri: string }>;
  confirmSetup: (challengeToken: string, code: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Whether the signed-in user's role has a permission (docs/01 §6). */
  allowed: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    setSessionListener((session) => {
      setUser(session?.user ?? null);
      setStatus(session ? "signedIn" : "signedOut");
      if (!session) queryClient.clear();
    });
    // Restore the session from the refresh cookie after a reload.
    void refreshSession();
  }, [queryClient]);

  const finish = useCallback((session: SessionPayload) => applySession(session), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      async login(email, password) {
        const result = await api<LoginResult>("/auth/login", {
          method: "POST",
          body: { email, password },
        });
        if (result.status === "signedIn") finish(result.session);
        return result;
      },
      async verifyCode(challengeToken, code) {
        const result = await api<{ session: SessionPayload }>("/auth/mfa/verify", {
          method: "POST",
          body: { challengeToken, code },
        });
        finish(result.session);
      },
      beginSetup(challengeToken) {
        return api("/auth/mfa/setup", { method: "POST", body: { challengeToken } });
      },
      async confirmSetup(challengeToken, code) {
        const result = await api<{ session: SessionPayload }>("/auth/mfa/setup/confirm", {
          method: "POST",
          body: { challengeToken, code },
        });
        finish(result.session);
      },
      async changePassword(currentPassword, newPassword) {
        finish(
          await api<SessionPayload>("/auth/change-password", {
            method: "POST",
            body: { currentPassword, newPassword },
          }),
        );
      },
      async logout() {
        try {
          await api("/auth/logout", { method: "POST", csrf: true });
        } finally {
          applySession(null);
        }
      },
      allowed: (permission) => (user ? can(user.role, permission) : false),
    }),
    [status, user, finish],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** For pages that only render once signed in. */
export function useCurrentUser(): CurrentUser {
  const { user } = useAuth();
  if (!user) throw new Error("useCurrentUser used while signed out");
  return user;
}

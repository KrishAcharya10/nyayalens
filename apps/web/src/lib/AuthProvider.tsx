"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  login as apiLogin,
  register as apiRegister,
} from "./api";

interface AuthContextValue {
  isAuthenticated: boolean;
  // undefined while the initial sessionStorage check hasn't run yet -
  // distinct from `false` (checked, and there is no token) so a page can
  // avoid a login-redirect flash before hydration settles.
  isReady: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsAuthenticated(Boolean(sessionStorage.getItem(ACCESS_TOKEN_KEY)));
    setIsReady(true);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await apiLogin(email, password);
    sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    setIsAuthenticated(true);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const tokens = await apiRegister(email, password);
    sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    setIsAuthenticated(false);
  }, []);

  const value = useMemo(
    () => ({ isAuthenticated, isReady, login, register, logout }),
    [isAuthenticated, isReady, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

// Redirects to /login the moment we know (post-hydration) there's no
// session - used by every page inside the workspace. UnauthorizedError
// from the API client (see api.ts) triggers the same logout+redirect on
// any 401/403 encountered mid-session (e.g. an expired access token).
export function useRequireAuth(): { isReady: boolean } {
  const { isAuthenticated, isReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isReady && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isReady, isAuthenticated, router]);

  return { isReady: isReady && isAuthenticated };
}

export function useHandleUnauthorized(): (err: unknown) => boolean {
  const { logout } = useAuth();
  const router = useRouter();
  return useCallback(
    (err: unknown) => {
      if (err instanceof Error && err.name === "UnauthorizedError") {
        logout();
        router.replace("/login");
        return true;
      }
      return false;
    },
    [logout, router],
  );
}

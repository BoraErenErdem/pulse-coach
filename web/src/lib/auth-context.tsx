"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { getMe, login as apiLogin, type UserRead } from "@/lib/api";

const TOKEN_STORAGE_KEY = "pulsecoach_token";

interface AuthContextValue {
  token: string | null;
  user: UserRead | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserRead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function restoreSession() {
      const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!stored) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await getMe(stored);
        setToken(stored);
        setUser(me);
      } catch {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      } finally {
        setIsLoading(false);
      }
    }
    restoreSession();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { access_token } = await apiLogin(email, password);
    const me = await getMe(access_token);
    localStorage.setItem(TOKEN_STORAGE_KEY, access_token);
    setToken(access_token);
    setUser(me);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

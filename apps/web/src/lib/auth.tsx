import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAuthStatus,
  login as apiLogin,
  logout as apiLogout,
  readStoredToken,
} from "./api";

interface AuthContextValue {
  enabled: boolean;
  authenticated: boolean;
  username: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const statusQuery = useQuery({
    queryKey: ["auth-status", readStoredToken()],
    queryFn: fetchAuthStatus,
  });

  const login = useCallback(async (user: string, password: string) => {
    const session = await apiLogin(user, password);
    setUsername(session.username);
    await statusQuery.refetch();
  }, [statusQuery]);

  const logout = useCallback(async () => {
    await apiLogout();
    setUsername(null);
    await statusQuery.refetch();
  }, [statusQuery]);

  const enabled = statusQuery.data?.enabled ?? false;
  const authenticated = statusQuery.data
    ? !statusQuery.data.enabled || statusQuery.data.authenticated
    : false;

  const value = useMemo<AuthContextValue>(
    () => ({
      enabled,
      authenticated,
      username,
      loading: statusQuery.isLoading,
      login,
      logout,
    }),
    [authenticated, enabled, login, logout, statusQuery.isLoading, username],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

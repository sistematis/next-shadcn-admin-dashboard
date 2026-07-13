/**
 * Client-side auth context for iDempiere REST API.
 * Stores token in memory, refresh_token in httpOnly cookie via server action.
 *
 * Reference: https://bxservice.github.io/idempiere-rest-docs/docs/api-guides/authentication
 */

"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

import { logout as apiLogout, finalizeLogin, getOrganizations, getRoles, getWarehouses, initLogin } from "./client";
import type { AuthSession } from "./types";

interface AuthContextValue {
  token: string | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  /** Step 1: authenticate with username/password, get clients list */
  authenticate: (
    username: string,
    password: string,
  ) => Promise<{ clients: { id: number; name: string }[]; token: string }>;
  /** Step 2-3: select client/role/org/warehouse and finalize login */
  selectSession: (
    token: string,
    params: {
      clientId: number;
      roleId: number;
      organizationId: number;
      warehouseId: number;
      language?: string;
    },
  ) => Promise<AuthSession>;
  /** Get roles/orgs/warehouses for a client selection */
  fetchRoles: (clientId: number, token: string) => ReturnType<typeof getRoles>;
  fetchOrganizations: (clientId: number, roleId: number, token: string) => ReturnType<typeof getOrganizations>;
  fetchWarehouses: (
    clientId: number,
    roleId: number,
    organizationId: number,
    token: string,
  ) => ReturnType<typeof getWarehouses>;
  /** Clear auth state */
  clearAuth: () => void;
  /** Logout from server */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);

  const authenticate = useCallback(async (username: string, password: string) => {
    const result = await initLogin(username, password);
    // Store provisional token for subsequent role/org/warehouse lookups
    setToken(result.token);
    return result;
  }, []);

  const selectSession = useCallback(
    async (
      provToken: string,
      params: {
        clientId: number;
        roleId: number;
        organizationId: number;
        warehouseId: number;
        language?: string;
      },
    ) => {
      const result = await finalizeLogin(provToken, params);
      setToken(result.token);
      setSession(result);
      return result;
    },
    [],
  );

  const clearAuth = useCallback(() => {
    setToken(null);
    setSession(null);
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await apiLogout(token);
      } catch {
        // Best effort — clear local state regardless
      }
    }
    clearAuth();
  }, [token, clearAuth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      session,
      isAuthenticated: !!token,
      authenticate,
      selectSession,
      fetchRoles: getRoles,
      fetchOrganizations: getOrganizations,
      fetchWarehouses: getWarehouses,
      clearAuth,
      logout,
    }),
    [token, session, authenticate, selectSession, clearAuth, logout],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

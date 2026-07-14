/**
 * Client-side auth context for iDempiere REST API.
 * Stores token in memory, refresh_token in httpOnly cookie via server action.
 *
 * Reference: https://bxservice.github.io/idempiere-rest-docs/docs/api-guides/authentication
 */

"use client";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  logout as apiLogout,
  finalizeLogin,
  getOrganizations,
  getRoles,
  getWarehouses,
  initLogin,
  setTokens,
} from "./client";
import type { AuthSession } from "./types";

// ponytail: sessionStorage by default (tab close = cleared), localStorage when Remember Me
const TOKEN_KEY = "erp_token";
const SESSION_KEY = "erp_session";
const REMEMBER_KEY = "erp_remember";
// ponytail: saved login preferences (username, password, session params) — survives logout
const LOGIN_PREFS_KEY = "erp_login_prefs";

export interface SavedLoginPrefs {
  username: string;
  password: string;
  clientId: number;
  roleId: number;
  organizationId: number;
  warehouseId: number;
}

function getStorage(): Storage {
  if (typeof window === "undefined") return sessionStorage;
  return localStorage.getItem(REMEMBER_KEY) === "true" ? localStorage : sessionStorage;
}

function readStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  const raw = getStorage().getItem(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export function getLoginPrefs(): SavedLoginPrefs | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LOGIN_PREFS_KEY);
  return raw ? (JSON.parse(raw) as SavedLoginPrefs) : null;
}

export function saveLoginPrefs(prefs: SavedLoginPrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOGIN_PREFS_KEY, JSON.stringify(prefs));
}

export function clearLoginPrefs() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LOGIN_PREFS_KEY);
}

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
      userName?: string;
      clientName?: string;
      roleName?: string;
      orgName?: string;
      warehouseName?: string;
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
  /** Set Remember Me — localStorage instead of sessionStorage */
  setRemember: (on: boolean) => void;
  /** Logout from server */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStorage<string>(TOKEN_KEY));
  const [session, setSession] = useState<AuthSession | null>(() => readStorage<AuthSession>(SESSION_KEY));

  // ponytail: sync token + refresh_token to client module so apiRequest can auto-refresh on 401
  useEffect(() => {
    const rt = session?.refresh_token ?? null;
    setTokens(token, rt);
  }, [token, session]);

  // Sync token to storage
  useEffect(() => {
    const s = getStorage();
    if (token) s.setItem(TOKEN_KEY, JSON.stringify(token));
    else s.removeItem(TOKEN_KEY);
  }, [token]);

  // Sync session to storage
  useEffect(() => {
    const s = getStorage();
    if (session) s.setItem(SESSION_KEY, JSON.stringify(session));
    else s.removeItem(SESSION_KEY);
  }, [session]);

  const authenticate = useCallback(async (username: string, password: string) => {
    const result = await initLogin(username, password);
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
        userName?: string;
        clientName?: string;
        roleName?: string;
        orgName?: string;
        warehouseName?: string;
      },
    ) => {
      const result = await finalizeLogin(provToken, params);
      // ponytail: merge display names from login form into session
      result.userName = params.userName;
      result.clientName = params.clientName;
      result.roleName = params.roleName;
      result.orgName = params.orgName;
      result.warehouseName = params.warehouseName;
      setToken(result.token);
      setSession(result);
      return result;
    },
    [],
  );

  const clearAuth = useCallback(() => {
    setToken(null);
    setSession(null);
    // ponytail: clear tokens from BOTH storages, but KEEP REMEMBER_KEY + LOGIN_PREFS_KEY
    // so user doesn't re-enter credentials on next login
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(SESSION_KEY);
    }
  }, []);

  const setRemember = useCallback((on: boolean) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(REMEMBER_KEY, JSON.stringify(on));
    // If turning on and we have data in sessionStorage, migrate it
    if (on) {
      const t = sessionStorage.getItem(TOKEN_KEY);
      const s = sessionStorage.getItem(SESSION_KEY);
      if (t) {
        localStorage.setItem(TOKEN_KEY, t);
        sessionStorage.removeItem(TOKEN_KEY);
      }
      if (s) {
        localStorage.setItem(SESSION_KEY, s);
        sessionStorage.removeItem(SESSION_KEY);
      }
    } else {
      // If turning off and we have data in localStorage, migrate to sessionStorage
      const t = localStorage.getItem(TOKEN_KEY);
      const s = localStorage.getItem(SESSION_KEY);
      if (t) {
        sessionStorage.setItem(TOKEN_KEY, t);
        localStorage.removeItem(TOKEN_KEY);
      }
      if (s) {
        sessionStorage.setItem(SESSION_KEY, s);
        localStorage.removeItem(SESSION_KEY);
      }
    }
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
      setRemember,
      logout,
    }),
    [token, session, authenticate, selectSession, clearAuth, setRemember, logout],
  );

  // ponytail: bfcache guard — browser restores page from cache on back button.
  // After logout, token is null. This forces a check on pageshow to redirect.
  useEffect(() => {
    const handler = (e: PageTransitionEvent) => {
      if (e.persisted && !readStorage<string>(TOKEN_KEY)) {
        window.location.replace("/auth/v1/login");
      }
    };
    window.addEventListener("pageshow", handler);
    return () => window.removeEventListener("pageshow", handler);
  }, []);

  // ponytail: redirect to login if no token and on a dashboard route
  useEffect(() => {
    if (typeof window === "undefined") return;
    const path = window.location.pathname;
    if (!token && path.startsWith("/dashboard")) {
      window.location.replace("/auth/v1/login");
    }
  }, [token]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

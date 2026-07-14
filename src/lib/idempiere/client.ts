/**
 * iDempiere REST API client.
 * Reference: https://bxservice.github.io/idempiere-rest-docs/docs/quickstart
 *
 * Normal login flow:
 *   1. POST /auth/tokens with {userName, password} → get provisional token + clients list
 *   2. GET /auth/roles?client=X → get roles for selected client
 *   3. GET /auth/organizations?client=X&role=Y → get orgs
 *   4. GET /auth/warehouses?client=X&role=Y&organization=Z → get warehouses
 *   5. PUT /auth/tokens with {clientId, roleId, organizationId, warehouseId, language} → final token
 */

import type {
  AuthOrganization,
  AuthRole,
  AuthSession,
  AuthWarehouse,
  QueryOptions,
  QueryResponse,
  WindowField,
} from "./types";
import { getColumnId } from "./types";

// ── Config ──────────────────────────────────────────────────

// iDempiere REST is served via erpzk subdomain with CORS headers in Traefik.
// NEXT_PUBLIC_API_BASE_URL is inlined at build time.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8082/api/v1";

// ── Core fetch wrapper ──────────────────────────────────────

async function apiRequest<T>(path: string, options?: RequestInit & { token?: string }): Promise<T> {
  const res = await doFetch(path, options);

  // ponytail: 401 → try refresh once, retry original, if refresh fails then logout
  if (res.status === 401 && typeof window !== "undefined") {
    const refreshed = await tryRefresh();
    if (refreshed) return doFetch(path, options) as unknown as Promise<T>;
    // refresh failed — force logout (keep REMEMBER_KEY + LOGIN_PREFS_KEY)
    sessionStorage.removeItem("erp_token");
    sessionStorage.removeItem("erp_session");
    localStorage.removeItem("erp_token");
    localStorage.removeItem("erp_session");
    if (!window.location.pathname.startsWith("/auth")) {
      window.location.href = "/auth/v1/login";
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`iDempiere API ${res.status}: ${text}`);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function doFetch(path: string, options?: RequestInit & { token?: string }) {
  // ponytail: prefer module-level token (always current after refresh) over stale caller token
  const token = getCurrentToken() ?? options?.token;
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options?.headers,
    },
  });
}

// ponytail: token kept in module-level var, synced from auth-context on each login
let _token: string | null = null;
let _refreshToken: string | null = null;
let _refreshing: Promise<boolean> | null = null;

export function setTokens(token: string | null, refreshToken: string | null) {
  _token = token;
  _refreshToken = refreshToken;
}

function getCurrentToken() {
  return _token;
}

// ponytail: single-flight refresh — concurrent 401s share one refresh call
async function tryRefresh(): Promise<boolean> {
  // biome-ignore lint/nursery/noMisusedPromises: single-flight pattern — truthiness check is intentional
  if (_refreshing) return _refreshing;
  const p = doRefresh();
  _refreshing = p;
  try {
    return await p;
  } finally {
    _refreshing = null;
  }
}

async function doRefresh(): Promise<boolean> {
  if (!_refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: _refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setTokens(data.token, data.refresh_token);
    // persist new token to the correct storage
    if (typeof window !== "undefined") {
      const useLocal = localStorage.getItem("erp_remember") === "true";
      const s = useLocal ? localStorage : sessionStorage;
      s.setItem("erp_token", JSON.stringify(data.token));
      const raw = s.getItem("erp_session");
      if (raw) {
        const sess = JSON.parse(raw);
        sess.token = data.token;
        sess.refresh_token = data.refresh_token;
        s.setItem("erp_session", JSON.stringify(sess));
      }
    }
    return true;
  } catch {
    return false;
  }
}

// ── Auth: Normal Login Flow ─────────────────────────────────

/** Step 1: POST /auth/tokens — authenticate with username/password, get provisional token + clients */
export async function initLogin(userName: string, password: string) {
  return apiRequest<{ clients: { id: number; name: string }[]; token: string }>("/auth/tokens", {
    method: "POST",
    body: JSON.stringify({ userName, password }),
  });
}

/** GET /auth/roles?client=X — get available roles for a client */
export async function getRoles(clientId: number, token: string): Promise<AuthRole[]> {
  const data = await apiRequest<{ roles: AuthRole[] }>(`/auth/roles?client=${clientId}`, { token });
  return data.roles;
}

/** GET /auth/organizations?client=X&role=Y — get organizations for role */
export async function getOrganizations(clientId: number, roleId: number, token: string): Promise<AuthOrganization[]> {
  const data = await apiRequest<{ organizations: AuthOrganization[] }>(
    `/auth/organizations?client=${clientId}&role=${roleId}`,
    { token },
  );
  return data.organizations;
}

/** GET /auth/warehouses?client=X&role=Y&organization=Z — get warehouses */
export async function getWarehouses(
  clientId: number,
  roleId: number,
  organizationId: number,
  token: string,
): Promise<AuthWarehouse[]> {
  const data = await apiRequest<{ warehouses: AuthWarehouse[] }>(
    `/auth/warehouses?client=${clientId}&role=${roleId}&organization=${organizationId}`,
    { token },
  );
  return data.warehouses;
}

/** Step 3: PUT /auth/tokens — finalize login with selected session params */
export async function finalizeLogin(
  token: string,
  params: {
    clientId: number;
    roleId: number;
    organizationId: number;
    warehouseId: number;
    language?: string;
  },
): Promise<AuthSession> {
  return apiRequest<AuthSession>("/auth/tokens", {
    method: "PUT",
    token,
    body: JSON.stringify({
      clientId: params.clientId,
      roleId: params.roleId,
      organizationId: params.organizationId,
      warehouseId: params.warehouseId,
      language: params.language ?? "en_US",
    }),
  });
}

// ── Auth: Refresh & Logout ──────────────────────────────────

/** POST /auth/refresh — refresh expired token */
export async function refreshToken(
  refresh_token: string,
  clientId?: number,
  userId?: number,
): Promise<{ token: string; refresh_token: string }> {
  return apiRequest("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({
      refresh_token,
      ...(clientId && { clientId }),
      ...(userId && { userId }),
    }),
  });
}

/** POST /auth/logout — invalidate token + refresh token */
export async function logout(token: string): Promise<void> {
  await apiRequest("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

// ── CRUD: Query builder ─────────────────────────────────────

function buildQueryString(opts?: QueryOptions): string {
  if (!opts) return "";
  const params: string[] = [];
  if (opts.filter) params.push(`$filter=${encodeURIComponent(opts.filter)}`);
  if (opts.orderby) params.push(`$orderby=${encodeURIComponent(opts.orderby)}`);
  if (opts.top != null) params.push(`$top=${opts.top}`);
  if (opts.skip != null) params.push(`$skip=${opts.skip}`);
  if (opts.select) params.push(`$select=${encodeURIComponent(opts.select)}`);
  if (opts.expand) params.push(`$expand=${encodeURIComponent(opts.expand)}`);
  return params.length ? `?${params.join("&")}` : "";
}

// ── CRUD: Generic model operations ──────────────────────────

/** GET /models/{model} — query records with OData-style params */
export async function getModels<T>(model: string, token: string, opts?: QueryOptions): Promise<QueryResponse<T>> {
  return apiRequest<QueryResponse<T>>(`/models/${model}${buildQueryString(opts)}`, { token });
}

/** GET /models/{model}/{id} — get single record */
export async function getModel<T>(model: string, id: number, token: string): Promise<T> {
  return apiRequest<T>(`/models/${model}/${id}`, { token });
}

/** POST /models/{model} — create record (supports nested detail records) */
export async function createModel<T>(model: string, data: Record<string, unknown>, token: string): Promise<T> {
  return apiRequest<T>(`/models/${model}`, {
    method: "POST",
    body: JSON.stringify(data),
    token,
  });
}

/** PUT /models/{model}/{id} — update record */
export async function updateModel<T>(
  model: string,
  id: number,
  data: Record<string, unknown>,
  token: string,
): Promise<T> {
  return apiRequest<T>(`/models/${model}/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
    token,
  });
}

/** DELETE /models/{model}/{id} — remove record */
export async function deleteModel(model: string, id: number, token: string): Promise<void> {
  await apiRequest(`/models/${model}/${id}`, { method: "DELETE", token });
}

// ── Processes ───────────────────────────────────────────────

/** POST /processes/{process} — execute a process or report */
export async function runProcess<T>(process: string, params: Record<string, unknown>, token: string): Promise<T> {
  return apiRequest<T>(`/processes/${process}`, {
    method: "POST",
    body: JSON.stringify(params),
    token,
  });
}

// ── Window metadata ─────────────────────────────────────────

/**
 * GET /windows/{window}/tabs/{tab}/fields — fetch field definitions from iDempiere window metadata.
 * Returns columns with extracted columnName (usable as $select values).
 */
export async function getWindowFields(windowSlug: string, tabSlug: string, token: string): Promise<WindowField[]> {
  const data = await apiRequest<{
    fields: Array<{
      id: number;
      Name: string;
      Description?: string;
      AD_Column_ID?: { identifier?: string; id: number; "model-name"?: string };
    }>;
  }>(`/windows/${windowSlug}/tabs/${tabSlug}/fields`, { token });
  return data.fields.map((f) => ({
    id: f.id,
    Name: f.Name,
    Description: f.Description,
    columnName: getColumnId(f),
    reference: f.AD_Column_ID?.identifier
      ? { id: f.AD_Column_ID.id, identifier: f.AD_Column_ID.identifier, "model-name": f.AD_Column_ID["model-name"] }
      : undefined,
  }));
}

export { apiRequest, buildQueryString };

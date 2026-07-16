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
  WindowTab,
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
      Help?: string;
      AD_Column_ID?: { identifier?: string; id: number; "model-name"?: string };
    }>;
  }>(`/windows/${windowSlug}/tabs/${tabSlug}/fields`, { token });
  return data.fields.map((f) => ({
    id: f.id,
    Name: f.Name,
    Description: f.Description,
    Help: f.Help,
    columnName: getColumnId(f),
    reference: f.AD_Column_ID?.identifier
      ? { id: f.AD_Column_ID.id, identifier: f.AD_Column_ID.identifier, "model-name": f.AD_Column_ID["model-name"] }
      : undefined,
  }));
}

/** GET /windows/{window}/tabs — fetch all tabs for a window */
export async function getWindowTabs(windowSlug: string, token: string): Promise<WindowTab[]> {
  const data = await apiRequest<{
    tabs: Array<{
      id: number;
      Name: string;
      Description?: string;
      Help?: string;
      slug: string;
      SeqNo: number;
      TabLevel: number;
    }>;
  }>(`/windows/${windowSlug}/tabs`, { token });
  return data.tabs.map((t) => ({
    id: t.id,
    Name: t.Name,
    Description: t.Description,
    Help: t.Help,
    slug: t.slug,
    SeqNo: t.SeqNo,
    TabLevel: t.TabLevel,
  }));
}

// ── Window metadata: Layout-enhanced field fetch ───────────

/**
 * Fetch field definitions with full layout metadata from AD_Field + AD_Column.
 * Uses /models/ad_field with $expand=AD_Column_ID — returns position, span,
 * display logic, reference type, field length, mandatory flag.
 *
 * Requires SuperUser/Admin role (Full Access) since it queries AD_Field directly.
 *
 * @param tabId AD_Tab_ID — e.g. 220 for Business Partner header tab
 */
export async function getWindowFieldLayout(tabId: number, token: string): Promise<WindowField[]> {
  // ponytail: no IsDisplayed filter — a field can be grid-only (IsDisplayed=false, IsDisplayedGrid=true).
  // Consumer filters by isDisplayed (form) or isDisplayedGrid (table).
  const data = await apiRequest<
    QueryResponse<{
      id: number;
      Name: string;
      Description?: string;
      Help?: string;
      SeqNo: number;
      SeqNoGrid: number;
      IsDisplayed: boolean;
      IsDisplayedGrid: boolean;
      IsReadOnly: boolean;
      IsSameLine: boolean;
      IsEncrypted: boolean;
      DisplayLogic?: string;
      MandatoryLogic?: string;
      XPosition: number;
      ColumnSpan: number;
      NumLines: number;
      IsActive: boolean;
      AD_FieldGroup_ID?: { id: number; identifier?: string; Name?: string };
      AD_Column_ID?: {
        id: number;
        identifier?: string;
        ColumnName: string;
        AD_Reference_ID?: { id: number; identifier?: string };
        AD_Reference_Value_ID?: { id: number; identifier?: string };
        FieldLength: number;
        IsMandatory: boolean;
      };
    }>
  >(
    `/models/ad_field?$filter=AD_Tab_ID eq ${tabId} and IsActive eq true&$orderby=SeqNo asc&$expand=AD_Column_ID($select=ColumnName,AD_Reference_ID,AD_Reference_Value_ID,FieldLength,IsMandatory),AD_FieldGroup_ID($select=Name)&$select=Name,Description,Help,SeqNo,SeqNoGrid,IsDisplayed,IsDisplayedGrid,IsReadOnly,IsSameLine,DisplayLogic,MandatoryLogic,XPosition,ColumnSpan,NumLines,IsActive,AD_FieldGroup_ID,AD_Column_ID`,
    {
      token,
    },
  );

  return data.records.map((f) => ({
    id: f.id,
    Name: f.Name,
    Description: f.Description,
    Help: f.Help,
    columnName: f.AD_Column_ID?.ColumnName ?? "",
    reference: f.AD_Column_ID
      ? { id: f.AD_Column_ID.id, identifier: f.AD_Column_ID.identifier ?? "", "model-name": "ad_column" }
      : undefined,
    seqNo: f.SeqNo,
    seqNoGrid: f.SeqNoGrid,
    isDisplayed: f.IsDisplayed,
    isDisplayedGrid: f.IsDisplayedGrid,
    isReadOnly: f.IsReadOnly,
    isSameLine: f.IsSameLine,
    xPosition: f.XPosition,
    columnSpan: f.ColumnSpan,
    numLines: f.NumLines,
    displayLogic: f.DisplayLogic,
    mandatoryLogic: f.MandatoryLogic,
    fieldGroup: f.AD_FieldGroup_ID
      ? {
          id: f.AD_FieldGroup_ID.id,
          identifier: f.AD_FieldGroup_ID.identifier,
          // ponytail: Name is the human-readable label for separators ("Customer Information", etc.)
          name: (f.AD_FieldGroup_ID as { Name?: string }).Name,
        }
      : undefined,
    referenceType: f.AD_Column_ID?.AD_Reference_ID?.id,
    referenceValueId: f.AD_Column_ID?.AD_Reference_Value_ID?.id,
    fieldLength: f.AD_Column_ID?.FieldLength,
    isMandatory: f.AD_Column_ID?.IsMandatory,
  }));
}

/**
 * Batch-enrich tabs with tableName by querying ad_tab directly by tab IDs.
 * Replaces the broken findWindowIdByName → getWindowTabsMetadata chain.
 * We already have AD_Tab_IDs from getWindowTabs(), so query by those IDs.
 *
 * @param tabIds Array of AD_Tab_ID values from getWindowTabs()
 */
/**
 * Batch-enrich tabs with tableName + parent FK column by querying ad_tab directly by tab IDs.
 * Returns a Map of tabId → { tableName, parentColumnName }.
 * REST API only returns IsActive=true records — inactive tabs are correctly excluded.
 *
 * @param tabIds Array of AD_Tab_ID values from getWindowTabs()
 */
export async function getTabsTableNames(
  tabIds: number[],
  token: string,
): Promise<Map<number, { tableName: string; parentColumnName?: string }>> {
  if (tabIds.length === 0) return new Map();
  const filterExpr = tabIds.map((id) => `id eq ${id}`).join(" or ");
  const data = await apiRequest<
    QueryResponse<{
      id: number;
      AD_Table_ID?: { TableName?: string };
      AD_Column_ID?: { ColumnName?: string };
    }>
  >(
    `/models/ad_tab?$filter=${filterExpr}&$expand=AD_Table_ID($select=TableName),AD_Column_ID($select=ColumnName)&$select=AD_Table_ID,AD_Column_ID`,
    { token },
  );
  const map = new Map<number, { tableName: string; parentColumnName?: string }>();
  for (const rec of data.records) {
    const tn = rec.AD_Table_ID?.TableName;
    if (tn) {
      map.set(rec.id, {
        tableName: tn.toLowerCase(),
        parentColumnName: rec.AD_Column_ID?.ColumnName,
      });
    }
  }
  return map;
}

/**
 * Fetch tab metadata with AD_Table_ID for direct model queries.
 * Uses /models/ad_tab — returns table name, where clause, layout flags.
 *
 * @param windowId AD_Window_ID
 */
export async function getWindowTabsMetadata(windowId: number, token: string): Promise<WindowTab[]> {
  const data = await apiRequest<
    QueryResponse<{
      id: number;
      Name: string;
      Description?: string;
      Help?: string;
      SeqNo: number;
      TabLevel: number;
      slug?: string;
      AD_Table_ID?: { id: number; identifier?: string; TableName?: string };
      WhereClause?: string;
      IsSingleRow?: boolean;
      HasTree?: boolean;
    }>
  >(
    `/models/ad_tab?$filter=AD_Window_ID eq ${windowId} and IsActive eq true&$orderby=SeqNo asc&$expand=AD_Table_ID($select=TableName)&$select=Name,Description,Help,SeqNo,TabLevel,WhereClause,IsSingleRow,HasTree,AD_Table_ID`,
    {
      token,
    },
  );

  return data.records.map((t) => ({
    id: t.id,
    Name: t.Name,
    Description: t.Description,
    Help: t.Help,
    slug: t.slug ?? slugify(t.Name),
    SeqNo: t.SeqNo,
    TabLevel: t.TabLevel,
    AD_Table_ID: t.AD_Table_ID?.id,
    tableName: t.AD_Table_ID?.TableName,
    WhereClause: t.WhereClause,
    IsSingleRow: t.IsSingleRow,
    HasTree: t.HasTree,
  }));
}

// ponytail: minimal slugify for tab names when REST endpoint doesn't include slug property
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Lookup AD_Window_ID by name (partial match).
 * For SuperUser/Admin sessions only.
 */
export async function findWindowIdByName(name: string, token: string): Promise<number | null> {
  const data = await apiRequest<QueryResponse<{ id: number; Name: string }>>(
    // ponytail: omit $select=id — id is virtual in iDempiere REST, causes 400
    `/models/ad_window?$filter=contains(Name,'${name.replace(/'/g, "''")}') and IsActive eq true&$select=Name`,
    { token },
  );
  return data.records.length > 0 ? data.records[0].id : null;
}

export { apiRequest, buildQueryString };

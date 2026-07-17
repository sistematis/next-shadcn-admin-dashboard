"use client";

/**
 * Entity data layer — TanStack Query hooks for any iDempiere window.
 * Replaces use-business-partners.ts with a generic, cached, server-side paginated hook.
 */

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createModel,
  deleteModel,
  getModel,
  getModels,
  getTabsTableNames,
  getWindowFieldLayout,
  getWindowFields,
  getWindowTabs,
  updateModel,
} from "./client";
import { getTokenFromStorage } from "./token-utils";
import type { WindowField, WindowTab } from "./types";

// ── Types ────────────────────────────────────────────────────

export type EntityRow = Record<string, unknown> & { id?: number; uid?: string };

export interface EntityQueryParams {
  page: number; // 0-indexed
  pageSize: number;
  search?: string; // server-side search
  filter?: string; // extra $filter expressions
  orderBy?: string;
}

// ponytail: iDempiere defaults model queries to IsActive=true — explicitly request both states
export const ALL_STATUS_FILTER = "IsActive eq true or IsActive eq false";

// ── Query Keys ───────────────────────────────────────────────

const qk = {
  list: (model: string, params: EntityQueryParams) => ["entity", model, "list", params] as const,
  detail: (model: string, id: number | string) => ["entity", model, "detail", id] as const,
  tabs: (windowSlug: string) => ["window", windowSlug, "tabs"] as const,
  fields: (tabId: number) => ["window", "fields", tabId] as const,
  fkOptions: (modelName: string) => ["fk-options", modelName] as const,
  listOptions: (refListId: number) => ["list-options", refListId] as const,
};

// ── Tabs + Fields (cached metadata) ──────────────────────────

export function useWindowTabsCached(windowSlug: string) {
  return useQuery({
    queryKey: qk.tabs(windowSlug),
    queryFn: async () => {
      const token = getTokenFromStorage();
      if (!token) throw new Error("Not authenticated");
      const tabs = await getWindowTabs(windowSlug, token);
      const headerTab = tabs.find((t) => t.TabLevel === 0) ?? tabs[0];

      // ponytail: batch-enrich tableName via ad_tab query
      let tableNameMap = new Map<number, { tableName: string; parentColumnName?: string }>();
      try {
        tableNameMap = await getTabsTableNames(
          tabs.map((t) => t.id),
          token,
        );
      } catch {
        /* non-admin — child CRUD disabled */
      }
      const enriched = tabs.map((t) => ({
        ...t,
        tableName: tableNameMap.get(t.id)?.tableName,
        parentColumnName: tableNameMap.get(t.id)?.parentColumnName,
      }));
      return { tabs: enriched, headerTab };
    },
    enabled: !!windowSlug,
  });
}

export function useTabFields(tabId: number, windowSlug: string, tabSlug?: string) {
  return useQuery({
    queryKey: qk.fields(tabId),
    queryFn: async (): Promise<WindowField[]> => {
      const token = getTokenFromStorage();
      if (!token) throw new Error("Not authenticated");
      // ponytail: prefer layout API (full metadata), fall back to role-aware Windows API
      try {
        const fields = await getWindowFieldLayout(tabId, token);
        if (fields.length > 0) return fields;
      } catch {
        /* fall through to Windows API */
      }
      // ponytail: pass the real tab slug — "" hit the wrong tab (header fields for every child tab)
      return tabSlug ? getWindowFields(windowSlug, tabSlug, token) : [];
    },
    enabled: tabId > 0,
  });
}

/** Fetch fields for all tabs in parallel, return map keyed by tab slug */
export function useAllTabFields(windowSlug: string, tabs: WindowTab[], maxTabLevel: number) {
  const useful = tabs
    .filter((t) => t.TabLevel === 0 || t.tableName)
    .filter((t) => t.TabLevel <= maxTabLevel)
    .sort((a, b) => a.SeqNo - b.SeqNo);

  const results = useQueries({
    queries: useful.map((t) => ({
      queryKey: qk.fields(t.id),
      queryFn: async (): Promise<WindowField[]> => {
        const token = getTokenFromStorage();
        if (!token) throw new Error("Not authenticated");
        try {
          const fields = await getWindowFieldLayout(t.id, token);
          if (fields.length > 0) return fields;
        } catch {
          /* fall through */
        }
        return getWindowFields(windowSlug, t.slug, token);
      },
    })),
  });

  const map: Record<string, WindowField[]> = {};
  for (let i = 0; i < useful.length; i++) {
    const data = results[i]?.data;
    if (data) map[useful[i].slug] = data;
  }
  return map;
}

// ── Entity List (server-side pagination) ─────────────────────

export function useEntityList(modelName: string, params: EntityQueryParams) {
  return useQuery({
    queryKey: qk.list(modelName, params),
    queryFn: async () => {
      const token = getTokenFromStorage();
      if (!token) throw new Error("Not authenticated");

      // ponytail: build server-side filter — search + extra filters
      const filters: string[] = [];
      if (params.search) {
        // ponytail: substringof is the OData function for LIKE
        const s = params.search.replace(/'/g, "''");
        filters.push(`(substringof('${s}',Name) or substringof('${s}',Value))`);
      }
      if (params.filter) filters.push(params.filter);

      const resp = await getModels<EntityRow>(modelName, token, {
        filter: filters.join(" and "),
        orderby: params.orderBy ?? "Name asc",
        top: params.pageSize,
        skip: params.page * params.pageSize,
      });
      return {
        records: resp.records as EntityRow[],
        totalCount: resp["row-count"] ?? resp.records.length,
        pageCount: resp["page-count"] ?? 1,
      };
    },
    enabled: !!modelName,
    placeholderData: (prev) => prev, // ponytail: keep old data while fetching next page
  });
}

// ── Entity Detail ─────────────────────────────────────────────

export function useEntityDetail(modelName: string, id: number | string | null) {
  return useQuery({
    queryKey: qk.detail(modelName, id ?? 0),
    queryFn: async () => {
      if (id === null) return null;
      const token = getTokenFromStorage();
      if (!token) throw new Error("Not authenticated");
      return getModel<EntityRow>(modelName, id, token);
    },
    enabled: id !== null,
  });
}

// ── Mutations ────────────────────────────────────────────────

export function useCreateEntity(modelName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => {
      const token = getTokenFromStorage();
      if (!token) throw new Error("Not authenticated");
      return createModel(modelName, data, token);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entity", modelName] });
      toast.success("Record created");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Create failed"),
  });
}

export function useUpdateEntity(modelName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number | string; data: Record<string, unknown> }) => {
      const token = getTokenFromStorage();
      if (!token) throw new Error("Not authenticated");
      return updateModel(modelName, id, data, token);
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["entity", modelName] });
      qc.invalidateQueries({ queryKey: qk.detail(modelName, id) });
      toast.success("Record updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
  });
}

export function useDeleteEntity(modelName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number | string) => {
      const token = getTokenFromStorage();
      if (!token) throw new Error("Not authenticated");
      return deleteModel(modelName, id, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entity", modelName] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });
}

export function useBulkDelete(modelName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: (number | string)[]): Promise<PromiseSettledResult<void>[]> => {
      const token = getTokenFromStorage();
      if (!token) throw new Error("Not authenticated");
      return Promise.allSettled(ids.map((id) => deleteModel(modelName, id, token)));
    },
    onSuccess: (_data, ids, context) => {
      const results = context as PromiseSettledResult<void>[];
      const failed = ids.filter((_, i) => results[i]?.status === "rejected");
      if (failed.length === 0) {
        toast.success(`Deleted ${ids.length} record(s)`);
      } else {
        toast.error(`Deleted ${ids.length - failed.length}, failed ${failed.length}`);
      }
      qc.invalidateQueries({ queryKey: ["entity", modelName] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Bulk delete failed"),
  });
}

// ── FK Options (cached, shared) ──────────────────────────────

export function useFKOptions(modelName: string | undefined) {
  return useQuery({
    queryKey: qk.fkOptions(modelName ?? ""),
    queryFn: async () => {
      if (!modelName) return [];
      const token = getTokenFromStorage();
      if (!token) throw new Error("Not authenticated");
      const resp = await getModels<{ id: number; Name?: string; name?: string }>(modelName, token, {
        select: "Name",
        orderby: "Name asc",
        top: 200,
      });
      return resp.records.map((r) => ({ id: r.id, name: r.Name ?? r.name ?? `#${r.id}` }));
    },
    enabled: !!modelName,
    staleTime: 10 * 60 * 1000, // ponytail: 10min — reference data changes rarely
  });
}

/** Fetch AD_Ref_List options for list-type fields (reference ID 17) */
export function useListOptions(refListId: number) {
  return useQuery({
    queryKey: qk.listOptions(refListId),
    queryFn: async () => {
      const token = getTokenFromStorage();
      if (!token) throw new Error("Not authenticated");
      const resp = await getModels<{ id: number; Name?: string; Value?: string }>("ad_ref_list", token, {
        filter: `AD_Reference_ID eq ${refListId}`,
        orderby: "Name asc",
        top: 200,
      });
      return resp.records.map((r) => ({ id: String(r.id), name: r.Name ?? r.Value ?? `#${r.id}` }));
    },
    enabled: refListId > 0,
    staleTime: 10 * 60 * 1000, // ponytail: 10min — reference data changes rarely
  });
}

// ── Child Records ────────────────────────────────────────────────

/** Fetch child records filtered by parent FK — cached, auto-refetches on tab switch */
export function useChildRecords(tableName: string, parentColumnName: string, parentId: number | string) {
  return useQuery({
    queryKey: ["entity", tableName, "children", parentColumnName, parentId] as const,
    queryFn: async () => {
      const token = getTokenFromStorage();
      if (!token) throw new Error("Not authenticated");
      const resp = await getModels<EntityRow>(tableName, token, {
        filter: `${parentColumnName} eq ${parentId} and (${ALL_STATUS_FILTER})`,
        orderby: "id asc",
        top: 200,
      });
      return resp.records;
    },
    enabled: !!tableName && !!parentId,
    staleTime: 30_000, // ponytail: 30sec — child data changes rarely
  });
}

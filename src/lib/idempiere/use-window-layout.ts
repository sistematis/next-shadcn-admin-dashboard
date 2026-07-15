"use client";

import * as React from "react";

import { findWindowIdByName, getWindowFieldLayout, getWindowTabs, getWindowTabsMetadata } from "@/lib/idempiere/client";
import type { WindowField, WindowTab } from "@/lib/idempiere/types";

/**
 * Fetch complete window layout metadata (tabs + fields with position data).
 * Works for any iDempiere window — no hardcoded "business-partner" slug.
 *
 * Requires SuperUser/Admin token for AD_Field direct queries.
 *
 * @param windowSlug e.g. "business-partner", "sales-order"
 * @param maxTabLevel Only include tabs up to this level (default 1 = header + first child)
 */
export function useWindowLayout(windowSlug: string, maxTabLevel = 1) {
  // ponytail: token comes from module-level _token set by auth-context, no prop needed
  const [tabs, setTabs] = React.useState<WindowTab[]>([]);
  const [fieldsByTab, setFieldsByTab] = React.useState<Record<string, WindowField[]>>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const allTabs = await getWindowTabs(windowSlug, "");
        // ponytail: enrich with tableName from AD_Tab metadata — needed for child CRUD model queries
        const windowId = await findWindowIdByName(windowSlug, "");
        let metaTabs: WindowTab[] = [];
        if (windowId) {
          try {
            metaTabs = await getWindowTabsMetadata(windowId, "");
          } catch {
            /* non-admin fallback — no tableName, child CRUD disabled */
          }
        }
        const metaById = new Map(metaTabs.map((m) => [m.id, m]));
        const enriched = allTabs.map((t) => ({
          ...t,
          tableName: metaById.get(t.id)?.tableName ?? metaById.get(t.id)?.tableName,
        }));
        const useful = enriched.filter((t) => t.TabLevel <= maxTabLevel).sort((a, b) => a.SeqNo - b.SeqNo);
        if (cancelled) return;
        setTabs(useful);

        const entries = await Promise.all(
          useful.map(async (t) => {
            try {
              const fields = await getWindowFieldLayout(t.id, "");
              return [t.slug, fields] as const;
            } catch {
              // ponytail: fallback for non-admin roles — basic field list without layout metadata
              const { getWindowFields } = await import("@/lib/idempiere/client");
              const fields = await getWindowFields(windowSlug, t.slug, "");
              return [t.slug, fields] as const;
            }
          }),
        );
        if (cancelled) return;
        const map: Record<string, WindowField[]> = {};
        for (const [slug, fields] of entries) map[slug] = fields;
        setFieldsByTab(map);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [windowSlug, maxTabLevel]);

  return { tabs, fieldsByTab, loading, error };
}

/**
 * Lower-level hook for when you already have AD_Window_ID + AD_Tab_IDs.
 * Skips the slug lookup, fetches tab metadata + field layout directly.
 *
 * @param windowId AD_Window_ID
 * @param maxTabLevel Only include tabs up to this level
 */
export function useWindowLayoutById(windowId: number | null, maxTabLevel = 1) {
  const [tabs, setTabs] = React.useState<WindowTab[]>([]);
  const [fieldsByTab, setFieldsByTab] = React.useState<Record<string, WindowField[]>>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!windowId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const allTabs = await getWindowTabsMetadata(windowId, "");
        const useful = allTabs.filter((t) => t.TabLevel <= maxTabLevel).sort((a, b) => a.SeqNo - b.SeqNo);
        if (cancelled) return;
        setTabs(useful);

        const entries = await Promise.all(
          useful.map(async (t) => {
            const fields = await getWindowFieldLayout(t.id, "");
            return [t.slug, fields] as const;
          }),
        );
        if (cancelled) return;
        const map: Record<string, WindowField[]> = {};
        for (const [slug, fields] of entries) map[slug] = fields;
        setFieldsByTab(map);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [windowId, maxTabLevel]);

  return { tabs, fieldsByTab, loading, error };
}

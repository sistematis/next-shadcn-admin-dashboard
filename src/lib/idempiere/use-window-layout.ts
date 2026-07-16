"use client";

import * as React from "react";

import { getTabsTableNames, getWindowFieldLayout, getWindowTabs, getWindowTabsMetadata } from "@/lib/idempiere/client";
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
        // ponytail: enrich tableName by querying ad_tab directly with tab IDs we already have.
        // Old approach (findWindowIdByName → getWindowTabsMetadata) was broken: contains() on ad_window returns 0.
        let tableNameMap = new Map<number, { tableName: string; parentColumnName?: string }>();
        try {
          tableNameMap = await getTabsTableNames(
            allTabs.map((t) => t.id),
            "",
          );
        } catch {
          /* non-admin or API quirk — child CRUD disabled, tabs still load */
        }
        const enriched = allTabs.map((t) => {
          const meta = tableNameMap.get(t.id);
          return {
            ...t,
            tableName: meta?.tableName,
            parentColumnName: meta?.parentColumnName,
          };
        });
        // ponytail: filter IsActive=false tabs — Windows API returns ALL tabs regardless of IsActive.
        // Batch ad_tab query only returns active ones, so inactive tabs have no tableName.
        // Exception: header tab (TabLevel=0) always has tableName from its own field metadata.
        const useful = enriched
          .filter((t) => t.TabLevel === 0 || t.tableName)
          .filter((t) => t.TabLevel <= maxTabLevel)
          .sort((a, b) => a.SeqNo - b.SeqNo);
        if (cancelled) return;
        setTabs(useful);

        const entries = await Promise.all(
          useful.map(async (t) => {
            try {
              const fields = await getWindowFieldLayout(t.id, "");
              // ponytail: inactive tabs (IsActive=false) return 0 fields from ad_field.
              // Fall back to Windows API which includes fields for inactive tabs.
              if (fields.length > 0) return [t.slug, fields] as const;
              const { getWindowFields } = await import("@/lib/idempiere/client");
              const fallback = await getWindowFields(windowSlug, t.slug, "");
              return [t.slug, fallback] as const;
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

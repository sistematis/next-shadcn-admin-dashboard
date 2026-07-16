"use client";

import * as React from "react";

import { toast } from "sonner";

import { useAuth } from "@/lib/idempiere/auth-context";
import { getModels, getWindowFieldLayout, getWindowFields, getWindowTabs } from "@/lib/idempiere/client";
import type { WindowField } from "@/lib/idempiere/types";

// ponytail: BPRow is now a generic bag — window metadata drives column defs
export type BPRow = Record<string, unknown> & { id: number };

export const BP_WINDOW_SLUG = "business-partner";

export function useBusinessPartners() {
  const { token } = useAuth();
  const [data, setData] = React.useState<BPRow[]>([]);
  const [fields, setFields] = React.useState<WindowField[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [totalCount, setTotalCount] = React.useState(0);

  const fetchData = React.useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError("Not authenticated");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Fetch tab metadata to get AD_Tab_ID for layout-enhanced field query
      const tabs = await getWindowTabs(BP_WINDOW_SLUG, token);
      const headerTab = tabs.find((t) => t.TabLevel === 0) ?? tabs[0];

      let fieldData: WindowField[];
      if (headerTab) {
        // ponytail: prefer layout API (has IsDisplayedGrid, SeqNoGrid, XPosition, ColumnSpan, AD_Reference_ID)
        try {
          fieldData = await getWindowFieldLayout(headerTab.id, token);
        } catch {
          // ponytail: fallback for non-admin roles that can't query AD_Field directly
          fieldData = await getWindowFields(BP_WINDOW_SLUG, headerTab.slug, token);
        }
      } else {
        fieldData = [];
      }

      const resp = await getModels<Record<string, unknown>>("c_bpartner", token, {
        // ponytail: include inactive records — REST API hides IsActive=false by default
        filter: "IsActive eq true or IsActive eq false",
        orderby: "Name asc",
        top: 100,
      });
      setFields(fieldData);
      setTotalCount(resp["row-count"] ?? resp.records.length);
      setData(resp.records as BPRow[]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      toast.error("Failed to load business partners", { description: msg });
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, fields, loading, error, totalCount, refetch: fetchData };
}

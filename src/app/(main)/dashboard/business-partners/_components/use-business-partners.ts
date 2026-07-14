"use client";

import * as React from "react";

import { toast } from "sonner";

import { useAuth } from "@/lib/idempiere/auth-context";
import { getModels, getWindowFields } from "@/lib/idempiere/client";
import type { WindowField } from "@/lib/idempiere/types";

// ponytail: BPRow is now a generic bag — window metadata drives column defs
export type BPRow = Record<string, unknown> & { id: number };

// ponytail: fetch all columns from c_bpartner — window metadata controls visibility, not $select.
// Trade-off: slightly larger payload, but avoids refetch when columns are toggled.

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
      // Fetch window field metadata + records in parallel
      const [fieldData, resp] = await Promise.all([
        getWindowFields("business-partner", "business-partner", token),
        getModels<Record<string, unknown>>("c_bpartner", token, {
          orderby: "Name asc",
          top: 100,
        }),
      ]);
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

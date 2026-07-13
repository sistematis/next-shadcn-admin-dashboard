"use client";

import * as React from "react";

import { toast } from "sonner";

import { useAuth } from "@/lib/idempiere/auth-context";
import { getModels } from "@/lib/idempiere/client";
import type { BusinessPartner } from "@/lib/idempiere/types";

export type BPRow = {
  id: number;
  name: string;
  value: string;
  isCustomer: boolean;
  isVendor: boolean;
  group: string;
  creditLimit: number;
  creditUsed: number;
  active: boolean;
};

export function useBusinessPartners() {
  const { token } = useAuth();
  const [data, setData] = React.useState<BPRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [totalCount, setTotalCount] = React.useState(0);

  const fetchData = React.useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await getModels<BusinessPartner>("c_bpartner", token, {
        select: "id,uid,Name,Value,IsCustomer,IsVendor,IsActive,SO_CreditLimit,SO_CreditUsed,C_BP_Group_ID",
        orderby: "Name asc",
        top: 100,
      });
      setTotalCount(resp["row-count"] ?? resp.records.length);
      setData(
        resp.records.map((bp) => ({
          id: bp.id,
          name: bp.Name ?? "(unnamed)",
          value: bp.Value ?? "",
          isCustomer: bp.IsCustomer ?? false,
          isVendor: bp.IsVendor ?? false,
          group: bp.C_BP_Group_ID?.identifier ?? "-",
          creditLimit: bp.SO_CreditLimit ?? 0,
          creditUsed: bp.SO_CreditUsed ?? 0,
          active: bp.IsActive ?? false,
        })),
      );
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

  return { data, loading, error, totalCount, refetch: fetchData };
}

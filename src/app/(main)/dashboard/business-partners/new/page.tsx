"use client";

import * as React from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createModel } from "@/lib/idempiere/client";
import { isSystemField } from "@/lib/idempiere/field-utils";
import { getTokenFromStorage } from "@/lib/idempiere/token-utils";

import { PartnerTabsView } from "../_components/partner-tabs-view";
import type { BPRow } from "../_components/use-business-partners";

export default function NewPartnerPage() {
  const router = useRouter();
  const [formData, setFormData] = React.useState<Record<string, unknown>>({});
  const [saving, setSaving] = React.useState(false);

  function handleFieldChange(columnName: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [columnName]: value }));
  }

  async function handleSave() {
    const token = getTokenFromStorage();
    if (!token) {
      toast.error("Not authenticated");
      return;
    }
    const payload = stripSystemFields(formData);
    setSaving(true);
    try {
      await createModel("c_bpartner", payload, token);
      toast.success("Business partner created");
      router.push("/dashboard/business-partners");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      // ponytail: iDempiere returns "Validation Error" with field detail — extract the useful part
      toast.error(msg.includes("detail") ? msg : `Failed to save: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/business-partners">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <h1 className="font-semibold text-2xl">Add Business Partner</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/business-partners">Cancel</Link>
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="size-4" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
      <PartnerTabsView bpId={null} data={formData as BPRow} onDataChange={handleFieldChange} />
    </div>
  );
}

function stripSystemFields(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (isSystemField(k)) continue;
    out[k] = v;
  }
  return out;
}

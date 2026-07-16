"use client";

import * as React from "react";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getModel, updateModel } from "@/lib/idempiere/client";
import { stripSystemFields } from "@/lib/idempiere/field-utils";
import { getTokenFromStorage } from "@/lib/idempiere/token-utils";

import { PartnerTabsView } from "../_components/partner-tabs-view";
import type { BPRow } from "../_components/use-business-partners";

export default function EditPartnerPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [formData, setFormData] = React.useState<Record<string, unknown>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!id) return;
    const token = getTokenFromStorage();
    if (!token) {
      setLoading(false);
      return;
    }
    getModel<BPRow>("c_bpartner", id, token)
      .then((rec) => setFormData(rec))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Unknown error";
        toast.error(`Failed to load: ${msg}`);
      })
      .finally(() => setLoading(false));
  }, [id]);

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
      await updateModel("c_bpartner", id, payload, token);
      toast.success("Business partner updated");
      router.push("/dashboard/business-partners");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(msg.includes("detail") ? msg : `Failed to save: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>;
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
          <h1 className="font-semibold text-2xl">Edit: {String(formData.Name ?? `#${id}`)}</h1>
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
      <PartnerTabsView bpId={id} data={formData as BPRow} onDataChange={handleFieldChange} />
    </div>
  );
}

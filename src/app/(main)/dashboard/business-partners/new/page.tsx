"use client";

import * as React from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { createModel } from "@/lib/idempiere/client";
import { stripSystemFields } from "@/lib/idempiere/field-utils";
import { getTokenFromStorage } from "@/lib/idempiere/token-utils";
import { useUnsavedGuard } from "@/lib/idempiere/use-unsaved-guard";

import { EntityTabsView } from "../_components/entity-tabs-view";

export default function NewPartnerPage() {
  const router = useRouter();
  const [formData, setFormData] = React.useState<Record<string, unknown>>({});
  const [saving, setSaving] = React.useState(false);
  const [initialData, setInitialData] = React.useState<string>("{}");

  const isDirty = JSON.stringify(formData) !== initialData;
  useUnsavedGuard(isDirty);

  function handleFieldChange(columnName: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [columnName]: value }));
  }

  // ponytail: validate mandatory fields before API call
  function validateMandatory(): string | null {
    // ponytail: Name is the one universal mandatory field for c_bpartner
    if (!formData.Name || String(formData.Name).trim() === "") {
      return "Name is required";
    }
    return null;
  }

  async function handleSave() {
    const validationError = validateMandatory();
    if (validationError) {
      toast.error(validationError);
      return;
    }
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
      setInitialData(JSON.stringify(formData));
      router.push("/dashboard/business-partners");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(msg.includes("detail") ? msg : `Failed to save: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ErrorBoundary>
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
        <EntityTabsView
          entityId={null}
          data={formData as Record<string, unknown> & { id: number }}
          onDataChange={handleFieldChange}
        />
      </div>
    </ErrorBoundary>
  );
}

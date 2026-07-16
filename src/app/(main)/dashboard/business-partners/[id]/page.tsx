"use client";

import * as React from "react";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { getModel, updateModel } from "@/lib/idempiere/client";
import { stripSystemFields } from "@/lib/idempiere/field-utils";
import { getTokenFromStorage } from "@/lib/idempiere/token-utils";
import { useUnsavedGuard } from "@/lib/idempiere/use-unsaved-guard";

import { EntityTabsView } from "../_components/entity-tabs-view";

type EntityRow = Record<string, unknown> & { id: number };

// ponytail: FK refs come as {id, identifier} — extract identifier for display
function formatRef(val: unknown): string {
  if (typeof val === "object" && val !== null && "identifier" in val) {
    return String((val as { identifier?: string }).identifier ?? "-");
  }
  return String(val ?? "-");
}

export default function EditPartnerPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [formData, setFormData] = React.useState<Record<string, unknown>>({});
  const [initialData, setInitialData] = React.useState<string>("{}");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const isDirty = loading ? false : JSON.stringify(formData) !== initialData;
  useUnsavedGuard(isDirty);

  React.useEffect(() => {
    if (!id) return;
    const token = getTokenFromStorage();
    if (!token) {
      setLoading(false);
      return;
    }
    getModel<EntityRow>("c_bpartner", id, token)
      .then((rec) => {
        setFormData(rec);
        setInitialData(JSON.stringify(rec));
      })
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
      setInitialData(JSON.stringify(formData));
      router.push("/dashboard/business-partners");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(msg.includes("detail") ? msg : `Failed to save: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" disabled>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="h-7 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="space-y-2">
                  <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                  <div className="h-9 w-full animate-pulse rounded bg-muted/50" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
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
        <EntityTabsView entityId={id} data={formData as EntityRow} onDataChange={handleFieldChange} />

        {/* ponytail: audit info — collapsible, read-only */}
        {Boolean(formData.Created || formData.Updated) && (
          <details className="text-muted-foreground text-xs">
            <summary className="cursor-pointer select-none">Audit Info</summary>
            <div className="mt-2 space-y-1 pl-4">
              {formData.Created ? <div>Created: {String(formData.Created)}</div> : null}
              {formData.CreatedBy ? <div>Created by: {formatRef(formData.CreatedBy)}</div> : null}
              {formData.Updated ? <div>Updated: {String(formData.Updated)}</div> : null}
              {formData.UpdatedBy ? <div>Updated by: {formatRef(formData.UpdatedBy)}</div> : null}
            </div>
          </details>
        )}
      </div>
    </ErrorBoundary>
  );
}

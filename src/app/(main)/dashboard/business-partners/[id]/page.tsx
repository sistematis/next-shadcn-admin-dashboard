"use client";

import * as React from "react";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { useEntityDetail, useUpdateEntity } from "@/lib/idempiere/entity-hooks";
import { stripSystemFields } from "@/lib/idempiere/field-utils";
import { getTokenFromStorage } from "@/lib/idempiere/token-utils";
import { useUnsavedGuard } from "@/lib/idempiere/use-unsaved-guard";

import { EntityTabsView } from "../_components/entity-tabs-view";

type EntityRow = Record<string, unknown> & { id: number };

// ponytail: iDempiere returns UTC timestamps — display as WIB (UTC+7)
function formatWIB(val: unknown): string {
  const d = new Date(val as string);
  if (Number.isNaN(d.getTime())) return String(val ?? "-");
  return (
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d) + " WIB"
  );
}

// ponytail: FK refs come as {id, identifier} — extract identifier for display
function formatRef(val: unknown): string {
  if (typeof val === "object" && val !== null && "identifier" in val) {
    return String((val as { identifier?: string }).identifier ?? "-");
  }
  return String(val ?? "-");
}

function PartnerPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = Number(params.id);
  const [viewMode, setViewMode] = React.useState(searchParams.get("mode") === "view");
  const [formData, setFormData] = React.useState<Record<string, unknown>>({});
  const [isDirty, setIsDirty] = React.useState(false);
  useUnsavedGuard(isDirty);

  const { data: entity, isPending } = useEntityDetail("c_bpartner", id);
  const updateMutation = useUpdateEntity("c_bpartner");

  React.useEffect(() => {
    if (entity) {
      setFormData(entity);
      setIsDirty(false);
    }
  }, [entity]);

  function handleFieldChange(columnName: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [columnName]: value }));
    setIsDirty(true);
  }

  async function handleSave() {
    const token = getTokenFromStorage();
    if (!token) {
      toast.error("Not authenticated");
      return;
    }
    const payload = stripSystemFields(formData);
    try {
      await updateMutation.mutateAsync({ id, data: payload });
      toast.success("Business partner updated");
      setIsDirty(false);
      setViewMode(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(msg.includes("detail") ? msg : `Failed to save: ${msg}`);
    }
  }

  if (isPending) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" disabled>
            <ChevronDown className="size-4" />
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
                <ChevronDown className="size-4" />
              </Link>
            </Button>
            <h1 className="font-semibold text-2xl">
              {viewMode ? "View" : "Edit"}: {String(formData.Name ?? `#${id}`)}
            </h1>
          </div>
          <div className="flex gap-2">
            {viewMode ? (
              <Button onClick={() => setViewMode(false)}>
                <ChevronDown className="size-4" />
                Edit
              </Button>
            ) : (
              <>
                <Button variant="outline" asChild>
                  <Link href="/dashboard/business-partners">Cancel</Link>
                </Button>
                <Button onClick={handleSave} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </>
            )}
          </div>
        </div>
        <EntityTabsView
          entityId={id}
          data={formData as EntityRow}
          onDataChange={handleFieldChange}
          readOnly={viewMode}
        />

        {/* ponytail: audit info — collapsible, read-only */}
        {Boolean(formData.Created || formData.Updated) && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                Audit Info
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-1 pl-4 text-muted-foreground text-xs">
              {formData.Created ? <div>Created: {formatWIB(formData.Created)}</div> : null}
              {formData.CreatedBy ? <div>Created by: {formatRef(formData.CreatedBy)}</div> : null}
              {formData.Updated ? <div>Updated: {formatWIB(formData.Updated)}</div> : null}
              {formData.UpdatedBy ? <div>Updated by: {formatRef(formData.UpdatedBy)}</div> : null}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </ErrorBoundary>
  );
}

// ponytail: useSearchParams needs Suspense boundary in Next.js App Router
export default function EditPartnerPage() {
  return (
    <React.Suspense>
      <PartnerPageInner />
    </React.Suspense>
  );
}

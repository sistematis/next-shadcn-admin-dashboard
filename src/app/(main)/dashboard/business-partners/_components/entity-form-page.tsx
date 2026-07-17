"use client";

import * as React from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import type { EntityRow } from "@/lib/idempiere/entity-hooks";
import {
  useCreateEntity,
  useEntityDetail,
  useTabFields,
  useUpdateEntity,
  useWindowTabsCached,
} from "@/lib/idempiere/entity-hooks";
import { stripSystemFields, validateMandatory } from "@/lib/idempiere/field-utils";
import { getTokenFromStorage } from "@/lib/idempiere/token-utils";
import { useUnsavedGuard } from "@/lib/idempiere/use-unsaved-guard";

import { EntityTabsView } from "./entity-tabs-view";

interface EntityFormPageProps {
  windowSlug: string;
  modelName: string;
  basePath: string;
  title: string;
  entityId?: number;
}

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

// ponytail: documents lock when completed (Processed / DocStatus="CO"); master data stays editable
function isRecordLocked(data: Record<string, unknown>): boolean {
  return data?.Processed === true || data?.DocStatus === "CO";
}

function EntityFormPageInner({ windowSlug, modelName, basePath, title, entityId }: EntityFormPageProps) {
  const router = useRouter();
  const isEditMode = entityId !== undefined;
  const [activeTab, setActiveTab] = React.useState("");
  const [formData, setFormData] = React.useState<Record<string, unknown>>({});
  const [isDirty, setIsDirty] = React.useState(false);
  useUnsavedGuard(isDirty);

  const { data: entity, isPending } = useEntityDetail(modelName, isEditMode ? entityId : null);
  const createMutation = useCreateEntity(modelName);
  const updateMutation = useUpdateEntity(modelName);

  const { data: tabsData } = useWindowTabsCached(windowSlug);
  const headerTabId = tabsData?.headerTab?.id;
  const { data: headerFields } = useTabFields(headerTabId ?? 0, windowSlug);

  const tabs = tabsData?.tabs ?? [];
  const visibleTabs = isEditMode ? tabs : tabs.filter((t) => t.TabLevel === 0);
  const activeTabResolved = activeTab || visibleTabs[0]?.slug || windowSlug;
  const activeTabMeta = tabs.find((t) => t.slug === activeTabResolved);
  const locked = isEditMode && isRecordLocked(formData);

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
    if (headerFields) {
      const validationError = validateMandatory(headerFields, formData);
      if (validationError) {
        toast.error(validationError);
        return;
      }
    }

    const token = getTokenFromStorage();
    if (!token) {
      toast.error("Not authenticated");
      return;
    }

    const payload = stripSystemFields(formData);
    try {
      if (isEditMode) {
        await updateMutation.mutateAsync({ id: entityId!, data: payload });
        setIsDirty(false);
      } else {
        await createMutation.mutateAsync(payload);
        setIsDirty(false);
        router.push(basePath);
      }
    } catch {
      // ponytail: hook already toasts on error — swallow here
    }
  }

  if (isEditMode && isPending) {
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

  const entityName = formData.Name ? String(formData.Name) : isEditMode ? `#${entityId}` : "";

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href={basePath}>
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href={basePath}>{title}s</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{isEditMode ? entityName || `#${entityId}` : "Add"}</BreadcrumbPage>
                </BreadcrumbItem>
                {isEditMode && activeTabMeta && activeTabMeta.TabLevel > 0 && (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{activeTabMeta.Name}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={basePath}>{isEditMode && locked ? "Back" : "Cancel"}</Link>
            </Button>
            {!locked && (
              <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending || !isDirty}>
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            )}
          </div>
        </div>
        <EntityTabsView
          windowSlug={windowSlug}
          entityId={isEditMode ? entityId : null}
          activeTab={activeTabResolved}
          onTabChange={setActiveTab}
          data={!isEditMode && Object.keys(formData).length === 0 ? null : (formData as EntityRow)}
          onDataChange={handleFieldChange}
          readOnly={locked}
        />

        {/* ponytail: audit info — collapsible, read-only */}
        {isEditMode && Boolean(formData.Created || formData.Updated) && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                Audit Info
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-1 pl-4 text-muted-foreground text-xs">
              {Boolean(formData.Created) && <div>Created: {formatWIB(formData.Created)}</div>}
              {Boolean(formData.CreatedBy) && <div>Created by: {formatRef(formData.CreatedBy)}</div>}
              {Boolean(formData.Updated) && <div>Updated: {formatWIB(formData.Updated)}</div>}
              {Boolean(formData.UpdatedBy) && <div>Updated by: {formatRef(formData.UpdatedBy)}</div>}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </ErrorBoundary>
  );
}

export function EntityFormPage(props: EntityFormPageProps) {
  return (
    <React.Suspense>
      <EntityFormPageInner {...props} />
    </React.Suspense>
  );
}

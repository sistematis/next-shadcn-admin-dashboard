"use client";
"use no memo";

import * as React from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useQueries } from "@tanstack/react-query";
import { ArrowLeft, MoreVertical, Printer, Trash2 } from "lucide-react";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { getModel } from "@/lib/idempiere/client";
import type { EntityRow } from "@/lib/idempiere/entity-hooks";
import {
  useCreateEntity,
  useDeleteEntity,
  useEntityDetail,
  useRunProcess,
  useTabFields,
  useUpdateEntity,
  useWindowProcesses,
  useWindowTabsCached,
} from "@/lib/idempiere/entity-hooks";
import { normalizeRefs, stripSystemFields, validateMandatory } from "@/lib/idempiere/field-utils";
import { getTokenFromStorage } from "@/lib/idempiere/token-utils";
import { useUnsavedGuard } from "@/lib/idempiere/use-unsaved-guard";

import { EntityTabsView } from "./entity-tabs-view";

interface EntityFormPageProps {
  windowSlug: string;
  modelName: string;
  basePath: string;
  title: string;
  entityId?: number | string;
  tabSlug?: string; // which tab this form renders (default: header); child tabs inject a parent FK on create
  drillPath?: { tabSlug: string; id: number }[]; // ancestor chain (excluding current) — breadcrumb links + FK injection
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
  return data.Processed === true || data.DocStatus === "CO";
}

// ponytail: record display name — Name/DocumentNo first, else first non-system FK identifier.
// Junction tables (R_ContactInterest) have no Name; their identity is the linked record's identifier.
const SYSTEM_FK_COLUMNS = new Set(["AD_Client_ID", "AD_Org_ID", "CreatedBy", "UpdatedBy"]);
function recordDisplayName(data: Record<string, unknown>, parentColumnName?: string): string {
  if (data.Name) return String(data.Name);
  if (data.DocumentNo) return String(data.DocumentNo);
  for (const [key, val] of Object.entries(data)) {
    if (key === parentColumnName || SYSTEM_FK_COLUMNS.has(key)) continue;
    if (val && typeof val === "object" && "identifier" in val) {
      const identifier = (val as { identifier?: unknown }).identifier;
      if (identifier) return String(identifier);
    }
  }
  if (data.Value) return String(data.Value);
  return "";
}

// ponytail: build breadcrumb links + after-create target from the drill ancestor chain.
// First ancestor is the header (route = basePath/{id}); the rest append /{tabSlug}/{id}.
function buildAncestorRoutes(basePath: string, drillPath: { tabSlug: string; id: number }[]): string[] {
  const routes: string[] = [];
  let route = basePath;
  drillPath.forEach((seg, i) => {
    route = i === 0 ? `${basePath}/${seg.id}` : `${route}/${seg.tabSlug}/${seg.id}`;
    routes.push(route);
  });
  return routes;
}

function EntityFormPageInner({
  windowSlug,
  modelName,
  basePath,
  title,
  entityId,
  tabSlug,
  drillPath,
}: EntityFormPageProps) {
  const router = useRouter();
  const isEditMode = entityId !== undefined;
  const [activeTab, setActiveTab] = React.useState("");
  const [formData, setFormData] = React.useState<Record<string, unknown>>({});
  const [isDirty, setIsDirty] = React.useState(false);
  useUnsavedGuard(isDirty);

  const { data: entity, isPending, isError } = useEntityDetail(modelName, isEditMode ? entityId : null);
  const createMutation = useCreateEntity(modelName);
  const updateMutation = useUpdateEntity(modelName);
  const deleteMutation = useDeleteEntity(modelName);
  const processMutation = useRunProcess();
  const processes = useWindowProcesses(windowSlug);

  // ponytail: Actions dialog state
  const [showDelete, setShowDelete] = React.useState(false);
  const [processResult, setProcessResult] = React.useState<{ summary: string; exportUri?: string } | null>(null);

  const { data: tabsData } = useWindowTabsCached(windowSlug);
  const tabs = tabsData?.tabs ?? [];
  const currentTab = (tabSlug ? tabs.find((t) => t.slug === tabSlug) : undefined) ?? tabsData?.headerTab ?? tabs[0];
  const { data: currentTabFields } = useTabFields(currentTab?.id ?? 0, windowSlug, currentTab?.slug);

  const activeTabResolved = activeTab || currentTab?.slug || windowSlug;
  const locked = isEditMode && isRecordLocked(formData);

  // ponytail: ancestor names for the breadcrumb (query keys match useEntityDetail → shared cache)
  const ancestorRoutes = buildAncestorRoutes(basePath, drillPath ?? []);
  const ancestorQueries = useQueries({
    queries: (drillPath ?? []).map((seg) => {
      const tab = tabs.find((t) => t.slug === seg.tabSlug);
      return {
        queryKey: ["entity", tab?.tableName ?? "", "detail", seg.id],
        queryFn: async () => {
          const token = getTokenFromStorage();
          if (!token || !tab?.tableName) return null;
          return getModel<EntityRow>(tab.tableName, seg.id, token);
        },
        enabled: !!tab?.tableName,
        staleTime: 60_000,
      };
    }),
  });
  const ancestorNames = (drillPath ?? []).map((seg, i) => {
    const rec = ancestorQueries[i]?.data as EntityRow | null | undefined;
    if (!rec) return `#${seg.id}`;
    const segTab = tabs.find((t) => t.slug === seg.tabSlug);
    return recordDisplayName(rec, segTab?.parentColumnName) || `#${seg.id}`;
  });
  const parentRoute = ancestorRoutes.length > 0 ? ancestorRoutes[ancestorRoutes.length - 1] : basePath;

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
    if (currentTabFields) {
      const validationError = validateMandatory(currentTabFields, formData);
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

    const payload = normalizeRefs(stripSystemFields(formData));
    // ponytail: child create — re-inject parent FK (stripped if a system column like C_BPartner_ID)
    if (!isEditMode && drillPath && drillPath.length > 0 && currentTab?.parentColumnName) {
      payload[currentTab.parentColumnName] = { id: drillPath[drillPath.length - 1].id };
    }
    try {
      if (isEditMode) {
        await updateMutation.mutateAsync({ id: entityId!, data: payload });
        setIsDirty(false);
      } else {
        await createMutation.mutateAsync(payload);
        setIsDirty(false);
        router.push(parentRoute);
      }
    } catch {
      // ponytail: hook already toasts on error — swallow here
    }
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(entityId!);
      router.push(parentRoute);
    } catch {
      // ponytail: hook already toasts on error
    }
  }

  async function handleProcess(slug: string) {
    try {
      const result = await processMutation.mutateAsync({
        slug,
        recordId: entityId!,
        modelName,
      });
      if (result?.summary || result?.exportUri) {
        setProcessResult({
          summary: result.summary ?? "Process completed.",
          exportUri: result.exportUri,
        });
      } else {
        toast.success("Process completed");
      }
    } catch {
      // ponytail: hook already toasts on error
    }
  }

  // ponytail: error state — detail fetch failed, show retry instead of infinite skeleton
  if (isEditMode && isError) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <p className="text-muted-foreground text-sm">Failed to load record.</p>
        <Button variant="outline" size="sm" onClick={() => router.refresh()}>
          Retry
        </Button>
      </div>
    );
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

  const entityName = isEditMode ? recordDisplayName(formData, currentTab?.parentColumnName) : "";

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href={parentRoute}>
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
                {(drillPath ?? []).map((seg, i) => {
                  const segTab = tabs.find((t) => t.slug === seg.tabSlug);
                  return (
                    <React.Fragment key={`${seg.tabSlug}-${seg.id}`}>
                      {segTab && segTab.TabLevel > 0 && (
                        <>
                          <BreadcrumbSeparator />
                          <BreadcrumbItem>
                            <BreadcrumbPage>{segTab.Name}</BreadcrumbPage>
                          </BreadcrumbItem>
                        </>
                      )}
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                          <Link href={ancestorRoutes[i]}>{ancestorNames[i]}</Link>
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                    </React.Fragment>
                  );
                })}
                {currentTab && currentTab.TabLevel > 0 && (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{currentTab.Name}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{isEditMode ? entityName || `#${entityId}` : "Add"}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={parentRoute}>{isEditMode && locked ? "Back" : "Cancel"}</Link>
            </Button>
            {!locked && (
              <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending || !isDirty}>
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            )}
            {/* ponytail: Actions dropdown — Delete + process buttons (edit mode only) */}
            {isEditMode && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Actions">
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {processes.length > 0 && (
                    <>
                      <DropdownMenuLabel>Process</DropdownMenuLabel>
                      {processes.map((proc) => (
                        <DropdownMenuItem
                          key={proc.slug}
                          disabled={processMutation.isPending}
                          onSelect={() => handleProcess(proc.slug)}
                        >
                          {proc.isReport && <Printer className="mr-2 size-4" />}
                          {proc.label}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={deleteMutation.isPending}
                    onSelect={() => setShowDelete(true)}
                  >
                    <Trash2 className="mr-2 size-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <EntityTabsView
          windowSlug={windowSlug}
          entityId={isEditMode ? entityId : null}
          activeTab={activeTabResolved}
          onTabChange={setActiveTab}
          currentTabSlug={currentTab?.slug}
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

      {/* ponytail: Delete confirmation */}
      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title={`Delete ${entityName || "record"}?`}
        description="This action cannot be undone. The record will be permanently deleted."
        confirmText="Delete"
        destructive
        onConfirm={handleDelete}
        loading={deleteMutation.isPending}
      />

      {/* ponytail: Process result dialog */}
      <Dialog open={!!processResult} onOpenChange={(open) => !open && setProcessResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Result</DialogTitle>
            {processResult?.exportUri && (
              <DialogDescription>
                <a
                  href={processResult.exportUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Download report
                </a>
              </DialogDescription>
            )}
          </DialogHeader>
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap text-sm">{processResult?.summary}</pre>
        </DialogContent>
      </Dialog>
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

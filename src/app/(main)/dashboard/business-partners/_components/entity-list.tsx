"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import {
  type ColumnFiltersState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { Download, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useBulkDelete,
  useEntityList,
  useTabFields,
  useUpdateEntity,
  useWindowTabsCached,
} from "@/lib/idempiere/entity-hooks";

import { buildColumns } from "./entity-columns";
import { EntityTable } from "./entity-table";

export interface EntityListProps {
  windowSlug: string;
  modelName: string;
  title: string;
  description?: string;
  basePath: string; // e.g. "/dashboard/business-partners"
  // ponytail: optional search fields for server-side search (default: Name + Value)
  searchFields?: string[];
}

export function EntityList({
  windowSlug,
  modelName,
  title,
  description,
  basePath,
  searchFields = ["Name", "Value"],
}: EntityListProps) {
  const router = useRouter();

  // ── State ─────────────────────────────────────────────────
  const [search, setSearch] = React.useState("");
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 });
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "Name", desc: false }]);
  const [showBulkDelete, setShowBulkDelete] = React.useState(false);

  // ponytail: debounce search — 300ms
  const debouncedSearch = useDebounce(search, 300);

  // ── Data queries ──────────────────────────────────────────
  const { tabs, headerTab } = useWindowTabsCached(windowSlug).data ?? {};
  const { data: fields = [] } = useTabFields(headerTab?.id ?? 0, windowSlug);
  const { data, isPending, isFetching } = useEntityList(modelName, {
    page: pagination.pageIndex,
    pageSize: pagination.pageSize,
    search: debouncedSearch || undefined,
    orderBy: sorting[0] ? `${sorting[0].id} ${sorting[0].desc ? "desc" : "asc"}` : undefined,
  });

  const records = data?.records ?? [];
  const totalCount = data?.totalCount ?? 0;
  const pageCount = data?.pageCount ?? 1;

  // ── Column visibility from metadata ───────────────────────
  React.useEffect(() => {
    if (fields.length === 0) return;
    const vis: VisibilityState = {};
    for (const f of fields) {
      if (f.columnName && f.isDisplayedGrid === false) vis[f.columnName] = false;
    }
    vis.search = false;
    setColumnVisibility(vis);
  }, [fields]);

  // ── Mutations ─────────────────────────────────────────────
  const deleteMut = useBulkDelete(modelName);
  const updateMut = useUpdateEntity(modelName);

  const columns = React.useMemo<ReturnType<typeof buildColumns>>(
    () =>
      buildColumns(fields, {
        onView: (row) => router.push(`${basePath}/${row.id}`),
        onEdit: (row) => router.push(`${basePath}/${row.id}`),
        onToggleActive: async (row) => {
          const newActive = !(row.IsActive !== false);
          updateMut.mutate({ id: row.id, data: { IsActive: newActive } });
        },
      }),
    [fields, router, basePath, updateMut],
  );

  // ── Table ─────────────────────────────────────────────────
  const table = useReactTable({
    data: records,
    columns,
    state: { rowSelection, sorting, columnFilters, columnVisibility, pagination },
    // ponytail: server-side pagination
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getRowId: (row) => row.id.toString(),
    autoResetPageIndex: false,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  // ── Handlers ──────────────────────────────────────────────
  function handleExport() {
    const rows = table.getRowModel().rows;
    if (!rows.length) return;
    const visibleCols = table
      .getVisibleLeafColumns()
      .filter((c) => c.id !== "select" && c.id !== "actions" && c.id !== "search");
    const header = visibleCols.map((c) => c.id).join(",");
    const body = rows
      .map((r) =>
        visibleCols
          .map((c) => {
            const val = r.original[c.id];
            const str =
              typeof val === "object" && val !== null
                ? ((val as { identifier?: string }).identifier ?? "")
                : String(val ?? "");
            return /["\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${modelName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleBulkDelete() {
    setShowBulkDelete(true);
  }

  function confirmBulkDelete() {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    if (!selectedRows.length) return;
    deleteMut.mutate(
      selectedRows.map((r) => r.original.id),
      {
        onSuccess: () => {
          setRowSelection({});
          setShowBulkDelete(false);
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader className="border-b has-data-[slot=card-action]:grid-cols-1 md:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
        <CardTitle className="text-xl leading-none">
          {title}
          {!isPending && <span className="ml-2 font-normal text-muted-foreground text-sm">({totalCount} total)</span>}
        </CardTitle>
        {description && <CardDescription className="max-w-sm leading-snug">{description}</CardDescription>}
        <CardAction className="col-start-1 row-start-auto flex w-full flex-wrap justify-start gap-2 justify-self-stretch md:col-start-2 md:row-span-2 md:row-start-1 md:w-auto md:flex-nowrap md:justify-end md:justify-self-end">
          <Input
            className="h-7 w-full md:w-64"
            placeholder={`Search ${title.toLowerCase()}...`}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              table.setPageIndex(0);
            }}
          />
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download /> Export
          </Button>
          <Button size="sm" onClick={() => router.push(`${basePath}/new`)}>
            <Plus /> Add
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={
                (table.getColumn("IsActive")?.getFilterValue() as string) === "true"
                  ? "Active"
                  : (table.getColumn("IsActive")?.getFilterValue() as string) === "false"
                    ? "Inactive"
                    : "All"
              }
              onValueChange={(value: string) => {
                const filterVal = value === "Active" ? "true" : value === "Inactive" ? "false" : undefined;
                table.getColumn("IsActive")?.setFilterValue(filterVal);
                table.setPageIndex(0);
              }}
            >
              <SelectTrigger size="sm">
                <span className="text-muted-foreground">Status:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectGroup>
                  {["All", "Active", "Inactive"].map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm tabular-nums">
              {isPending ? "Loading..." : `${selectedCount} selected`}
            </span>
            {selectedCount > 0 && (
              <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={deleteMut.isPending}>
                <Trash2 />
                {deleteMut.isPending ? "Deleting..." : `Delete Selected (${selectedCount})`}
              </Button>
            )}
          </div>
        </div>

        {isPending ? (
          <EntityTableSkeleton
            columnCount={Math.min(fields.filter((f) => f.isDisplayedGrid !== false).length || 5, 8)}
          />
        ) : (
          <EntityTable table={table} />
        )}
        {isFetching && !isPending && <div className="px-4 text-muted-foreground text-xs">Refreshing...</div>}
      </CardContent>

      <ConfirmDialog
        open={showBulkDelete}
        onOpenChange={setShowBulkDelete}
        title={`Delete ${selectedCount} record(s)?`}
        description="This action cannot be undone. All selected records will be permanently deleted."
        confirmText="Delete All"
        destructive
        onConfirm={confirmBulkDelete}
        loading={deleteMut.isPending}
      />
    </Card>
  );
}

// ── Skeleton ─────────────────────────────────────────────────

function EntityTableSkeleton({ columnCount = 6 }: { columnCount?: number }) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="border-b">
        <div className="flex gap-4 px-4 py-4">
          {Array.from({ length: columnCount }).map((_, i) => (
            <div key={i} className="h-4 flex-1 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
      <div className="space-y-2 px-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            {Array.from({ length: columnCount }).map((_, j) => (
              <div key={j} className="h-4 flex-1 animate-pulse rounded bg-muted/50" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Debounce hook ────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

"use client";
"use no memo";

import * as React from "react";

import { usePathname, useRouter } from "next/navigation";

import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { Columns3, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type EntityRow, useBulkDelete, useChildRecords } from "@/lib/idempiere/entity-hooks";
import type { WindowField } from "@/lib/idempiere/types";

import { buildColumns, TABLE_HIDDEN } from "./entity-columns";
import { EntityTable } from "./entity-table";
import { buildGridToolbar, EntityToolbar } from "./entity-toolbar";

// ponytail: child tab grid — reuses the header table (buildColumns + EntityTable) for full UI parity:
// sorting, pagination, column picker, bulk delete. Rows navigate to the child form page.
interface ChildTabGridProps {
  tableName: string;
  parentColumnName: string;
  parentId: number | string;
  tabSlug: string;
  fields: WindowField[];
}

export function ChildTabGrid({ tableName, parentColumnName, parentId, tabSlug, fields }: ChildTabGridProps) {
  const pathname = usePathname();
  const router = useRouter();
  // ponytail: child route = current page + tabSlug; rows append /{id}, Add appends /new
  const childBase = `${pathname}/${tabSlug}`;
  const { data, isPending: loading, refetch } = useChildRecords(tableName, parentColumnName, parentId);
  const rows = data?.rows ?? [];
  const truncated = data?.truncated ?? false;
  const deleteMut = useBulkDelete(tableName);

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 });
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [showBulkDelete, setShowBulkDelete] = React.useState(false);

  const columns = React.useMemo(
    () => buildColumns(fields, { rowHref: (r) => `${childBase}/${rowIdOf(r) ?? ""}` }),
    [fields, childBase],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, pagination, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    autoResetPageIndex: false,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  function confirmBulkDelete() {
    const selected = table.getFilteredSelectedRowModel().rows;
    const ids = selected.map((r) => rowIdOf(r.original)).filter((x): x is number => typeof x === "number");
    if (!ids.length) {
      setShowBulkDelete(false);
      return;
    }
    deleteMut.mutate(ids, {
      onSuccess: () => {
        setRowSelection({});
        setShowBulkDelete(false);
      },
    });
  }

  // ponytail: CSV export — current page rows only
  function handleExport() {
    if (!rows.length) return;
    const visibleCols = table.getVisibleLeafColumns().filter((c) => c.id !== "select");
    const header = visibleCols.map((c) => c.id).join(",");
    const body = rows
      .map((r) =>
        visibleCols
          .map((c) => {
            const val = r[c.id as keyof EntityRow];
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
    a.download = `${tableName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground text-sm">
        <RefreshCw className="size-3.5 animate-spin" /> Loading...
      </div>
    );
  }

  // ponytail: build CRUD toolbar for child grid
  const gridActions = buildGridToolbar({
    selectedCount,
    deleting: deleteMut.isPending,
    basePath: childBase,
    onAdd: () => router.push(`${childBase}/new`),
    onRefresh: () => refetch(),
    onExport: handleExport,
    onDelete: () => setShowBulkDelete(true),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <EntityToolbar actions={gridActions} />

        {/* ponytail: Column picker — stays separate (not a CRUD action) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <Columns3 className="size-4" />
              <span className="hidden sm:inline">Columns</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((c) => !TABLE_HIDDEN.has(c.id))
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {typeof column.columnDef.header === "string" ? column.columnDef.header : column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">No records. Click Add to create one.</p>
      ) : (
        <EntityTable table={table} basePath={childBase} resolveRowId={rowIdOf} />
      )}
      {truncated && rows.length > 0 && (
        <p className="text-muted-foreground text-xs">Showing first 200 records — more exist on the server.</p>
      )}

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
    </div>
  );
}

// ponytail: iDempiere returns synthetic `id` for most tables, but some omit it — fall back to the numeric PK column.
function rowIdOf(row: EntityRow): number | string | undefined {
  if (row.id != null) return row.id;
  // ponytail: some tables (e.g. r_contactinterest) expose only `uid` (UUID), no numeric id
  if (row.uid != null) return row.uid;
  const pkKey = Object.keys(row).find((k) => /_ID$/i.test(k) && typeof row[k] === "number");
  return pkKey ? (row[pkKey] as number) : undefined;
}

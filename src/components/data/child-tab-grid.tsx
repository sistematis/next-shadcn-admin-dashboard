"use client";
"use no memo";

import * as React from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { Columns3, Plus, Trash2 } from "lucide-react";

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
  // ponytail: child route = current page + tabSlug; rows append /{id}, Add appends /new
  const childBase = `${pathname}/${tabSlug}`;
  const { data, isPending: loading } = useChildRecords(tableName, parentColumnName, parentId);
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

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading...</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <>
              <span className="text-muted-foreground text-sm tabular-nums">{selectedCount} selected</span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowBulkDelete(true)}
                disabled={deleteMut.isPending}
              >
                <Trash2 className="size-4" />
                {deleteMut.isPending ? "Deleting..." : `Delete Selected (${selectedCount})`}
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 className="size-4" />
                Columns
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
          <Button size="sm" asChild>
            <Link href={`${childBase}/new`}>
              <Plus className="size-4" /> Add
            </Link>
          </Button>
        </div>
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

"use client";

import * as React from "react";

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
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteModel } from "@/lib/idempiere/client";
import { getTokenFromStorage } from "@/lib/idempiere/token-utils";

import { buildColumns } from "./bp-columns";
import { BPTable } from "./bp-table";
import { DetailDrawer } from "./detail-drawer";
import { type DialogMode, PartnerDialog } from "./partner-dialog";
import type { BPRow } from "./use-business-partners";
import { useBusinessPartners } from "./use-business-partners";

const statusFilters = ["All", "Active", "Inactive"];

export function BusinessPartners() {
  const { data, fields, loading, totalCount, refetch } = useBusinessPartners();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogMode, setDialogMode] = React.useState<DialogMode>("add");
  const [dialogData, setDialogData] = React.useState<BPRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerData, setDrawerData] = React.useState<BPRow | null>(null);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);

  const columns = React.useMemo(
    () =>
      buildColumns(fields, {
        onView: (row) => {
          setDrawerData(row);
          setDrawerOpen(true);
        },
        onEdit: (row) => {
          setDialogData(row);
          setDialogMode("edit");
          setDialogOpen(true);
        },
      }),
    [fields],
  );

  const [rowSelection, setRowSelection] = React.useState({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 });

  // ponytail: column visibility purely from AD_Field.IsDisplayedGrid — no localStorage, no Configure button
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "Name", desc: false }]);

  React.useEffect(() => {
    if (fields.length === 0) return;
    const vis: VisibilityState = {};
    for (const f of fields) {
      if (f.columnName && f.isDisplayedGrid === false) vis[f.columnName] = false;
    }
    vis.search = false;
    setColumnVisibility(vis);
  }, [fields]);

  const table = useReactTable({
    data,
    columns,
    state: { rowSelection, sorting, columnFilters, columnVisibility, pagination },
    onPaginationChange: setPagination,
    getRowId: (row) => row.id.toString(),
    autoResetPageIndex: false,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const searchQuery = (table.getColumn("search")?.getFilterValue() as string | undefined) ?? "";
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  function setColumnSelectFilter(columnId: string, value: string) {
    table.getColumn(columnId)?.setFilterValue(value === "All" ? undefined : value);
    table.setPageIndex(0);
  }

  function handleExport() {
    const rows = table.getFilteredRowModel().rows;
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
    a.download = "business-partners.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleBulkDelete() {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    if (!selectedRows.length) return;

    const token = getTokenFromStorage();
    if (!token) {
      toast.error("Not authenticated");
      return;
    }

    setBulkDeleting(true);
    try {
      await Promise.all(selectedRows.map((r) => deleteModel("c_bpartner", r.original.id, token)));
      toast.success(`Deleted ${selectedRows.length} business partner(s)`);
      setRowSelection({});
      await refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Failed to delete some partners", { description: msg });
      await refetch();
    } finally {
      setBulkDeleting(false);
    }
  }

  function handleAddPartner() {
    setDialogData(null);
    setDialogMode("add");
    setDialogOpen(true);
  }

  function handleEditFromDrawer() {
    setDrawerOpen(false);
    setDialogData(drawerData);
    setDialogMode("edit");
    setDialogOpen(true);
  }

  return (
    <Card>
      <CardHeader className="border-b has-data-[slot=card-action]:grid-cols-1 md:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
        <CardTitle className="text-xl leading-none">
          Business Partners
          {!loading && <span className="ml-2 font-normal text-muted-foreground text-sm">({totalCount} total)</span>}
        </CardTitle>
        <CardDescription className="max-w-sm leading-snug">
          Manage customers, vendors, and business partner relationships.
        </CardDescription>
        <CardAction className="col-start-1 row-start-auto flex w-full flex-wrap justify-start gap-2 justify-self-stretch md:col-start-2 md:row-span-2 md:row-start-1 md:w-auto md:flex-nowrap md:justify-end md:justify-self-end">
          <Input
            className="h-7 w-full md:w-64"
            placeholder="Search partners..."
            value={searchQuery}
            onChange={(event) => {
              table.getColumn("search")?.setFilterValue(event.target.value || undefined);
              table.setPageIndex(0);
            }}
          />
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download /> Export
          </Button>
          <Button size="sm" onClick={handleAddPartner}>
            <Plus /> Add Partner
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={statusFilters[0]}
              onValueChange={(value: string) => {
                const filterVal = value === "Active" ? "true" : value === "Inactive" ? "false" : "All";
                setColumnSelectFilter("IsActive", filterVal);
              }}
            >
              <SelectTrigger size="sm">
                <span className="text-muted-foreground">Status:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectGroup>
                  {statusFilters.map((option) => (
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
              {loading ? "Loading..." : `${selectedCount} selected`}
            </span>
            {selectedCount > 0 && (
              <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={bulkDeleting}>
                <Trash2 />
                {bulkDeleting ? "Deleting..." : `Delete Selected (${selectedCount})`}
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
              <span className="text-sm">Loading business partners...</span>
            </div>
          </div>
        ) : (
          <BPTable table={table} />
        )}
      </CardContent>

      <PartnerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        initialData={dialogData}
        onSaved={refetch}
      />
      <DetailDrawer open={drawerOpen} onOpenChange={setDrawerOpen} data={drawerData} onEdit={handleEditFromDrawer} />
    </Card>
  );
}

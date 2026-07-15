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
import { Download, Plus, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deleteModel } from "@/lib/idempiere/client";

import { buildColumns, getPickableFields } from "./bp-columns";
import { BPTable } from "./bp-table";
import { DetailDrawer } from "./detail-drawer";
import { type DialogMode, PartnerDialog } from "./partner-dialog";
import type { BPRow } from "./use-business-partners";
import { useBusinessPartners } from "./use-business-partners";

const statusFilters = ["All", "Active", "Inactive"];

const DEFAULT_VISIBLE_FIELDS = new Set([
  "Name",
  "IsCustomer",
  "IsVendor",
  "C_BP_Group_ID",
  "SO_CreditUsed",
  "IsActive",
]);
const BP_CONFIG_KEY = "erp_bp_table_config";

interface SavedConfig {
  columnVisibility: VisibilityState;
  columnOrder: string[];
  sorting: SortingState;
}

function loadConfig(): SavedConfig | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(BP_CONFIG_KEY);
  return raw ? (JSON.parse(raw) as SavedConfig) : null;
}

function saveConfig(cfg: SavedConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(BP_CONFIG_KEY, JSON.stringify(cfg));
}

export function BusinessPartners() {
  const { data, fields, loading, totalCount, refetch } = useBusinessPartners();

  // ponytail: dialog/drawer state — single reusable PartnerDialog for add+edit, DetailDrawer for view
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
  const pickableFields = React.useMemo(() => getPickableFields(fields), [fields]);

  const [rowSelection, setRowSelection] = React.useState({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 });

  // ponytail: column visibility + order + sorting persisted via useTableConfig hook
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [columnOrder, setColumnOrder] = React.useState<string[]>([]);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "Name", desc: false }]);
  const [configDirty, setConfigDirty] = React.useState(false);

  const loaded = React.useRef(false);
  React.useEffect(() => {
    if (fields.length === 0 || loaded.current) return;
    loaded.current = true;
    const saved = loadConfig();
    if (saved) {
      saved.columnVisibility.search = false;
      setColumnVisibility(saved.columnVisibility);
      if (saved.columnOrder.length) setColumnOrder(saved.columnOrder);
      if (saved.sorting.length) setSorting(saved.sorting);
      return;
    }
    const vis: VisibilityState = {};
    for (const f of fields) {
      if (f.columnName && !DEFAULT_VISIBLE_FIELDS.has(f.columnName)) vis[f.columnName] = false;
    }
    vis.search = false;
    setColumnVisibility(vis);
  }, [fields]);

  const markDirty = React.useCallback(() => {
    setConfigDirty(true);
  }, []);

  const onVisibilityChange = React.useCallback(
    (updater: VisibilityState | ((prev: VisibilityState) => VisibilityState)) => {
      setColumnVisibility(updater);
      markDirty();
    },
    [markDirty],
  );

  const onOrderChange = React.useCallback(
    (updater: string[] | ((prev: string[]) => string[])) => {
      setColumnOrder(updater);
      markDirty();
    },
    [markDirty],
  );

  const onSortingChange = React.useCallback(
    (updater: SortingState | ((prev: SortingState) => SortingState)) => {
      setSorting(updater);
      markDirty();
    },
    [markDirty],
  );

  function handleSave() {
    saveConfig({ columnVisibility, columnOrder, sorting });
    setConfigDirty(false);
    toast.success("Table layout saved");
  }

  function handleReset() {
    localStorage.removeItem(BP_CONFIG_KEY);
    const vis: VisibilityState = {};
    for (const f of fields) {
      if (f.columnName && !DEFAULT_VISIBLE_FIELDS.has(f.columnName)) vis[f.columnName] = false;
    }
    vis.search = false;
    setColumnVisibility(vis);
    setColumnOrder([]);
    setSorting([{ id: "Name", desc: false }]);
    setConfigDirty(true);
    toast.info("Reset to defaults — click Save to persist");
  }

  const table = useReactTable({
    data,
    columns,
    state: { rowSelection, sorting, columnFilters, columnVisibility, columnOrder, pagination },
    onPaginationChange: setPagination,
    getRowId: (row) => row.id.toString(),
    autoResetPageIndex: false,
    enableRowSelection: true,
    enableColumnPinning: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: onSortingChange,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: onVisibilityChange,
    onColumnOrderChange: onOrderChange,
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
            return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
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

  // ponytail: bulk delete selected rows — concurrent DELETE calls
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

  // ponytail: search filter for the column config popover — helps when table has 30+ fields
  const [colSearch, setColSearch] = React.useState("");
  const filteredPickable = React.useMemo(() => {
    if (!colSearch) return pickableFields;
    const q = colSearch.toLowerCase();
    return pickableFields.filter((f) => f.Name.toLowerCase().includes(q) || f.columnName.toLowerCase().includes(q));
  }, [pickableFields, colSearch]);

  // ponytail: reorder visible columns via ↑/↓ — sorted by current columnOrder so it reflects actual display order
  const visibleFields = React.useMemo(() => {
    const visible = pickableFields.filter((f) => table.getColumn(f.columnName)?.getIsVisible());
    if (columnOrder.length === 0) return visible;
    return [...visible].sort((a, b) => {
      const ai = columnOrder.indexOf(a.columnName);
      const bi = columnOrder.indexOf(b.columnName);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [pickableFields, table, columnOrder]);

  function moveColumn(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= visibleFields.length) return;
    const reordered = [...visibleFields];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    const visibleIds = reordered.map((f) => f.columnName);
    const hiddenIds = pickableFields.filter((f) => !visibleIds.includes(f.columnName)).map((f) => f.columnName);
    setColumnOrder(["select", ...visibleIds, ...hiddenIds, "actions", "search"]);
    markDirty();
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
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <SlidersHorizontal /> Configure
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <Tabs defaultValue="visibility">
                <TabsList className="w-full">
                  <TabsTrigger value="visibility" className="flex-1">
                    Visibility
                  </TabsTrigger>
                  <TabsTrigger value="order" className="flex-1">
                    Order
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="visibility" className="p-3">
                  <Input
                    className="mb-2 h-7"
                    placeholder="Search columns..."
                    value={colSearch}
                    onChange={(e) => setColSearch(e.target.value)}
                  />
                  <ScrollArea className="h-64 pr-2">
                    <div className="flex flex-col gap-1">
                      {filteredPickable.map((f) => (
                        // biome-ignore lint/a11y/noLabelWithoutControl: checkbox list pattern — label wraps interactive element
                        <label
                          key={f.columnName}
                          className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/50"
                        >
                          <Checkbox
                            id={`col-toggle-${f.columnName}`}
                            checked={table.getColumn(f.columnName)?.getIsVisible() ?? false}
                            onCheckedChange={(value) => table.getColumn(f.columnName)?.toggleVisibility(!!value)}
                          />
                          <span className="truncate text-sm capitalize">{f.Name}</span>
                        </label>
                      ))}
                      {filteredPickable.length === 0 && (
                        <span className="py-4 text-center text-muted-foreground text-xs">No columns found</span>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="order" className="p-3">
                  <p className="mb-2 text-muted-foreground text-xs">Use ↑ ↓ to reorder visible columns</p>
                  <ScrollArea className="h-64 pr-2">
                    <div className="flex flex-col gap-0.5">
                      {visibleFields.map((f, idx) => (
                        <div
                          key={f.columnName}
                          className="flex items-center justify-between rounded px-1 py-1 hover:bg-muted/50"
                        >
                          <span className="flex-1 truncate text-sm capitalize">{f.Name}</span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="rounded p-1 text-xs hover:bg-muted disabled:opacity-30"
                              onClick={() => moveColumn(idx, -1)}
                              disabled={idx === 0}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="rounded p-1 text-xs hover:bg-muted disabled:opacity-30"
                              onClick={() => moveColumn(idx, 1)}
                              disabled={idx === visibleFields.length - 1}
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                      ))}
                      {visibleFields.length === 0 && (
                        <span className="py-4 text-center text-muted-foreground text-xs">
                          No visible columns to reorder
                        </span>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </PopoverContent>
          </Popover>
          {configDirty && (
            <Button variant="default" size="sm" onClick={handleSave}>
              Save Layout
            </Button>
          )}
          {configDirty && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw /> Reset
            </Button>
          )}
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

// ponytail: read token from storage — works outside React tree (bulk delete handler)
function getTokenFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  const useLocal = localStorage.getItem("erp_remember") === "true";
  const s = useLocal ? localStorage : sessionStorage;
  const raw = s.getItem("erp_token");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as string;
  } catch {
    return raw;
  }
}

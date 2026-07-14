"use client";

/**
 * ponytail: reusable TanStack Table config — column visibility, order, and sorting
 * persisted to localStorage. One hook per table, keyed by storageKey.
 *
 * Usage:
 *   const cfg = useTableConfig("erp_bp", defaultVisibleFields);
 *   const table = useReactTable({ ..., ...cfg.tableProps });
 *   cfg.Toolbar()  // renders Columns dropdown + Save/Reset
 */

import * as React from "react";

import type { SortingState, VisibilityState } from "@tanstack/react-table";
import { ArrowUpDown, ChevronDown, ChevronUp, RotateCcw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TableConfig {
  columnVisibility: VisibilityState;
  columnOrder: string[];
  sorting: SortingState;
  isDirty: boolean;
  tableProps: {
    state: { columnVisibility: VisibilityState; columnOrder: string[]; sorting: SortingState };
    onColumnVisibilityChange: React.Dispatch<React.SetStateAction<VisibilityState>>;
    onColumnOrderChange: React.Dispatch<React.SetStateAction<string[]>>;
    onSortingChange: React.Dispatch<React.SetStateAction<SortingState>>;
  };
  setColumnVisibility: React.Dispatch<React.SetStateAction<VisibilityState>>;
  setColumnOrder: React.Dispatch<React.SetStateAction<string[]>>;
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>;
  handleSave: () => void;
  handleReset: () => void;
  isDirtyRef: React.MutableRefObject<boolean>;
}

interface SavedConfig {
  columnVisibility: VisibilityState;
  columnOrder: string[];
  sorting: SortingState;
}

function loadConfig(key: string): SavedConfig | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as SavedConfig) : null;
}

function saveConfig(key: string, cfg: SavedConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(cfg));
}

export function useTableConfig(
  storageKey: string,
  defaultVisibleFields: Set<string>,
  fields: { columnName: string }[],
): TableConfig {
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [columnOrder, setColumnOrder] = React.useState<string[]>([]);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [isDirty, setIsDirty] = React.useState(false);
  const isDirtyRef = React.useRef(false);

  // Apply saved config or defaults — runs once when fields load
  const loaded = React.useRef(false);
  React.useEffect(() => {
    if (fields.length === 0 || loaded.current) return;
    loaded.current = true;

    const saved = loadConfig(storageKey);
    if (saved) {
      setColumnVisibility(saved.columnVisibility);
      setColumnOrder(saved.columnOrder);
      setSorting(saved.sorting);
      return;
    }

    // Defaults: hide non-default fields
    const vis: VisibilityState = {};
    for (const f of fields) {
      if (f.columnName && !defaultVisibleFields.has(f.columnName)) {
        vis[f.columnName] = false;
      }
    }
    vis.search = false;
    setColumnVisibility(vis);
  }, [fields, storageKey, defaultVisibleFields]);

  // Wrap setters to track dirty state
  const onVisibilityChange = React.useCallback(
    (updater: VisibilityState | ((prev: VisibilityState) => VisibilityState)) => {
      setColumnVisibility(updater as VisibilityState | ((prev: VisibilityState) => VisibilityState));
      isDirtyRef.current = true;
      setIsDirty(true);
    },
    [],
  );

  const onOrderChange = React.useCallback((updater: string[] | ((prev: string[]) => string[])) => {
    setColumnOrder(updater as string[] | ((prev: string[]) => string[]));
    isDirtyRef.current = true;
    setIsDirty(true);
  }, []);

  const onSortingChange = React.useCallback((updater: SortingState | ((prev: SortingState) => SortingState)) => {
    setSorting(updater as SortingState | ((prev: SortingState) => SortingState));
    isDirtyRef.current = true;
    setIsDirty(true);
  }, []);

  const handleSave = React.useCallback(() => {
    saveConfig(storageKey, { columnVisibility, columnOrder, sorting });
    isDirtyRef.current = false;
    setIsDirty(false);
    toast.success("Table layout saved");
  }, [storageKey, columnVisibility, columnOrder, sorting]);

  const handleReset = React.useCallback(() => {
    if (typeof window !== "undefined") localStorage.removeItem(storageKey);
    const vis: VisibilityState = {};
    for (const f of fields) {
      if (f.columnName && !defaultVisibleFields.has(f.columnName)) {
        vis[f.columnName] = false;
      }
    }
    vis.search = false;
    setColumnVisibility(vis);
    setColumnOrder([]);
    setSorting([]);
    isDirtyRef.current = true;
    setIsDirty(true);
    toast.info("Reset to defaults — click Save to persist");
  }, [fields, storageKey, defaultVisibleFields]);

  return {
    columnVisibility,
    columnOrder,
    sorting,
    isDirty,
    tableProps: {
      state: { columnVisibility, columnOrder, sorting },
      onColumnVisibilityChange: onVisibilityChange,
      onColumnOrderChange: onOrderChange,
      onSortingChange: onSortingChange,
    },
    setColumnVisibility,
    setColumnOrder,
    setSorting,
    handleSave,
    handleReset,
    isDirtyRef,
  };
}

// ── Sortable header button ──────────────────────────────────

export function SortableHeader({
  column,
  children,
}: {
  column: {
    getCanSort: () => boolean;
    getIsSorted: () => false | "asc" | "desc";
    toggleSorting: (desc?: boolean) => void;
  };
  children: React.ReactNode;
}) {
  if (!column.getCanSort()) return <span>{children}</span>;
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      className="-ml-1 flex items-center gap-1 hover:text-foreground"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {children}
      {sorted === "asc" ? (
        <ChevronUp className="size-3" />
      ) : sorted === "desc" ? (
        <ChevronDown className="size-3" />
      ) : (
        <ArrowUpDown className="size-3 opacity-50" />
      )}
    </button>
  );
}

// ── Column config dropdown with reorder + visibility + save ──

export function TableColumnConfig({
  fields,
  table,
  isDirty,
  onSave,
  onReset,
}: {
  fields: { columnName: string; Name: string }[];
  table: {
    getColumn: (
      id: string,
    ) =>
      | { getIsVisible: () => boolean; toggleVisibility: (v?: boolean) => void; getCanHide: () => boolean }
      | undefined;
    getAllLeafColumns: () => {
      id: string;
      getIsVisible: () => boolean;
      toggleVisibility: (v?: boolean) => void;
      getCanHide: () => boolean;
    }[];
  };
  isDirty: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  function moveColumn(idx: number, dir: -1 | 1) {
    const visibleFields = fields.filter((f) => table.getColumn(f.columnName)?.getIsVisible());
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= visibleFields.length) return;
    // ponytail: reorder by swapping in the visible fields array — TanStack columnOrder controls display order
    const reordered = [...visibleFields];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    // Build full order: reordered visible + hidden + chrome columns
    const allIds = table.getAllLeafColumns().map((c) => c.id);
    const visibleIds = reordered.map((f) => f.columnName);
    const rest = allIds.filter((id) => !visibleIds.includes(id));
    // Column order: select first, then visible in order, then hidden, then actions
    const fullOrder = ["select", ...visibleIds, ...rest.filter((id) => id !== "select" && id !== "actions"), "actions"];
    // This needs to be wired to the table's setColumnOrder — caller handles via onOrderChange
    // For now, we emit a custom event
    window.dispatchEvent(new CustomEvent("table-column-reorder", { detail: fullOrder }));
  }

  const visibleFields = fields.filter((f) => table.getColumn(f.columnName)?.getIsVisible());

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <SlidersHorizontal /> Columns
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-96 w-64 overflow-y-auto">
          <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {fields.map((f) => (
            <DropdownMenuCheckboxItem
              key={f.columnName}
              className="capitalize"
              checked={table.getColumn(f.columnName)?.getIsVisible() ?? false}
              onCheckedChange={(value) => table.getColumn(f.columnName)?.toggleVisibility(!!value)}
            >
              {f.Name}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Reorder visible</DropdownMenuLabel>
          {visibleFields.map((f, idx) => (
            <div key={f.columnName} className="flex items-center justify-between px-2 py-1">
              <span className="truncate text-sm capitalize">{f.Name}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded p-1 text-xs hover:bg-muted"
                  onClick={() => moveColumn(idx, -1)}
                  disabled={idx === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-xs hover:bg-muted"
                  onClick={() => moveColumn(idx, 1)}
                  disabled={idx === visibleFields.length - 1}
                >
                  ↓
                </button>
              </div>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {isDirty && (
        <Button variant="default" size="sm" onClick={onSave}>
          Save Layout
        </Button>
      )}
      {isDirty && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw /> Reset
        </Button>
      )}
    </>
  );
}

"use client";
"use no memo";

import type { ColumnDef } from "@tanstack/react-table";
import { Check, MoreHorizontal, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isBooleanField, isFKField, isNumberField, isPickableField } from "@/lib/idempiere/field-utils";
import type { WindowField } from "@/lib/idempiere/types";

import type { BPRow } from "./use-business-partners";

// Columns excluded from the "Columns" dropdown (internal/helper columns)
const TABLE_HIDDEN = new Set(["search", "select", "actions"]);

/** Generate column defs from window field metadata + hardcoded chrome (select, search, actions) */
export interface RowActions {
  onView: (row: BPRow) => void;
  onEdit: (row: BPRow) => void;
  onToggleActive: (row: BPRow) => void;
}

export function buildColumns(fields: WindowField[], actions?: RowActions): ColumnDef<BPRow>[] {
  // ponytail: table columns use isDisplayedGrid + seqNoGrid, form uses isDisplayed + seqNo.
  // If isDisplayedGrid is undefined (legacy getWindowFields), fall back to all pickable.
  const gridFields = fields.filter((f) => f.isDisplayedGrid !== false);
  // ponytail: sort by seqNoGrid when available, preserve API order otherwise
  gridFields.sort((a, b) => (a.seqNoGrid ?? 999) - (b.seqNoGrid ?? 999));

  const cols: ColumnDef<BPRow>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            aria-label="Select all"
            checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            aria-label={`Select row`}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
          />
        </div>
      ),
      enableHiding: false,
      enableSorting: false,
    },
  ];

  for (const f of gridFields) {
    // ponytail: use centralized system field check instead of hardcoded set
    if (!isPickableField(f.columnName)) continue;
    if (TABLE_HIDDEN.has(f.columnName)) continue;
    const col = buildColumnDef(f);
    if (col) cols.push(col);
  }

  // Search helper column (hidden, used by the search box filter)
  cols.push({
    id: "search",
    accessorFn: (row) => `${row.Name ?? ""} ${row.Value ?? ""}`,
    filterFn: "includesString",
    enableHiding: true,
    enableSorting: false,
  });

  cols.push({
    id: "actions",
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => (
      <div className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Open actions"
              className="size-8 rounded-md text-muted-foreground hover:bg-muted/50"
              size="icon-sm"
              variant="ghost"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => actions?.onView(row.original)}>View details</DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions?.onEdit(row.original)}>Edit partner</DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* biome-ignore lint/style/noNestedTernary: two-way toggle */}
            <DropdownMenuItem
              variant={row.original.IsActive === false ? "default" : "destructive"}
              onClick={() => actions?.onToggleActive(row.original)}
            >
              {row.original.IsActive === false ? "Activate" : "Deactivate"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
    enableHiding: false,
    enableSorting: false,
  });

  return cols;
}

function buildColumnDef(f: WindowField): ColumnDef<BPRow> | null {
  const { columnName: key, Name: label } = f;

  // ponytail: all data columns are sortable by default
  const sortingEnabled = { enableSorting: true };

  // Boolean columns → check badge (AD_Reference_ID = 20 or columnName starts with "Is")
  if (isBooleanField(f)) {
    return {
      accessorKey: key,
      header: label,
      filterFn: "equalsString",
      ...sortingEnabled,
      cell: ({ row }) => {
        const val = row.original[key];
        // ponytail: IsActive=false → "Inactive" badge; other booleans stay empty when false
        if (!val && key === "IsActive") {
          return (
            <Badge variant="outline" className="gap-1 text-red-600">
              <X className="size-3" /> Inactive
            </Badge>
          );
        }
        return val ? (
          <Badge variant="outline" className="gap-1 text-emerald-600">
            <Check className="size-3" /> {label}
          </Badge>
        ) : null;
      },
    };
  }

  // Number/money columns → formatted (AD_Reference_ID = 11,12,22,37 or name heuristic)
  if (isNumberField(f)) {
    return {
      accessorKey: key,
      header: label,
      ...sortingEnabled,
      cell: ({ row }) => {
        const val = Number(row.original[key] ?? 0);
        return <div className="text-sm tabular-nums">{val.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>;
      },
    };
  }

  // Name → primary display (name + search key subtext)
  if (key === "Name") {
    return {
      accessorKey: key,
      header: label,
      ...sortingEnabled,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground text-sm">{String(row.original[key] ?? "(unnamed)")}</div>
          <div className="truncate text-muted-foreground text-xs">{String(row.original.Value ?? "")}</div>
        </div>
      ),
    };
  }

  // FK reference columns → show identifier (AD_Reference_ID = 18,19,30,21 or _ID suffix)
  if (isFKField(f)) {
    return {
      accessorKey: key,
      header: label,
      filterFn: "equalsString",
      ...sortingEnabled,
      sortingFn: (rowA, rowB) => {
        // ponytail: sort by identifier string for FK columns
        const a = (rowA.original[key] as { identifier?: string } | undefined)?.identifier ?? "";
        const b = (rowB.original[key] as { identifier?: string } | undefined)?.identifier ?? "";
        return a.localeCompare(b);
      },
      cell: ({ row }) => {
        const val = row.original[key] as { identifier?: string } | undefined;
        return <span className="text-sm">{val?.identifier ?? "-"}</span>;
      },
    };
  }

  // Scalar fallback
  return {
    accessorKey: key,
    header: label,
    filterFn: "includesString",
    ...sortingEnabled,
    cell: ({ row }) => {
      // ponytail: List/FK fields return {id, identifier} — extract identifier for display
      const val = row.original[key];
      const display =
        typeof val === "object" && val !== null
          ? ((val as { identifier?: string }).identifier ?? "")
          : String(val ?? "");
      return <span className="text-sm">{display}</span>;
    },
  };
}

/** Fields safe to show in the Columns picker dropdown */
export function getPickableFields(fields: WindowField[]): WindowField[] {
  return fields.filter((f) => isPickableField(f.columnName) && !TABLE_HIDDEN.has(f.columnName));
}

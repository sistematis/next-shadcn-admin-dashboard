"use client";
"use no memo";

import Link from "next/link";

import { type ColumnDef, flexRender } from "@tanstack/react-table";
import { Check, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { EntityRow } from "@/lib/idempiere/entity-hooks";
import { isBooleanField, isFKField, isNumberField, isPickableField } from "@/lib/idempiere/field-utils";
import type { WindowField } from "@/lib/idempiere/types";

// Columns excluded from the column picker (internal/helper columns)
export const TABLE_HIDDEN = new Set(["search", "select"]);

/** Generate column defs from window field metadata + select chrome. Row actions live on the detail page. */
export function buildColumns(
  fields: WindowField[],
  options?: { rowHref?: (row: EntityRow) => string },
): ColumnDef<EntityRow>[] {
  const gridFields = fields.filter((f) => f.isDisplayedGrid !== false);
  gridFields.sort((a, b) => (a.seqNoGrid ?? 999) - (b.seqNoGrid ?? 999));

  const cols: ColumnDef<EntityRow>[] = [
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

  // ponytail: first pickable column becomes the row's nav link (stretched-link rendered in EntityTable).
  const rowHref = options?.rowHref;
  let primaryAttached = false;
  for (const f of gridFields) {
    if (!isPickableField(f.columnName)) continue;
    if (TABLE_HIDDEN.has(f.columnName)) continue;
    const col = buildColumnDef(f);
    if (!col) continue;
    const linkIt = !primaryAttached && !!rowHref;
    cols.push(linkIt ? withRowLink(col, rowHref!) : col);
    primaryAttached = true;
  }

  return cols;
}

/**
 * ponytail: stretched-link — the primary cell renders as a real <a> whose ::after overlays the
 * whole row, so the row is clickable AND keyboard / middle-click accessible (fixes the tr->onClick a11y gap).
 * Interactive cells (the select checkbox) sit above the overlay via `relative z-10` in EntityTable.
 */
function withRowLink(col: ColumnDef<EntityRow>, rowHref: (row: EntityRow) => string): ColumnDef<EntityRow> {
  const cell = col.cell;
  if (!cell) return col;
  return {
    ...col,
    cell: (context) => (
      <Link href={rowHref(context.row.original)} className="after:absolute after:content-[''] after:inset-0">
        {flexRender(cell, context)}
      </Link>
    ),
  };
}

function buildColumnDef(f: WindowField): ColumnDef<EntityRow> | null {
  const { columnName: key, Name: label } = f;
  const sortingEnabled = { enableSorting: true };

  if (isBooleanField(f)) {
    return {
      accessorKey: key,
      header: label,
      filterFn: "equalsString",
      ...sortingEnabled,
      cell: ({ row }) => {
        const val = row.original[key];
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

  if (isFKField(f)) {
    return {
      accessorKey: key,
      header: label,
      filterFn: "equalsString",
      ...sortingEnabled,
      sortingFn: (rowA, rowB) => {
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

  return {
    accessorKey: key,
    header: label,
    filterFn: "includesString",
    ...sortingEnabled,
    cell: ({ row }) => {
      const val = row.original[key];
      const display =
        typeof val === "object" && val !== null
          ? ((val as { identifier?: string }).identifier ?? "")
          : String(val ?? "");
      return <span className="text-sm">{display}</span>;
    },
  };
}

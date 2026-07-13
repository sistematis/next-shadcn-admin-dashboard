"use client";
"use no memo";

import type { ColumnDef } from "@tanstack/react-table";
import { Check, MoreHorizontal } from "lucide-react";

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
import { cn } from "@/lib/utils";

import type { BPRow } from "./use-business-partners";

export const bpColumns: ColumnDef<BPRow>[] = [
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
          aria-label={`Select ${row.original.name}`}
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
        />
      </div>
    ),
    enableHiding: false,
    enableSorting: false,
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground text-sm">{row.original.name}</div>
        <div className="truncate text-muted-foreground text-xs">{row.original.value}</div>
      </div>
    ),
  },
  {
    accessorKey: "value",
    header: "Search Key",
    filterFn: "includesString",
  },
  {
    id: "search",
    accessorFn: (row) => `${row.name} ${row.value}`,
    filterFn: "includesString",
    enableHiding: true,
  },
  {
    accessorKey: "group",
    header: "Group",
    filterFn: "equalsString",
    cell: ({ row }) => <span className="text-sm">{row.original.group}</span>,
  },
  {
    accessorKey: "isCustomer",
    header: "Customer",
    filterFn: "equalsString",
    cell: ({ row }) =>
      row.original.isCustomer ? (
        <Badge variant="outline" className="gap-1 text-emerald-600">
          <Check className="size-3" /> Customer
        </Badge>
      ) : null,
  },
  {
    accessorKey: "isVendor",
    header: "Vendor",
    filterFn: "equalsString",
    cell: ({ row }) =>
      row.original.isVendor ? (
        <Badge variant="outline" className="gap-1 text-blue-600">
          <Check className="size-3" /> Vendor
        </Badge>
      ) : null,
  },
  {
    accessorKey: "creditUsed",
    header: "Credit Used",
    cell: ({ row }) => (
      <div className="text-sm tabular-nums">
        {row.original.creditUsed.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        {row.original.creditLimit > 0 && (
          <span className="text-muted-foreground text-xs">
            {" "}
            / {row.original.creditLimit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        )}
      </div>
    ),
  },
  {
    accessorKey: "active",
    header: "Status",
    filterFn: "equalsString",
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={cn("gap-1.5", row.original.active ? "text-emerald-600" : "text-muted-foreground")}
      >
        <span className={cn("size-1.5 rounded-full", row.original.active ? "bg-emerald-500" : "bg-muted-foreground")} />
        {row.original.active ? "Active" : "Inactive"}
      </Badge>
    ),
  },
  {
    id: "actions",
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => (
      <div className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Open actions for ${row.original.name}`}
              className="size-8 rounded-md text-muted-foreground hover:bg-muted/50"
              size="icon-sm"
              variant="ghost"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>View details</DropdownMenuItem>
            <DropdownMenuItem>Edit partner</DropdownMenuItem>
            <DropdownMenuItem>View orders</DropdownMenuItem>
            <DropdownMenuItem>View invoices</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">Deactivate</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
    enableHiding: false,
    enableSorting: false,
  },
];

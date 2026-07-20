"use client";

import * as React from "react";

import { CheckCircle2, Copy, FileDown, MoreVertical, Plus, Printer, RefreshCw, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ── Types ────────────────────────────────────────────────────

export interface ToolbarAction {
  /** Unique key */
  key: string;
  /** lucide icon */
  icon: React.ComponentType<{ className?: string }>;
  /** Tooltip / aria-label */
  label: string;
  /** Click handler */
  onClick: () => void;
  /** Disabled state */
  disabled?: boolean;
  /** Loading state (spinner replaces icon) */
  loading?: boolean;
  /** Variant — default | outline | destructive */
  variant?: "default" | "outline" | "destructive";
}

export interface ToolbarProcess {
  slug: string;
  label: string;
  isReport: boolean;
}

// ── Toolbar ──────────────────────────────────────────────────

interface EntityToolbarProps {
  /** Actions for primary buttons (left side) */
  actions: ToolbarAction[];
  /** Additional dropdown menu items (overflow + processes) */
  menuItems?: {
    label?: string;
    items: ToolbarAction[];
  }[];
  /** Process definitions from useWindowProcesses */
  processes?: ToolbarProcess[];
  /** On process click */
  onProcess?: (slug: string) => void;
  /** Process loading state */
  processLoading?: boolean;
  /** Process result to show in dialog */
  processResult?: { summary: string; exportUri?: string } | null;
  /** Close process result dialog */
  onProcessResultClose?: () => void;
}

/**
 * Generic CRUD toolbar that appears on every tab and sub-tab.
 *
 * Renders primary action buttons (Save, New, Delete, etc.) plus an
 * Actions (⋮) overflow dropdown for processes and less-used actions.
 *
 * Mobile (< 768px): collapses all buttons into the dropdown except Save.
 */
export function EntityToolbar({
  actions,
  menuItems = [],
  processes = [],
  onProcess,
  processLoading,
  processResult,
  onProcessResultClose,
}: EntityToolbarProps) {
  // ponytail: CRUD buttons render directly as visible buttons.
  // Only Process buttons go into the ⋮ dropdown (they're entity-specific and less frequent).
  const hasMenu = processes.length > 0 || menuItems.length > 0;

  return (
    <>
      <div className="flex items-center gap-2">
        {/* CRUD buttons — visible directly, not wrapped in dropdown */}
        {actions.map((action) => (
          <Button
            key={action.key}
            variant={action.variant ?? "outline"}
            size="sm"
            onClick={action.onClick}
            disabled={action.disabled}
            aria-label={action.label}
            className="h-8"
          >
            {action.loading ? <RefreshCw className="size-4 animate-spin" /> : <action.icon className="size-4" />}
            <span className="hidden sm:inline">{action.label}</span>
          </Button>
        ))}

        {/* ⋮ Process dropdown — only shows if there are processes or custom menu items */}
        {hasMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Process">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {/* Custom menu groups */}
              {menuItems.map((group, gi) => (
                <React.Fragment key={`menu-${gi}`}>
                  {group.label && <DropdownMenuLabel>{group.label}</DropdownMenuLabel>}
                  {group.items.map((item) => (
                    <DropdownMenuItem
                      key={item.key}
                      disabled={item.disabled}
                      onSelect={(e) => {
                        e.preventDefault();
                        item.onClick();
                      }}
                      variant={item.variant === "destructive" ? "destructive" : "default"}
                    >
                      <item.icon className="mr-2 size-4" />
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                  {gi < menuItems.length - 1 && <DropdownMenuSeparator />}
                </React.Fragment>
              ))}

              {/* Process buttons */}
              {processes.length > 0 && (
                <>
                  {menuItems.length > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel>Process</DropdownMenuLabel>
                  {processes.map((proc) => (
                    <DropdownMenuItem
                      key={proc.slug}
                      disabled={processLoading}
                      onSelect={(e) => {
                        e.preventDefault();
                        onProcess?.(proc.slug);
                      }}
                    >
                      {proc.isReport ? <Printer className="mr-2 size-4" /> : <CheckCircle2 className="mr-2 size-4" />}
                      {proc.label}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* ponytail: Process result dialog */}
      <Dialog open={!!processResult} onOpenChange={(open) => !open && onProcessResultClose?.()}>
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
    </>
  );
}

// ── Toolbar Builders ─────────────────────────────────────────

/**
 * Build toolbar actions for a FORM (header tab detail/edit page).
 * Buttons: Save | New | Refresh | [⋮ Copy | Delete | Processes]
 *
 * NOTE: This is a plain function (not a React hook) — it returns a static
 * action array. Safe to call after early returns.
 */
export function buildFormToolbar(opts: {
  isEditMode: boolean;
  isDirty: boolean;
  locked: boolean;
  saving: boolean;
  deleting: boolean;
  copying: boolean;
  basePath: string;
  onSave: () => void;
  onNew: () => void;
  onRefresh: () => void;
  onCopy: () => void;
  onDelete: () => void;
}): ToolbarAction[] {
  const { isEditMode, isDirty, locked, saving, deleting, copying, onSave, onNew, onRefresh, onCopy, onDelete } = opts;

  const actions: ToolbarAction[] = [];

  // Save — always visible, disabled when not dirty or locked
  if (!locked) {
    actions.push({
      key: "save",
      icon: Save,
      label: "Save",
      onClick: onSave,
      disabled: saving || (isEditMode && !isDirty),
      loading: saving,
      variant: "default",
    });
  }

  // New
  actions.push({
    key: "new",
    icon: Plus,
    label: "New",
    onClick: onNew,
    variant: "outline",
  });

  // Refresh (edit mode only)
  if (isEditMode) {
    actions.push({
      key: "refresh",
      icon: RefreshCw,
      label: "Refresh",
      onClick: onRefresh,
      variant: "outline",
    });
  }

  // Overflow: Copy (edit mode only)
  if (isEditMode) {
    actions.push({
      key: "copy",
      icon: Copy,
      label: "Copy",
      onClick: onCopy,
      disabled: copying,
      loading: copying,
      variant: "outline",
    });
  }

  // Overflow: Delete (edit mode only)
  if (isEditMode) {
    actions.push({
      key: "delete",
      icon: Trash2,
      label: "Delete",
      onClick: onDelete,
      disabled: deleting,
      loading: deleting,
      variant: "destructive",
    });
  }

  return actions;
}

/**
 * Build toolbar actions for a GRID/CHILD TAB.
 * Buttons: Add | Refresh | Export | [⋮ Delete Selected | Copy]
 */
export function buildGridToolbar(opts: {
  selectedCount: number;
  deleting: boolean;
  basePath: string;
  onAdd: () => void;
  onRefresh: () => void;
  onExport: () => void;
  onDelete: () => void;
}): ToolbarAction[] {
  const actions: ToolbarAction[] = [];

  actions.push({
    key: "add",
    icon: Plus,
    label: "Add",
    onClick: opts.onAdd,
    variant: "default",
  });

  actions.push({
    key: "refresh",
    icon: RefreshCw,
    label: "Refresh",
    onClick: opts.onRefresh,
    variant: "outline",
  });

  actions.push({
    key: "export",
    icon: FileDown,
    label: "Export",
    onClick: opts.onExport,
    variant: "outline",
  });

  // Overflow
  actions.push({
    key: "delete-selected",
    icon: Trash2,
    label: `Delete Selected${opts.selectedCount > 0 ? ` (${opts.selectedCount})` : ""}`,
    onClick: opts.onDelete,
    disabled: opts.selectedCount === 0 || opts.deleting,
    loading: opts.deleting,
    variant: "destructive",
  });

  return actions;
}

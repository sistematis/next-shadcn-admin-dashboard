"use client";

import * as React from "react";

import {
  Archive,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Columns3,
  Copy,
  FileDown,
  Files,
  FileText,
  FileUp,
  HelpCircle,
  Lock,
  MessageSquare,
  MoreVertical,
  Package,
  PanelLeft,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Sparkles,
  TableProperties,
  Tag,
  Trash2,
  Undo2,
  Workflow,
} from "lucide-react";

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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ── Types ────────────────────────────────────────────────────

export interface ToolbarProcess {
  slug: string;
  label: string;
  isReport: boolean;
}

/**
 * Each button definition — matches iDempiere ZK ADWindowToolbar button model.
 * componentName = the ZK ComponentName from AD_ToolBarButton.
 */
export interface ToolbarButtonDef {
  /** ZK ComponentName (e.g. "New", "Save", "Copy") */
  componentName: string;
  /** Display label (used in tooltip) */
  label: string;
  /** Icon component */
  icon: React.ComponentType<{ className?: string }>;
  /** Keyboard shortcut shown in tooltip */
  shortcut?: string;
  /** Click handler — if undefined, button is rendered as disabled stub */
  onClick?: () => void;
  /** Override disabled state */
  disabled?: boolean;
  /** Loading state */
  loading?: boolean;
  /** IsShowMore — goes to overflow ⋮ popup */
  showMore?: boolean;
  /** IsAddSeparator — renders vertical separator after this button */
  addSeparator?: boolean;
  /** IsAdvanced — hidden unless advanced mode */
  advanced?: boolean;
  /** Variant — destructive for delete */
  variant?: "default" | "destructive";
}

// ── ZK Toolbar Button Order (from ADWindowToolbar.java init()) ──
//
// Standard (visible) buttons:
//   Ignore, Help*, New, Copy, Delete, Save, SaveCreate*,
//   Refresh, Find, Attachment, PostIt*, Chat*, Label,
//   Toggle, ParentRecord, DetailRecord,
//   Report, Archive*, Print, Lock*, ZoomAcross, ActiveWorkflows*, Requests*,
//   ProductInfo, Customize*, Process, QuickForm*, AttributeForm*,
//   Export*, FileImport*, CSVImport*, [ShowMore ⋮]
//
// * = IsShowMore (goes to overflow popup)
// Separators: after Help, SaveCreate, Customize groups

// ── Toolbar Component ─────────────────────────────────────────

interface EntityToolbarProps {
  /** Toolbar buttons — should follow ZK order */
  buttons: ToolbarButtonDef[];
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

export function EntityToolbar({
  buttons,
  processes = [],
  onProcess,
  processLoading,
  processResult,
  onProcessResultClose,
}: EntityToolbarProps) {
  // ponytail: split into visible buttons vs ShowMore overflow (matches ZK IsShowMore logic)
  const visibleButtons = buttons.filter((b) => !b.showMore && !b.advanced);
  const showMoreButtons = buttons.filter((b) => b.showMore && !b.advanced);
  const hasShowMore = showMoreButtons.length > 0 || processes.length > 0;

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <div className="flex items-center gap-0.5">
          {/* Visible buttons — icon-only with tooltip, matching ZK toolbar */}
          {visibleButtons.map((btn) => (
            <React.Fragment key={btn.componentName}>
              <ToolbarIconButton def={btn} />
              {btn.addSeparator && <div className="bg-border mx-1 h-5 w-px shrink-0" />}
            </React.Fragment>
          ))}

          {/* ShowMore ⋮ overflow — matches ZK btnShowMore */}
          {hasShowMore && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Show More">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                {/* ShowMore buttons */}
                {showMoreButtons.map((btn) => (
                  <DropdownMenuItem
                    key={btn.componentName}
                    disabled={btn.disabled || !btn.onClick}
                    onSelect={(e) => {
                      e.preventDefault();
                      btn.onClick?.();
                    }}
                    variant={btn.variant === "destructive" ? "destructive" : "default"}
                  >
                    {btn.loading ? (
                      <RefreshCw className="mr-2 size-4 animate-spin" />
                    ) : (
                      <btn.icon className="mr-2 size-4" />
                    )}
                    {btn.label}
                    {btn.shortcut && <kbd className="text-muted-foreground ml-auto text-xs">{btn.shortcut}</kbd>}
                  </DropdownMenuItem>
                ))}

                {/* Process buttons */}
                {processes.length > 0 && (
                  <>
                    {showMoreButtons.length > 0 && <DropdownMenuSeparator />}
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
      </TooltipProvider>

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

// ── Single Icon Button ───────────────────────────────────────

function ToolbarIconButton({ def }: { def: ToolbarButtonDef }) {
  const isDisabled = def.disabled ?? !def.onClick;
  const tooltipText = def.shortcut ? `${def.label}    ${def.shortcut}` : def.label;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={def.onClick}
          disabled={isDisabled}
          aria-label={def.label}
          data-variant={def.variant}
        >
          {def.loading ? <RefreshCw className="size-4 animate-spin" /> : <def.icon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  );
}

// ── Button Factory: matches ZK ADWindowToolbar init() order ──

export interface ToolbarButtonHandlers {
  onIgnore?: () => void;
  onHelp?: () => void;
  onNew?: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
  onSave?: () => void;
  onSaveCreate?: () => void;
  onRefresh?: () => void;
  onFind?: () => void;
  onAttachment?: () => void;
  onPostIt?: () => void;
  onChat?: () => void;
  onLabel?: () => void;
  onToggle?: () => void;
  onParentRecord?: () => void;
  onDetailRecord?: () => void;
  onReport?: () => void;
  onArchive?: () => void;
  onPrint?: () => void;
  onLock?: () => void;
  onZoomAcross?: () => void;
  onActiveWorkflows?: () => void;
  onRequests?: () => void;
  onProductInfo?: () => void;
  onCustomize?: () => void;
  onProcess?: () => void;
  onQuickForm?: () => void;
  onAttributeForm?: () => void;
  onExport?: () => void;
  onFileImport?: () => void;
  onCSVImport?: () => void;
}

export interface ToolbarState {
  saving?: boolean;
  deleting?: boolean;
  copying?: boolean;
  loading?: boolean;
  isDirty?: boolean;
  isEditMode?: boolean;
  isLocked?: boolean;
  /** Disable buttons not applicable in current context */
  hasSelection?: boolean;
}

/**
 * Build the full ZK toolbar button array following ADWindowToolbar.init() order.
 * Buttons without handlers are rendered as disabled stubs (greyed out, not removed).
 */
export function buildZKToolbar(handlers: ToolbarButtonHandlers, state: ToolbarState = {}): ToolbarButtonDef[] {
  const { saving, deleting, copying, isDirty, isEditMode } = state;
  const buttons: ToolbarButtonDef[] = [];

  // 1. Ignore — revert unsaved changes
  buttons.push({
    componentName: "Ignore",
    label: "Ignore",
    icon: Undo2,
    shortcut: "Alt+Z",
    onClick: handlers.onIgnore,
    disabled: !isDirty,
  });

  // 2. Help → ShowMore, AddSeparator
  buttons.push({
    componentName: "Help",
    label: "Help",
    icon: HelpCircle,
    shortcut: "Alt+H",
    onClick: handlers.onHelp,
    showMore: true,
    addSeparator: true,
  });

  // 3. New
  buttons.push({
    componentName: "New",
    label: "New",
    icon: Plus,
    shortcut: "Alt+N",
    onClick: handlers.onNew,
  });

  // 4. Copy (edit mode only)
  if (isEditMode) {
    buttons.push({
      componentName: "Copy",
      label: "Copy",
      icon: Copy,
      shortcut: "Alt+C",
      onClick: handlers.onCopy,
      loading: copying,
    });
  }

  // 5. Delete (edit mode only)
  if (isEditMode) {
    buttons.push({
      componentName: "Delete",
      label: "Delete",
      icon: Trash2,
      shortcut: "Alt+D",
      onClick: handlers.onDelete,
      loading: deleting,
      variant: "destructive",
    });
  }

  // 6. Save
  buttons.push({
    componentName: "Save",
    label: "Save",
    icon: Save,
    shortcut: "Alt+S",
    onClick: handlers.onSave,
    loading: saving,
    disabled: (saving ?? false) || !isDirty,
  });

  // 7. SaveCreate → ShowMore, AddSeparator
  buttons.push({
    componentName: "SaveCreate",
    label: "Save & Create",
    icon: Plus,
    shortcut: "Alt+A",
    onClick: handlers.onSaveCreate,
    showMore: true,
    addSeparator: true,
    disabled: !isDirty,
  });

  // 8. Refresh
  buttons.push({
    componentName: "Refresh",
    label: "Refresh",
    icon: RefreshCw,
    shortcut: "Alt+E",
    onClick: handlers.onRefresh,
  });

  // 9. Find (advanced search)
  buttons.push({
    componentName: "Find",
    label: "Find",
    icon: Search,
    shortcut: "Alt+F",
    onClick: handlers.onFind,
  });

  // 10. Attachment
  buttons.push({
    componentName: "Attachment",
    label: "Attachment",
    icon: Files,
    onClick: handlers.onAttachment,
  });

  // 11. PostIt → ShowMore
  buttons.push({
    componentName: "PostIt",
    label: "Post It",
    icon: FileText,
    onClick: handlers.onPostIt,
    showMore: true,
  });

  // 12. Chat → ShowMore
  buttons.push({
    componentName: "Chat",
    label: "Chat",
    icon: MessageSquare,
    onClick: handlers.onChat,
    showMore: true,
  });

  // 13. Label
  buttons.push({
    componentName: "Label",
    label: "Label",
    icon: Tag,
    onClick: handlers.onLabel,
  });

  // 14. Toggle (Grid/Form)
  buttons.push({
    componentName: "Toggle",
    label: "Toggle Grid",
    icon: TableProperties,
    shortcut: "Alt+T",
    onClick: handlers.onToggle,
  });

  // 15. ParentRecord
  buttons.push({
    componentName: "ParentRecord",
    label: "Parent Record",
    icon: ArrowUp,
    shortcut: "Alt+↑",
    onClick: handlers.onParentRecord,
  });

  // 16. DetailRecord
  buttons.push({
    componentName: "DetailRecord",
    label: "Detail Record",
    icon: ArrowDown,
    shortcut: "Alt+↓",
    onClick: handlers.onDetailRecord,
  });

  // 17. Report (CanReport only)
  buttons.push({
    componentName: "Report",
    label: "Report",
    icon: FileText,
    shortcut: "Alt+R",
    onClick: handlers.onReport,
  });

  // 18. Archive → ShowMore
  buttons.push({
    componentName: "Archive",
    label: "Archive",
    icon: Archive,
    onClick: handlers.onArchive,
    showMore: true,
  });

  // 19. Print
  buttons.push({
    componentName: "Print",
    label: "Print",
    icon: Printer,
    shortcut: "Alt+P",
    onClick: handlers.onPrint,
  });

  // 20. Lock → ShowMore (Personal Lock)
  buttons.push({
    componentName: "Lock",
    label: "Personal Lock",
    icon: Lock,
    onClick: handlers.onLock,
    showMore: true,
  });

  // 21. ZoomAcross
  buttons.push({
    componentName: "ZoomAcross",
    label: "Zoom Across",
    icon: PanelLeft,
    onClick: handlers.onZoomAcross,
  });

  // 22. ActiveWorkflows → ShowMore
  buttons.push({
    componentName: "ActiveWorkflows",
    label: "Active Workflows",
    icon: Workflow,
    onClick: handlers.onActiveWorkflows,
    showMore: true,
  });

  // 23. Requests → ShowMore
  buttons.push({
    componentName: "Requests",
    label: "Requests",
    icon: MessageSquare,
    onClick: handlers.onRequests,
    showMore: true,
  });

  // 24. ProductInfo
  buttons.push({
    componentName: "ProductInfo",
    label: "Product Info",
    icon: Package,
    onClick: handlers.onProductInfo,
  });

  // 25. Customize → ShowMore, AddSeparator
  buttons.push({
    componentName: "Customize",
    label: "Customize",
    icon: Settings2,
    onClick: handlers.onCustomize,
    showMore: true,
    addSeparator: true,
  });

  // 26. Process
  buttons.push({
    componentName: "Process",
    label: "Process",
    icon: Sparkles,
    shortcut: "Alt+O",
    onClick: handlers.onProcess,
  });

  // 27. QuickForm → ShowMore, AddSeparator
  buttons.push({
    componentName: "QuickForm",
    label: "Quick Form",
    icon: TableProperties,
    onClick: handlers.onQuickForm,
    showMore: true,
    addSeparator: true,
  });

  // 28. AttributeForm → ShowMore
  buttons.push({
    componentName: "AttributeForm",
    label: "Attribute Form",
    icon: Settings2,
    onClick: handlers.onAttributeForm,
    showMore: true,
  });

  // 29. Export → Advanced, ShowMore
  buttons.push({
    componentName: "Export",
    label: "Export",
    icon: FileDown,
    onClick: handlers.onExport,
    showMore: true,
    advanced: true,
  });

  // 30. FileImport → Advanced, ShowMore
  buttons.push({
    componentName: "FileImport",
    label: "File Import",
    icon: FileUp,
    onClick: handlers.onFileImport,
    showMore: true,
    advanced: true,
  });

  // 31. CSVImport → ShowMore
  buttons.push({
    componentName: "CSVImport",
    label: "CSV Import",
    icon: FileUp,
    onClick: handlers.onCSVImport,
    showMore: true,
  });

  return buttons;
}

// ── Grid/Child Tab Toolbar (simplified subset) ───────────────

export function buildGridToolbar(
  handlers: {
    onAdd?: () => void;
    onRefresh?: () => void;
    onExport?: () => void;
    onFind?: () => void;
    onDelete?: () => void;
    onToggle?: () => void;
  },
  state: { selectedCount?: number; deleting?: boolean } = {},
): ToolbarButtonDef[] {
  const buttons: ToolbarButtonDef[] = [];

  // New
  buttons.push({
    componentName: "New",
    label: "New",
    icon: Plus,
    shortcut: "Alt+N",
    onClick: handlers.onAdd,
  });

  // Delete Selected
  buttons.push({
    componentName: "Delete",
    label: `Delete${state.selectedCount ? ` (${state.selectedCount})` : ""}`,
    icon: Trash2,
    shortcut: "Alt+D",
    onClick: handlers.onDelete,
    disabled: !state.selectedCount || state.deleting,
    loading: state.deleting,
    variant: "destructive",
    addSeparator: true,
  });

  // Refresh
  buttons.push({
    componentName: "Refresh",
    label: "Refresh",
    icon: RefreshCw,
    shortcut: "Alt+E",
    onClick: handlers.onRefresh,
  });

  // Find
  buttons.push({
    componentName: "Find",
    label: "Find",
    icon: Search,
    shortcut: "Alt+F",
    onClick: handlers.onFind,
  });

  // Toggle Grid
  buttons.push({
    componentName: "Toggle",
    label: "Toggle Grid",
    icon: TableProperties,
    shortcut: "Alt+T",
    onClick: handlers.onToggle,
  });

  // Export → ShowMore
  buttons.push({
    componentName: "Export",
    label: "Export",
    icon: FileDown,
    onClick: handlers.onExport,
    showMore: true,
  });

  return buttons;
}

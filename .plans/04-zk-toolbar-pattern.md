# Phase 04 — iDempiere ZK Toolbar Pattern

**Source:** ADWindowToolbar.java (org.adempiere.ui.zk)
**Goal:** Toolbar frontend 100% match iDempiere ZK webui — button order, icon-only, shortcuts, separators, ShowMore overflow.
**Status:** ✅ Implemented (commit 43477fd). This plan documents the spec for replication across all future menus.

## Architecture

```
buildZKToolbar(handlers, state) → ToolbarButtonDef[]
buildGridToolbar(handlers, state) → ToolbarButtonDef[]  (simplified subset for child grids)
EntityToolbar({ buttons, processes }) → renders icon-only buttons + ⋮ ShowMore + process dialog
```

All three live in `src/components/data/entity-toolbar.tsx`.

## Rendering Rules (matches ZK ADWindowToolbar)

1. **Icon-only** — no text labels. Same as ZK.
2. **Tooltip** shows `Label    Shortcut` (e.g. `Save    Alt+S`)
3. **Vertical separators** between groups — controlled by `IsAddSeparator`
4. **IsShowMore=Y** → goes into `⋮ ShowMore` overflow popup (desktop)
5. **IsAdvancedButton=Y** → hidden unless advanced mode active
6. **No handler = disabled** (greyed out, NOT removed from DOM)
7. **Process buttons** (AD_Window_Process) → in `⋮ ShowMore` under "Process" label
8. **Custom buttons** (AD_ToolBarButton IsCustomization=Y) → at end, before ShowMore

## Button Specification (EXACT order from init())

| #  | ComponentName    | Label             | Shortcut | ShowMore | AddSep | Icon (lucide)  | Mode           |
|----|------------------|-------------------|----------|----------|--------|----------------|----------------|
| 1  | Ignore           | Ignore            | Alt+Z    | No       | No     | Undo2          | Record         |
| 2  | Help             | Help              | Alt+H    | Yes      | **YES**| HelpCircle     | Record         |
| 3  | New              | New               | Alt+N    | No       | No     | Plus           | Record         |
| 4  | Copy             | Copy              | Alt+C    | No       | No     | Copy           | Record (edit)  |
| 5  | Delete           | Delete            | Alt+D    | No       | No     | Trash2         | Record (edit)  |
| 6  | Save             | Save              | Alt+S    | No       | No     | Save           | Record         |
| 7  | SaveCreate       | Save & Create     | Alt+A    | Yes      | **YES**| Plus           | Record         |
| 8  | Refresh          | Refresh           | Alt+E    | No       | No     | RefreshCw      | Navigate       |
| 9  | Find             | Find              | Alt+F    | No       | No     | Search         | Navigate       |
| 10 | Attachment       | Attachment        |          | No       | No     | Files          | Navigate       |
| 11 | PostIt           | Post It           |          | Yes      | No     | FileText       | Navigate       |
| 12 | Chat             | Chat              |          | Yes      | No     | MessageSquare  | Navigate       |
| 13 | Label            | Label             |          | No       | No     | Tag            | Navigate       |
| 14 | Toggle           | Toggle (Grid/Form)| Alt+T    | No       | No     | TableProperties| Navigate       |
| 15 | ParentRecord     | Parent Record     | Alt+↑    | No       | No     | ArrowUp        | Navigate       |
| 16 | DetailRecord     | Detail Record     | Alt+↓    | No       | No     | ArrowDown      | Navigate       |
| 17 | Report           | Report            | Alt+R    | No       | No     | FileText       | Output         |
| 18 | Archive          | Archive           |          | Yes      | No     | Archive        | Output         |
| 19 | Print            | Print             | Alt+P    | No       | No     | Printer        | Output         |
| 20 | Lock             | Personal Lock     |          | Yes      | No     | Lock           | Tools          |
| 21 | ZoomAcross       | Zoom Across       |          | No       | No     | PanelLeft      | Tools          |
| 22 | ActiveWorkflows  | Active Workflows  |          | Yes      | No     | Workflow       | Tools          |
| 23 | Requests         | Requests          |          | Yes      | No     | MessageSquare  | Tools          |
| 24 | ProductInfo      | Product Info      |          | No       | No     | Package        | Tools          |
| 25 | Customize        | Customize         |          | Yes      | **YES**| Settings2      | Tools          |
| 26 | Process          | Process           | Alt+O    | No       | No     | Sparkles       | Process        |
| 27 | QuickForm        | Quick Form        |          | Yes      | **YES**| TableProperties| Process        |
| 28 | AttributeForm    | Attribute Form    |          | Yes      | No     | Settings2      | Process        |
| 29 | Export           | Export            |          | Yes      | No     | FileDown       | Data           |
| 30 | FileImport       | File Import       |          | Yes      | No     | FileUp         | Data           |
| 31 | CSVImport        | CSV Import        |          | Yes      | No     | FileUp         | Data           |
| —  | [Custom Buttons] | (AD_ToolBarButton IsCustomization=Y)              | Custom         |
| —  | [Process Defs]   | (AD_Window_Process for this window)                | Process        |
| —  | ShowMore (⋮)     | Overflow trigger — shows ShowMore buttons + Process | Overflow       |

## Button Visibility / State Logic

| Button        | New Mode | Edit Mode | Grid Mode | Condition                         |
|---------------|----------|-----------|-----------|-----------------------------------|
| Ignore        | enabled  | enabled   | disabled  | disabled if `!isDirty`            |
| New           | enabled  | enabled   | enabled   |                                   |
| Copy          | disabled | enabled   | disabled  | edit mode only                    |
| Delete        | disabled | enabled   | enabled   | grid: needs row selection         |
| Save          | enabled  | enabled   | disabled  | disabled if `!isDirty` or saving  |
| SaveCreate    | disabled | enabled   | disabled  | disabled if `!isDirty`            |
| Refresh       | enabled  | enabled   | enabled   |                                   |
| Find          | enabled  | enabled   | enabled   |                                   |
| Report        | disabled | enabled   | enabled   | needs role `CanReport`            |
| Print         | disabled | enabled   | enabled   | needs role `CanReport`            |
| Export        | disabled | enabled   | enabled   | needs role `CanExport`            |
| Attachment    | disabled | enabled   | enabled   | shows count badge if has attachment |
| Lock          | disabled | enabled   | disabled  | Personal Lock feature only        |
| Toggle        | enabled  | enabled   | enabled   | toggles grid ↔ form view          |
| ParentRecord  | disabled | enabled   | disabled  | navigates to parent tab           |
| DetailRecord  | enabled  | enabled   | disabled  | navigates to child tab            |

## Keyboard Shortcuts (from configureKeyMap)

```
Alt+N = New           Alt+S = Save          Alt+D = Delete
Alt+C = Copy          Alt+E = Refresh       Alt+F = Find
Alt+Z = Ignore        Alt+H = Help          Alt+R = Report
Alt+P = Print         Alt+A = SaveCreate    Alt+T = Toggle
Alt+O = Process       Alt+↑ = ParentRecord  Alt+↓ = DetailRecord
```

## Separator Groups

Render vertical divider (1px × 20px, border color) AFTER these buttons:
- **Help** (pos 2) → separates Ignore/Help from Record group
- **SaveCreate** (pos 7) → separates Record from Navigate group
- **Customize** (pos 25) → separates Tools from Process group
- **QuickForm** (pos 27) → separates Process from Data group

## Customize Button (Column Visibility)

Column visibility does NOT have a standalone button. It lives inside Customize:
- ZK opens "Customize Grid Layout" dialog (drag-reorder + show/hide columns)
- Current impl: Dialog with checkbox per column (`child-tab-grid.tsx`)
- List page: icon-only Customize dropdown (`entity-list.tsx`)
- Column visibility persists per-entity (localStorage in `entity-list.tsx`)

## Child Tab / Grid Toolbar (buildGridToolbar — simplified subset)

Only renders:
- New, Delete Selected (with count), Refresh, Find, Toggle, Customize, Export
- No Save/Copy (form-level only)
- Delete shows selection count: `Delete (N)`

## Process Buttons

From AD_Window_Process (window-specific) or AD_Table_Process (table-specific):
- Each process: Name (label), Value (slug), IsReport (boolean)
- Report → Printer icon; Non-report → CheckCircle2 icon
- Appear in `⋮ ShowMore` under "Process" section label

## Files

| File | Role |
|------|------|
| `src/components/data/entity-toolbar.tsx` | EntityToolbar, buildZKToolbar, buildGridToolbar |
| `src/components/data/entity-form-page.tsx` | Header tab detail/edit (uses buildZKToolbar) |
| `src/components/data/child-tab-grid.tsx` | Sub-tab grid (uses buildGridToolbar + Customize dialog) |
| `src/components/data/entity-list.tsx` | List/search page (icon-only Customize dropdown) |

## Remaining Work (for next session)

- [ ] Wire up Ignore handler (revert unsaved form changes)
- [ ] Wire up Find (advanced search modal)
- [ ] Wire up Toggle (grid ↔ form view switching)
- [ ] Wire up Report / Print (iDempiere report engine integration)
- [ ] Wire up Attachment (AD_Attachment endpoint)
- [ ] Wire up ParentRecord / DetailRecord (tab navigation)
- [ ] Wire up ZoomAcross (cross-window drill)
- [ ] Keyboard shortcut listener (global Alt+key handler)
- [ ] Column visibility persistence for child-tab-grid (currently per-session only)
- [ ] Customize drag-reorder (currently checkbox-only, ZK has drag-drop)
- [ ] Process button metadata from AD_Window_Process API (currently hardcoded in process-config.ts)

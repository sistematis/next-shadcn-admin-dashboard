# Phase 03 — Master Pattern Final Hardening

**Source:** Audit 2026-07-18 (thread: Review Master Pattern Business Partners)
**Goal:** Fix 15 items blocking business-partners from becoming a true master pattern.
**Strategy:** 3 parallel workers, each owns non-overlapping files.

## Worker A — Detail & New Pages (`[id]/page.tsx`, `new/page.tsx`)

| # | Task | Files |
|---|------|-------|
| 1 | Generic refactor: `[id]/page.tsx` + `new/page.tsx` must accept `windowSlug`, `modelName`, `basePath`, `title` as props (not hardcoded `"c_bpartner"` / `"/dashboard/business-partners"`). Extract a shared `EntityFormPage` component, make BP pages thin wrappers. | `[id]/page.tsx`, `new/page.tsx` |
| 2 | Remove double toast: hooks already toast in `onSuccess`/`onError`. Delete redundant `toast.success(...)` / `toast.error(...)` in page-level handleSave. | `[id]/page.tsx`, `new/page.tsx` |
| 3 | Use `validateMandatory(fields, data)` from `field-utils.ts` instead of hardcoded Name-only check in new/page.tsx. Add same validation to `[id]/page.tsx` edit mode (currently zero validation). | `[id]/page.tsx`, `new/page.tsx` |
| 9 | Back button icon: `ChevronDown` → `ArrowLeft` (semantically correct for "back"). | `[id]/page.tsx`, `new/page.tsx` |
| 14 | Add breadcrumb navigation: `Business Partners > Edit > #123` using `Breadcrumb` from `components/ui/breadcrumb.tsx`. Replace the bare back button + h1 with breadcrumb + title. | `[id]/page.tsx`, `new/page.tsx` |

## Worker B — Entity Tabs View (`entity-tabs-view.tsx`)

| # | Task | Files |
|---|------|-------|
| 5 | `ListSelect`: replace manual `useState`+`useEffect` fetch with existing `useListOptions(refListId)` hook from `entity-hooks.ts`. Delete the inline fetch logic (lines ~489-581). | `entity-tabs-view.tsx` |
| 8 | `FKSelect`: replace plain `<Select>` with searchable combobox (Popover + Command from `components/ui/command.tsx`). Handles >200 records. Server-side search when option count >200 (fetch on type). | `entity-tabs-view.tsx` |
| 10 | `fieldGridSpan`: respect `xPosition` (AD_Field.XPosition, 1-12 grid start) in addition to `columnSpan`. Use inline `style={{ gridColumnStart: xPosition }}` or Tailwind `col-start-{n}`. | `entity-tabs-view.tsx` |
| 15 | `Level2TabGrid`: replace silent `catch { /* no parent records */ }` with error toast + console.error. | `entity-tabs-view.tsx` |

## Worker C — List, Table, Child Grid, Hooks

| # | Task | Files |
|---|------|-------|
| 4 | `ChildTabGrid`: replace manual `useState`+`useEffect` fetch with TanStack Query (`useEntityList` or a `useChildRecords` hook). Add pagination. Add query invalidation on CUD. | `child-tab-grid.tsx`, `entity-hooks.ts` |
| 6 | URL sync: change dependency from `search` to `debouncedSearch` in the URL sync `useEffect` to prevent URL thrash on every keystroke. | `entity-list.tsx` |
| 7 | Error state UI: when `useEntityList` returns `isError`, show error card with retry button (not "No records found" which is misleading). | `entity-list.tsx` |
| 11 | Columns memo: `updateMut` in deps causes recompute every render. Wrap `onToggleActive` callback in `useCallback` or move mutation call outside memo. | `entity-list.tsx` |
| 12 | Sort buttons: add `aria-label` for screen reader accessibility. | `entity-table.tsx` |
| 13 | Mobile card view: derive card fields from metadata (first 3 `isDisplayedGrid` fields by `seqNoGrid`) instead of hardcoding Name/Value/IsActive. | `entity-table.tsx` |

## Constraints (non-negotiable)

- **Metadata-driven**: never hardcode column names, field lists, or entity-specific constants. AD_Field is source of truth.
- **AD_Field xPosition**: respect it (user catches pixel-level layout discrepancies).
- **Ponytail**: reuse existing utils/hooks/components. Don't create new abstractions.
- **No double toast**: hooks own toast. Pages don't duplicate.
- **Generic pages**: `[id]/page.tsx` and `new/page.tsx` must work for ANY entity by changing props only.

## Verification

After all 3 workers complete:
1. `npm run build` (or `npx tsc --noEmit`) — no type errors
2. Manual: navigate to /dashboard/business-partners, test list/search/filter/pagination/export
3. Manual: click into detail page, edit, save, verify breadcrumb + back button
4. Manual: add new BP, verify metadata-driven validation
5. Manual: child tab grid CRUD
6. Manual: FK dropdown search works with >200 records

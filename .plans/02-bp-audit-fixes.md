# BP Audit Fixes — Master Pattern Hardening

Source: Audit 2026-07-17. 20 items across P0-P3.
Goal: Make business-partners production-grade as the master pattern for all future menus.

## Parallel Workstreams

### WS-A: List & Table (entity-list.tsx, entity-table.tsx, entity-columns.tsx)

| # | Task | Priority |
|---|------|----------|
| 1 | `defaultGridColumns` prop — curated 5-7 cols, rest hidden by default | P0 |
| 2a| Wire IsActive status filter → `useEntityList({ filter })` param | P0 |
| 3 | Column picker dropdown (toggle visibility per column) | P0 |
| 4 | Export: label "Export current page" or fetch all | P0 |
| 5 | Row click → view; Name column click → edit | P1 |
| 6 | URL state sync (search, sort, page, status) via searchParams | P1 |
| 7 | Proper empty state (icon + message + Add CTA) | P1 |
| 9 | Responsive: card layout on mobile (< md) | P1 |
| 13| Remove vestigial "search" column from entity-columns.tsx | P2 |
| 18| Keyboard shortcuts (/ focus search, N new) | P3 |

### WS-B: Data & Hooks (entity-hooks.ts, field-utils.ts, lib/idempiere/)

| # | Task | Priority |
|---|------|----------|
| 2b| Fix `useEntityList` — remove always-true IsActive filter; respect params.filter | P0 |
| 11| `useListOptions(refListId)` — cached TanStack Query hook for AD_Ref_List | P2 |
| 14| `validateMandatory(fields, formData)` — shared util in field-utils.ts | P2 |
| 19| `formatFieldValue()` — shared format util (WIB, FK ref, boolean) | P2 |
| 20| Bulk delete: collect per-item errors, report which failed | P3 |

### WS-C: Forms & Detail (entity-tabs-view.tsx, child-tab-grid.tsx, [id]/page.tsx, new/page.tsx)

| # | Task | Priority |
|---|------|----------|
| 8 | Tab skeleton on switch (replace "Loading..." text) | P1 |
| 10| Edit page: replace manual useEffect with `useEntityDetail()` hook | P2 |
| 12| Dirty check: replace JSON.stringify with field-level tracking | P2 |
| 15| `HEADER_TABLE` → dynamic from tab metadata (not hardcoded) | P2 |
| 16| Level2TabGrid: accept parentModel + parentColumn as props | P2 |
| 17| Audit info: `<details>` → Collapsible from design system | P3 |

## Interface Contracts (cross-workstream)

### IsActive filter (#2a ↔ #2b)
- WS-B: `useEntityList` stops injecting `"IsActive eq true or IsActive eq false"`. Only applies `params.filter` if provided.
- WS-A: EntityList passes `filter: statusFilter === "Active" ? "IsActive eq true" : statusFilter === "Inactive" ? "IsActive eq false" : undefined`

### useListOptions (#11 ↔ ListSelect in entity-tabs-view.tsx)
- WS-B creates: `useListOptions(refListId: number)` → `{ data: {id, name}[], isLoading }`
- WS-C entity-tabs-view.tsx ListSelect replaces manual useState+useEffect with this hook.

### validateMandatory (#14 ↔ new/page.tsx, child-tab-grid.tsx)
- WS-B creates: `validateMandatory(fields: WindowField[], data: Record<string, unknown>): string | null`
- WS-C uses it in new/page.tsx and child-tab-grid.tsx handleSave.

### formatFieldValue (#19 ↔ entity-columns.tsx, [id]/page.tsx)
- WS-B creates: `formatFieldValue(val: unknown, type?: string): string`
- WS-A + WS-C import and use, removing inline formatCell/formatWIB/formatRef duplicates.

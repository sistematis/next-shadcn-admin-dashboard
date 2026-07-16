# Business Partners → Master Pattern Refactor Plan

**Goal:** Turn Business Partners from a one-off feature into a reusable, generic
master pattern so Products / Sales Orders / POs / Invoices / Payments are
copy-config-deploy, not copy-rewrite.

## Phase 1 — Foundation (Critical)
**Must be done first. Everything else builds on this.**

### 1.1 TanStack Query integration
- Install `@tanstack/react-query` (already have `@tanstack/react-table`)
- Add `QueryClientProvider` in root layout
- Replace ad-hoc `useState` + `useEffect` data fetching with query hooks
- Key benefit: automatic caching, background refetch, stale-while-revalidate,
  optimistic updates, dedup of concurrent requests

### 1.2 Server-side pagination + search
- `useEntityData(windowSlug, modelName, { page, pageSize, search, filters })`
- Uses `$skip`, `$top`, `$filter` (for server-side search) — NOT client-side slicing
- TanStack Table `manualPagination: true`, `manualFiltering: true`
- `row-count` from API response drives page count
- Debounced search input (300ms)

### 1.3 Generic entity components (rename + extract)
- `use-business-partners.ts` → `use-entity-data.ts` — `useEntityData(windowSlug, modelName, opts)`
- `bp-columns.tsx` → `entity-columns.tsx` — `buildColumns(fields, actions)` (already generic)
- `bp-table.tsx` → `entity-table.tsx` — `EntityTable` (already generic)
- `business-partners.tsx` → `entity-list.tsx` — `EntityList({ windowSlug, modelName, title, ... })`
- `BPRow` type → `EntityRow = Record<string, unknown> & { id: number }`
- `PartnerTabsView` → `EntityTabsView({ windowSlug, entityId, ... })`
- BP pages become thin wrappers:
  ```tsx
  // business-partners/page.tsx
  <EntityList windowSlug="business-partner" modelName="c_bpartner" title="Business Partners" />
  ```

## Phase 2 — Metadata-Driven Logic (Critical)

### 2.1 DisplayLogic parser
- Parse `@FieldName@=Y` / `@FieldName@!value` / `@FieldName@>number` expressions
- `evaluateDisplayLogic(logic, formData) → boolean`
- Applied in `EntityTabsView` — fields with `displayLogic` are shown/hidden dynamically
- Also handle `mandatoryLogic` → dynamic required field

### 2.2 FK option cache
- `useFKOptions(modelName)` hook with TanStack Query
- 5min stale time, shared across all FKSelect instances for the same model
- Eliminates duplicate `getModels("c_bp_group")` calls across multiple fields

### 2.3 Optimistic mutations
- Create/update/delete/toggleActive use `queryClient.setQueryData` + rollback on error
- No full refetch → instant UI feedback

## Phase 3 — UX Polish (High Priority)

### 3.1 Confirm dialog for destructive actions
- AlertDialog for bulk delete
- AlertDialog for child grid delete

### 3.2 Unsaved changes guard
- Track `isDirty` state in edit/new pages
- `window.onbeforeunload` + Next.js route intercept (`useRouter` + `useCallback`)
- Warning toast/breadcrumb on unmount

### 3.3 Error boundary
- React Error Boundary component wrapping entity pages
- Friendly error UI with retry button

### 3.4 Loading skeletons
- Table skeleton (shimmer rows matching column count)
- Form skeleton (shimmer field blocks)
- Replace all "Loading..." text

### 3.5 Form validation
- Mandatory field validation before save (header form, not just child grid)
- Email/URL pattern validation from AD_Column metadata (when available)
- Inline error messages below fields (red text)
- Error summary at top of form

## Phase 4 — Nice to Have

### 4.1 Sticky first column
- Name column `position: sticky; left: 0` with bg

### 4.2 Server-side export
- Trigger `GET /models/{model}?$top=9999&$filter=...` in background
- Toast progress, download when done

### 4.3 Responsive table → card layout
- `hidden md:table` + `md:hidden` card list for small screens

### 4.4 Created/Updated audit info
- Show `Created`, `CreatedBy`, `Updated` in a collapsible "Audit Info" section on edit page

### 4.5 Child grid consistency
- Keep Dialog for child records (acceptable for inline child CRUD) but document the pattern decision

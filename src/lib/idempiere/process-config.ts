/**
 * Process/Toolbar Button Configuration
 *
 * iDempiere's REST API does NOT expose a direct AD_Tab → AD_Process linkage
 * (ad_table_process and ad_window_process are not available via REST).
 * The /processes endpoint returns all role-accessible processes with slug+Name+IsReport.
 *
 * This config maps window slugs to their applicable process slugs.
 * When adding a new entity module, add its process slugs here.
 * Process slugs come from GET /processes — they are slugified AD_Process.Name.
 */

export interface ProcessConfig {
  /** Process slug from /processes endpoint (slugified AD_Process.Name) */
  slug: string;
  /** Override display name (defaults to process Name from API) */
  label?: string;
}

/**
 * Map of window slug → array of process configs.
 * Processes are shown in the Actions (⋮) dropdown on detail pages.
 *
 * IMPORTANT: Process slugs MUST match the `slug` field from GET /processes.
 * They are NOT slugified AD_Process.Value — they're slugified AD_Process.Name.
 */
const WINDOW_PROCESSES: Record<string, ProcessConfig[]> = {
  "business-partner": [
    { slug: "rv_bpartneropen", label: "BP Open Amounts" },
    { slug: "rv_bpartner", label: "BP Detail Report" },
    { slug: "c_bpartner-validate", label: "Validate BP" },
  ],
  // Add more windows as modules are created:
  // "sales-order": [...],
  // "product": [...],
};

/**
 * Get process configs for a window slug.
 * Returns empty array if no processes configured (safe default).
 */
export function getProcessesForWindow(windowSlug: string): ProcessConfig[] {
  return WINDOW_PROCESSES[windowSlug] ?? [];
}

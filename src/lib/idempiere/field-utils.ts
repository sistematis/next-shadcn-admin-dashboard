/**
 * Field-level utilities — AD_Reference_ID mapping, system column filtering.
 * Replaces name-based heuristics (key.startsWith("Is")) with reference ID from AD_Column.
 */

import type { WindowField } from "./types";

// ── AD_Reference_ID constants ───────────────────────────────
// Reference: https://wiki.idempiere.org/en/Reference
export const AD_REF = {
  STRING: 10,
  INTEGER: 11,
  AMOUNT: 12,
  ID: 13,
  TEXT: 14,
  DATE: 15,
  DATE_TIME: 16,
  LIST: 17,
  TABLE: 18,
  TABLE_DIRECT: 19,
  SEARCH: 30,
  LOCATOR: 21,
  ASSIGNMENT: 22,
  BINARY: 23,
  CHART: 24,
  IMAGE: 32,
  FILE_PATH: 33,
  TEXT_LONG: 34,
  COST_PRICE: 37,
  FILE: 38,
  URL: 40,
  // Add more as needed
} as const;

/** Reference IDs that render as boolean (Yes-No) */
export const BOOLEAN_REFS = new Set([20]);
/** Reference IDs that render as date picker */
export const DATE_REFS = new Set([15, 16]);
/** Reference IDs that render as number input */
export const NUMBER_REFS = new Set([11, 12, 22, 37]);
/** Reference IDs that render as FK reference (dropdown/lookup) */
export const FK_REFS = new Set([18, 19, 30, 21]);
/** Reference IDs that render as multiline text */
export const TEXTAREA_REFS = new Set([14, 34]);
/** Reference IDs that render as dropdown from AD_Ref_List */
export const LIST_REFS = new Set([17]);

export function isBooleanField(f: WindowField): boolean {
  if (f.referenceType != null) return BOOLEAN_REFS.has(f.referenceType);
  // ponytail: fallback only for legacy getWindowFields() — no referenceType
  return f.columnName.startsWith("Is");
}

export function isDateField(f: WindowField): boolean {
  return f.referenceType ? DATE_REFS.has(f.referenceType) : false;
}

export function isNumberField(f: WindowField): boolean {
  if (f.referenceType != null) return NUMBER_REFS.has(f.referenceType);
  // ponytail: fallback only for legacy getWindowFields() — no referenceType
  return (
    f.columnName.endsWith("Amt") ||
    f.columnName.endsWith("Limit") ||
    f.columnName.endsWith("Qty") ||
    f.columnName.endsWith("Price") ||
    f.columnName.endsWith("Credit") ||
    f.columnName.endsWith("Balance") ||
    f.columnName.endsWith("Cost") ||
    f.columnName.endsWith("Volume") ||
    f.columnName === "NumberEmployees" ||
    f.columnName === "ShareOfCustomer"
  );
}

export function isFKField(f: WindowField): boolean {
  if (f.referenceType != null) return FK_REFS.has(f.referenceType);
  // ponytail: fallback only for legacy getWindowFields() — no referenceType
  return f.columnName.endsWith("_ID") && f.columnName !== "AD_Client_ID" && f.columnName !== "AD_Org_ID";
}

export function isTextareaField(f: WindowField): boolean {
  // ponytail: NumLines>1 means multi-line field, regardless of reference type
  if ((f.numLines ?? 1) > 1) return true;
  if (f.referenceType) return TEXTAREA_REFS.has(f.referenceType);
  // Fallback
  return f.columnName === "Description" || f.columnName === "Help" || f.columnName === "Comments";
}

export function isListField(f: WindowField): boolean {
  return f.referenceType ? LIST_REFS.has(f.referenceType) : false;
}

// ── System column filtering ─────────────────────────────────
// Union of all system/audit columns excluded from both table picker and form editor
export const SYSTEM_COLUMNS = new Set([
  "id",
  "uid",
  "model-name",
  "C_BPartner_UU",
  "C_BPartner_ID",
  "AD_Client_ID",
  "AD_Org_ID",
  "Created",
  "Updated",
  "CreatedBy",
  "UpdatedBy",
]);

export function isSystemField(columnName: string): boolean {
  if (SYSTEM_COLUMNS.has(columnName)) return true;
  if (columnName.endsWith("_UU")) return true;
  return false;
}

/** Fields that can be shown in the column picker (not system/internal) */
export function isPickableField(columnName: string): boolean {
  return !isSystemField(columnName);
}

/** Fields safe to show in form editor (not system/audit) */
export function isFormField(columnName: string): boolean {
  return !isSystemField(columnName);
}

/** Derive a lowercased table name from an FK column name: "AD_User_ID" → "ad_user". Used to match a child tab to its parent tab's table. */
export function deriveTable(columnName?: string): string {
  if (!columnName) return "";
  return columnName.replace(/_ID$/i, "").toLowerCase();
}

// ponytail: audit/REST-meta fields stripped from payloads — AD_Client_ID/AD_Org_ID are KEPT (iDempiere requires them)
const AUDIT_COLUMNS = new Set(["id", "uid", "model-name", "Created", "Updated", "CreatedBy", "UpdatedBy"]);

/** Remove audit/REST-meta fields before create/update. Keeps AD_Client_ID/AD_Org_ID (required by iDempiere). */
export function stripSystemFields(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (AUDIT_COLUMNS.has(k) || k.endsWith("_UU")) continue;
    out[k] = v;
  }
  return out;
}

/** Normalize FK reference objects ({id, identifier, model-name, ...}) to {id} for clean API payloads. */
export function normalizeRefs(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = v && typeof v === "object" && "id" in v ? { id: (v as { id: unknown }).id } : v;
  }
  return out;
}

// ── Field value utilities ─────────────────────────────────────

/**
 * Validate mandatory fields — returns error message or null if all valid.
 * Handles FK objects (id 0/null = empty) and boolean fields (false is valid).
 */
export function validateMandatory(fields: WindowField[], data: Record<string, unknown>): string | null {
  for (const f of fields) {
    if (f.isMandatory) {
      // ponytail: org/client/audit are server-managed — not client-validated (AD_Org_ID=0 is valid "*")
      if (isSystemField(f.columnName)) continue;
      const val = data[f.columnName];
      // ponytail: FK objects with id=0 or id=null are treated as empty
      if (val !== undefined && val !== null && typeof val === "object" && "id" in val) {
        const fkId = (val as { id: unknown }).id;
        if (fkId === 0 || fkId === null || fkId === "") return `${f.Name} is required`;
        continue;
      }
      // ponytail: boolean false is valid (default), only missing is error
      if (typeof val === "boolean") continue;
      if (val === undefined || val === null || val === "") return `${f.Name} is required`;
    }
  }
  return null;
}

/** Format any field value for display — handles nulls, FK objects, booleans */
export function formatFieldValue(val: unknown): string {
  if (val === undefined || val === null) return "-";
  if (typeof val === "object" && val !== null && "identifier" in val) {
    return String((val as { identifier?: string }).identifier ?? "-");
  }
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val);
}

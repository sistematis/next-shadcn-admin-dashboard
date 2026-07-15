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

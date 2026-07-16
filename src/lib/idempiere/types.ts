/**
 * iDempiere REST API types.
 * Reference: https://bxservice.github.io/idempiere-rest-docs/docs/api-guides/authentication
 *            https://bxservice.github.io/idempiere-rest-docs/docs/api-guides/crud/querying-data
 */

// ── Auth types ──────────────────────────────────────────────

export interface AuthClient {
  id: number;
  name: string;
}

export interface AuthRole {
  id: number;
  name: string;
}

export interface AuthOrganization {
  id: number;
  name: string;
}

export interface AuthWarehouse {
  id: number;
  name: string;
}

/** Response from POST /auth/tokens (step 1) — returns clients list + provisional token */
export interface TokenInitResponse {
  clients: AuthClient[];
  token: string;
}

/** Response from PUT /auth/tokens (step 3) — final login */
export interface AuthSession {
  userId: number;
  language: string;
  token: string;
  refresh_token: string;
  // ponytail: display info from login form, not from API response
  userName?: string;
  clientName?: string;
  roleName?: string;
  orgName?: string;
  warehouseName?: string;
}

// ── CRUD response types ─────────────────────────────────────

/** Standard iDempiere REST collection response (OData-style) */
export interface QueryResponse<T> {
  "page-count": number;
  "records-size": number;
  "skip-records": number;
  "row-count": number;
  "array-count": number;
  records: T[];
  next_page?: string;
}

/** Reference field — iDempiere returns objects for FK columns */
export interface ReferenceField {
  propertyLabel?: string;
  id: number;
  identifier?: string;
  "model-name"?: string;
  tableName?: string;
}

// ── iDempiere business models ───────────────────────────────

export interface BusinessPartner {
  id: number;
  uid?: string;
  Name?: string;
  Value?: string;
  IsCustomer?: boolean;
  IsVendor?: boolean;
  IsActive?: boolean;
  C_BP_Group_ID?: ReferenceField;
  SO_CreditLimit?: number;
  SO_CreditUsed?: number;
  TotalOpenBalance?: number;
}

export interface Product {
  id: number;
  uid?: string;
  Name?: string;
  Value?: string;
  IsActive?: boolean;
  C_UOM_ID?: ReferenceField;
  M_Product_Category_ID?: ReferenceField;
}

export interface SalesOrder {
  id: number;
  uid?: string;
  DocumentNo?: string;
  Description?: string;
  DateOrdered?: string;
  GrandTotal?: number;
  DocStatus?: string;
  DocAction?: string;
  C_BPartner_ID?: ReferenceField;
  C_DocType_ID?: ReferenceField;
  M_Warehouse_ID?: ReferenceField;
  SalesRep_ID?: ReferenceField;
}

export interface SalesOrderLine {
  id: number;
  Line?: number;
  M_Product_ID?: ReferenceField;
  QtyOrdered?: number;
  QtyEntered?: number;
  PriceEntered?: number;
  PriceActual?: number;
  LineNetAmt?: number;
  C_UOM_ID?: ReferenceField;
}

// ── Window metadata ─────────────────────────────────────────

/** Field definition from /windows/{window}/tabs/{tab}/fields */
export interface WindowField {
  id: number;
  Name: string;
  Description?: string;
  Help?: string;
  columnName: string; // extracted from AD_Column_ID.identifier
  /** Raw FK reference, or null for scalar columns */
  reference?: { id: number; identifier: string; "model-name"?: string };
  // ── Layout metadata (from AD_Field, populated by getWindowFieldLayout) ──
  /** Display order within tab (AD_Field.SeqNo) */
  seqNo?: number;
  /** Grid order for table columns (AD_Field.SeqNoGrid) */
  seqNoGrid?: number;
  /** Is field displayed in form view (AD_Field.IsDisplayed) */
  isDisplayed?: boolean;
  /** Is field displayed in grid/table view (AD_Field.IsDisplayedGrid) */
  isDisplayedGrid?: boolean;
  /** Read-only flag (AD_Field.IsReadOnly) */
  isReadOnly?: boolean;
  /** Same-line placement (AD_Field.IsSameLine) — legacy positioning */
  isSameLine?: boolean;
  /** Grid X position 1-12 (AD_Field.XPosition) */
  xPosition?: number;
  /** Grid column span (AD_Field.ColumnSpan) */
  columnSpan?: number;
  /** Number of lines for textarea (AD_Field.NumLines) */
  numLines?: number;
  /** Display logic expression, e.g. "@IsCustomer@=Y" (AD_Field.DisplayLogic) */
  displayLogic?: string;
  /** Field group (AD_Field.AD_FieldGroup_ID) */
  fieldGroup?: { id: number; identifier?: string; name?: string };
  /** Mandatory logic expression (AD_Field.MandatoryLogic) */
  mandatoryLogic?: string;
  // ── Column metadata (from AD_Column via $expand) ──
  /** AD_Reference_ID — determines field type (String=10, Yes-No=20, Table Direct=19, etc.) */
  referenceType?: number;
  /** Column field length (AD_Column.FieldLength) */
  fieldLength?: number;
  /** Column is mandatory (AD_Column.IsMandatory) */
  isMandatory?: boolean;
  /** AD_Reference_Value_ID — validation list ID for List-type fields (ref 17) */
  referenceValueId?: number;
}

/** Tab definition from /windows/{window}/tabs */
export interface WindowTab {
  id: number;
  Name: string;
  Description?: string;
  Help?: string;
  slug: string;
  SeqNo: number;
  TabLevel: number;
  /** AD_Table_ID for this tab — useful for direct model queries */
  AD_Table_ID?: number;
  /** Lowercase table name for model API calls (e.g. "c_bpartner_location") */
  tableName?: string;
  /** Where clause for tab filtering (MTab.WhereClause) */
  WhereClause?: string;
  /** Single-row only tab (no grid) */
  IsSingleRow?: boolean;
  /** Has tree structure */
  HasTree?: boolean;
  /** FK column linking this tab to its parent tab's table (e.g. "C_BPartner_ID", "AD_User_ID") */
  parentColumnName?: string;
  /** AD_Tab_ID of the parent tab (TabLevel-1). Level-0 = no parent. */
  parentTabId?: number;
}

/** Extract columnName from the AD_Column_ID.identifier ("ColumnName_DisplayName") */
export function getColumnId(field: { AD_Column_ID?: unknown }): string {
  const ref = field.AD_Column_ID as { identifier?: string } | undefined;
  if (!ref?.identifier) return "";
  // ponytail: identifier is always "{columnName}_{displayName}" — last _ splits them
  const idx = ref.identifier.lastIndexOf("_");
  return idx > 0 ? ref.identifier.slice(0, idx) : ref.identifier;
}

// ── Query builder options ───────────────────────────────────

export interface QueryOptions {
  /** $filter expression, e.g. "IsCustomer eq true" */
  filter?: string;
  /** $orderby expression, e.g. "Name asc" */
  orderby?: string;
  /** $top — page size */
  top?: number;
  /** $skip — records to skip */
  skip?: number;
  /** $select — comma-separated field names */
  select?: string;
  /** $expand — related records to include */
  expand?: string;
}

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

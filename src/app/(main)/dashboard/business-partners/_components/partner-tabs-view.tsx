"use client";

import * as React from "react";

import { HelpCircle } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getModels } from "@/lib/idempiere/client";
import {
  isBooleanField,
  isDateField,
  isFKField,
  isFormField,
  isListField,
  isNumberField,
  isTextareaField,
} from "@/lib/idempiere/field-utils";
import { getTokenFromStorage } from "@/lib/idempiere/token-utils";
import type { WindowField } from "@/lib/idempiere/types";
import { useWindowLayout } from "@/lib/idempiere/use-window-layout";

// biome-ignore lint/suspicious/noImportCycles: parent-child cycle is harmless for tree-shaking
import { ChildTabGrid } from "./child-tab-grid";
import type { BPRow } from "./use-business-partners";

const MAX_TAB_LEVEL = 2;
// ponytail: BP window header table — extension tabs (Customer/Vendor/Employee) share it
const HEADER_TABLE = "c_bpartner";

interface PartnerTabsViewProps {
  windowSlug?: string; // default: "business-partner"
  bpId: number | null; // null = add mode (only header tab shown)
  data: BPRow | null;
  onDataChange: (columnName: string, value: unknown) => void;
  readOnly?: boolean;
}

export function PartnerTabsView({
  windowSlug = "business-partner",
  bpId,
  data,
  onDataChange,
  readOnly = false,
}: PartnerTabsViewProps) {
  const { tabs, fieldsByTab, loading } = useWindowLayout(windowSlug, MAX_TAB_LEVEL);

  if (loading) {
    return <div className="flex h-32 items-center justify-center text-muted-foreground text-sm">Loading fields...</div>;
  }

  if (tabs.length === 0) {
    return <p className="text-muted-foreground text-sm">No fields available.</p>;
  }

  // ponytail: in add mode, only show header tab — child tabs need a parent record first
  const visibleTabs = bpId ? tabs : tabs.filter((t) => t.TabLevel === 0);
  const defaultTab = visibleTabs[0]?.slug ?? windowSlug;

  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <ScrollArea className="w-full">
        <TabsList className="flex w-max">
          {visibleTabs.map((tab) => (
            <TabsTrigger key={tab.slug} value={tab.slug} className="whitespace-nowrap">
              {tab.Name}
            </TabsTrigger>
          ))}
        </TabsList>
      </ScrollArea>
      {visibleTabs.map((tab) => {
        // ponytail: form view uses isDisplayed filter, table view uses isDisplayedGrid
        const fields = (fieldsByTab[tab.slug] ?? [])
          .filter((f) => f.isDisplayed !== false && isFormField(f.columnName))
          .sort((a, b) => (a.seqNo ?? 999) - (b.seqNo ?? 999));
        const isLevel2 = tab.TabLevel === 2;
        // ponytail: child tabs (level 1+) with their own table show editable grid
        const isChildTab = tab.TabLevel > 0 && tab.tableName !== HEADER_TABLE;
        // ponytail: level-2 tabs link via parentColumnName (AD_User_ID) to Contact tab
        const parentCol = tab.parentColumnName ?? "C_BPartner_ID";
        return (
          <TabsContent key={tab.slug} value={tab.slug} className="mt-4">
            {isChildTab && bpId && tab.tableName ? (
              isLevel2 ? (
                <Level2TabGrid
                  tableName={tab.tableName}
                  parentColumnName={parentCol}
                  bpId={bpId}
                  fields={fieldsByTab[tab.slug] ?? []}
                />
              ) : (
                <ChildTabGrid
                  tableName={tab.tableName}
                  parentColumnName={parentCol}
                  parentId={bpId}
                  fields={fieldsByTab[tab.slug] ?? []}
                />
              )
            ) : isChildTab ? (
              <p className="text-muted-foreground text-sm italic">Save the record first to add child records.</p>
            ) : (
              // ponytail: render fields grouped by AD_FieldGroup.Name (Customer Information, Vendor Information, etc.)
              // Ungrouped fields stay in the default section without a header.
              (() => {
                // Group buckets, preserving seqNo order across groups
                type Bucket = { key: string; label: string | null; fields: typeof fields };
                const buckets: Bucket[] = [];
                const bucketIndex = new Map<string, Bucket>();
                const DEFAULT_KEY = "__default__";
                for (const f of fields) {
                  const gname = f.fieldGroup?.name ?? null;
                  const key = gname ?? DEFAULT_KEY;
                  let bucket = bucketIndex.get(key);
                  if (!bucket) {
                    bucket = { key, label: gname, fields: [] };
                    buckets.push(bucket);
                    bucketIndex.set(key, bucket);
                  }
                  bucket.fields.push(f);
                }
                return (
                  <div className="space-y-6">
                    {buckets.map((b) => (
                      <div key={b.key} className="space-y-3">
                        {b.label && (
                          <div className="border-border/60 border-b pb-1">
                            <h3 className="font-medium text-foreground text-sm tracking-wide">{b.label}</h3>
                          </div>
                        )}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {b.fields.map((f) => {
                            const span = fieldGridSpan(f.columnSpan);
                            return (
                              <div key={f.columnName} className={span}>
                                <FieldInput
                                  field={f}
                                  value={data?.[f.columnName]}
                                  onChange={(v) => onDataChange(f.columnName, v)}
                                  readOnly={(readOnly ?? false) || f.isReadOnly === true}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

/**
 * Level2TabGrid — renders level-2 child records (Interest Area, BP Access).
 * These tabs link to a Contact (ad_user), not directly to the BP.
 * Fetches the first contact for this BP, then renders ChildTabGrid with AD_User_ID as parent.
 */
function Level2TabGrid({
  tableName,
  parentColumnName,
  bpId,
  fields,
}: {
  tableName: string;
  parentColumnName: string;
  bpId: number;
  fields: WindowField[];
}) {
  const [contactId, setContactId] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = getTokenFromStorage();
        if (!token) return;
        // ponytail: get first contact for this BP — level-2 records link via AD_User_ID
        const resp = await getModels<{ id: number }>("ad_user", token, {
          filter: `C_BPartner_ID eq ${bpId}`,
          orderby: "id asc",
          top: 1,
        });
        if (!cancelled && resp.records.length > 0) {
          setContactId(resp.records[0].id);
        }
      } catch {
        /* no contacts — grid stays empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bpId]);

  if (loading) return <p className="text-muted-foreground text-sm">Loading...</p>;
  if (!contactId) {
    return (
      <p className="text-muted-foreground text-sm italic">No contact found. Add a contact in the Contact tab first.</p>
    );
  }
  return (
    <ChildTabGrid tableName={tableName} parentColumnName={parentColumnName} parentId={contactId} fields={fields} />
  );
}

export function FieldInput({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: WindowField;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly: boolean;
}) {
  const { columnName: key, Name: label, Description, Help } = field;

  // Boolean → Switch (AD_Reference_ID = 20)
  if (isBooleanField(field)) {
    const checked = value === true || value === "true" || value === "Y";
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <FieldLabel htmlFor={key} label={label} help={Help} />
          {Description && <span className="text-muted-foreground text-xs">{Description}</span>}
        </div>
        <Switch id={key} checked={checked} onCheckedChange={(v) => onChange(v)} disabled={readOnly} />
      </div>
    );
  }

  // Long text → Textarea (AD_Reference_ID = 14 or 34)
  if (isTextareaField(field)) {
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={key} label={label} isMandatory={field.isMandatory} help={Help} />
        <Textarea
          id={key}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          placeholder={Description ?? ""}
          className="min-h-20"
          rows={field.numLines ?? 3}
        />
      </div>
    );
  }

  // Number fields (AD_Reference_ID = 11, 12, 22, 37)
  if (isNumberField(field)) {
    const numVal = typeof value === "number" ? value : Number(value ?? 0);
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={key} label={label} isMandatory={field.isMandatory} help={Help} />
        <Input
          id={key}
          type="number"
          value={Number.isNaN(numVal) ? 0 : numVal}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={readOnly}
          placeholder={Description ?? ""}
        />
      </div>
    );
  }

  // Date fields (AD_Reference_ID = 15, 16)
  if (isDateField(field)) {
    const dateVal = value ? new Date(value as string).toISOString().split("T")[0] : "";
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={key} label={label} isMandatory={field.isMandatory} help={Help} />
        <Input
          id={key}
          type="date"
          value={dateVal}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          placeholder={Description ?? ""}
        />
      </div>
    );
  }

  // FK reference → Select with lookup from reference table
  if (isFKField(field)) {
    return <FKSelect field={field} value={value} onChange={onChange} readOnly={readOnly} />;
  }

  // List reference (AD_Reference_ID=17) → Select from AD_Ref_List
  if (isListField(field)) {
    return <ListSelect field={field} value={value} onChange={onChange} readOnly={readOnly} />;
  }

  // Scalar fallback → text input
  // ponytail: List/FK objects {id,identifier} from legacy fields render as identifier
  const strVal =
    typeof value === "object" && value !== null
      ? ((value as { identifier?: string }).identifier ?? "")
      : String(value ?? "");

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={key} label={label} isMandatory={field.isMandatory} help={Help} />
      <Input
        id={key}
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
        placeholder={Description ?? ""}
        maxLength={field.fieldLength ?? undefined}
      />
    </div>
  );
}

// ponytail: FK lookup Select — fetches options from reference table model.
// Stores {id, identifier} on change so API write sends correct object shape.
function FKSelect({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: WindowField;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly: boolean;
}) {
  const { Name: label, Description, Help } = field;
  const [options, setOptions] = React.useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const modelName = field.reference?.["model-name"];
  const currentId = extractFkId(value);
  const currentLabel = extractFkLabel(value);

  React.useEffect(() => {
    if (!modelName || readOnly) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const token = getTokenFromStorage();
        if (!token) {
          setLoading(false);
          return;
        }
        const resp = await getModels<{ id: number; Name?: string; name?: string }>(modelName, token, {
          select: "Name",
          orderby: "Name asc",
          top: 200,
        });
        if (!cancelled) {
          setOptions(resp.records.map((r) => ({ id: r.id, name: r.Name ?? r.name ?? `#${r.id}` })));
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modelName, readOnly]);

  if (readOnly) {
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel label={label} isMandatory={field.isMandatory} help={Help} />
        <Input value={currentLabel} disabled readOnly />
      </div>
    );
  }

  if (error || !modelName) {
    // ponytail: fallback to text input if reference model is unknown or fetch fails
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel label={label} isMandatory={field.isMandatory} help={Help} />
        <Input value={currentLabel} onChange={(e) => onChange(e.target.value)} placeholder={Description ?? ""} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} isMandatory={field.isMandatory} help={Help} />
      <Select
        value={currentId ? String(currentId) : undefined}
        onValueChange={(v) => {
          const id = Number(v);
          const opt = options.find((o) => o.id === id);
          onChange(opt ? { id: opt.id, identifier: opt.name } : { id });
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={loading ? "Loading..." : (Description ?? "Select...")} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.id} value={String(opt.id)}>
              {opt.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Extract id from FK value: {id, identifier} | number | undefined */
function extractFkId(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "id" in value) {
    return (value as { id: number }).id;
  }
  return undefined;
}

/** Extract display label from FK value: {identifier} | string | undefined */
function extractFkLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "identifier" in value) {
    return (value as { identifier?: string }).identifier ?? "";
  }
  return "";
}

/**
 * Map iDempiere ColumnSpan (1-5 in a 12-col grid) to responsive Tailwind classes.
 * ponytail: wide fields (Span≥4 → Name, Description) take full row; medium → half; small → third.
 */
function fieldGridSpan(columnSpan?: number): string {
  switch (columnSpan) {
    case 4:
    case 5:
      return "sm:col-span-2 lg:col-span-3"; // ponytail: full width on all breakpoints
    case 3:
      return "sm:col-span-2 lg:col-span-2"; // ponytail: half on desktop
    default:
      return "sm:col-span-1 lg:col-span-1"; // ponytail: 1/2 or 1/3
  }
}

/** Compact label row: field name + mandatory asterisk + help icon inline. Saves vertical space. */
function FieldLabel({
  htmlFor,
  label,
  isMandatory,
  help,
}: {
  htmlFor?: string;
  label: string;
  isMandatory?: boolean;
  help?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor}>
        {label}
        {isMandatory && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {help && <FieldHelp text={help} />}
    </div>
  );
}

/** Click-to-open help popover — icon-only, sits inline next to label. */
function FieldHelp({ text }: { text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Field info">
          <HelpCircle className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" side="top">
        {text}
      </PopoverContent>
    </Popover>
  );
}

/** List-type dropdown — fetches options from AD_Ref_List by referenceValueId. */
function ListSelect({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: WindowField;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly: boolean;
}) {
  const { columnName: key, Name: label, Description, Help } = field;
  const refListId = field.referenceValueId;
  const [options, setOptions] = React.useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = React.useState(true);

  // ponytail: extract id from {id, identifier} or raw string
  const currentId =
    typeof value === "object" && value !== null && "id" in value
      ? String((value as { id: string }).id)
      : typeof value === "string"
        ? value
        : "";

  React.useEffect(() => {
    if (!refListId || readOnly) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const token = getTokenFromStorage();
        if (!token) {
          setLoading(false);
          return;
        }
        const resp = await getModels<{ id: number; Value?: string; Name?: string }>("ad_ref_list", token, {
          filter: `AD_Reference_ID eq ${refListId}`,
          select: "Value,Name",
          orderby: "Name asc",
          top: 100,
        });
        if (!cancelled) {
          setOptions(resp.records.map((r) => ({ id: r.Value ?? String(r.id), name: r.Name ?? r.Value ?? "?" })));
        }
      } catch {
        // ponytail: fallback — show as text input
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refListId, readOnly]);

  if (readOnly || !refListId) {
    const display =
      typeof value === "object" && value !== null && "identifier" in value
        ? ((value as { identifier?: string }).identifier ?? "")
        : String(value ?? "");
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={key} label={label} isMandatory={field.isMandatory} help={Help} />
        <Input id={key} value={display} disabled readOnly />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={key} label={label} isMandatory={field.isMandatory} help={Help} />
      <Select
        value={currentId || undefined}
        onValueChange={(v) => {
          const opt = options.find((o) => o.id === v);
          // ponytail: store {id, identifier} — same shape as FK fields
          onChange(opt ? { id: opt.id, identifier: opt.name } : { id: v });
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={loading ? "Loading..." : (Description ?? "Select...")} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              {opt.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

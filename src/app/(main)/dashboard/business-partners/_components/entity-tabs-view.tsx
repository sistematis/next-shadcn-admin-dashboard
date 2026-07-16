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
import { evaluateDisplayLogic } from "@/lib/idempiere/display-logic";
import { useAllTabFields, useFKOptions, useWindowTabsCached } from "@/lib/idempiere/entity-hooks";
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

// biome-ignore lint/suspicious/noImportCycles: parent-child cycle is harmless for tree-shaking
import { ChildTabGrid } from "./child-tab-grid";

const MAX_TAB_LEVEL = 2;
const HEADER_TABLE = "c_bpartner"; // ponytail: BP window header table — extension tabs share it

export type EntityRow = Record<string, unknown> & { id: number };

interface EntityTabsViewProps {
  windowSlug?: string;
  entityId: number | null; // null = add mode (only header tab shown)
  data: EntityRow | null;
  onDataChange: (columnName: string, value: unknown) => void;
  readOnly?: boolean;
}

export function EntityTabsView({
  windowSlug = "business-partner",
  entityId,
  data,
  onDataChange,
  readOnly = false,
}: EntityTabsViewProps) {
  const { data: tabData, isPending: tabsLoading } = useWindowTabsCached(windowSlug);
  const tabs = tabData?.tabs ?? [];
  const fieldsByTab = useAllTabFields(windowSlug, tabs, MAX_TAB_LEVEL);

  if (tabsLoading) {
    return <div className="flex h-32 items-center justify-center text-muted-foreground text-sm">Loading fields...</div>;
  }

  if (tabs.length === 0) {
    return <p className="text-muted-foreground text-sm">No fields available.</p>;
  }

  const visibleTabs = entityId ? tabs : tabs.filter((t) => t.TabLevel === 0);
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
        const fields = (fieldsByTab[tab.slug] ?? [])
          .filter((f) => f.isDisplayed !== false && isFormField(f.columnName))
          .sort((a, b) => (a.seqNo ?? 999) - (b.seqNo ?? 999));
        const isLevel2 = tab.TabLevel === 2;
        const isChildTab = tab.TabLevel > 0 && tab.tableName !== HEADER_TABLE;
        const parentCol = tab.parentColumnName ?? "C_BPartner_ID";
        return (
          <TabsContent key={tab.slug} value={tab.slug} className="mt-4">
            {isChildTab && entityId && tab.tableName ? (
              isLevel2 ? (
                <Level2TabGrid
                  tableName={tab.tableName}
                  parentColumnName={parentCol}
                  bpId={entityId}
                  fields={fieldsByTab[tab.slug] ?? []}
                />
              ) : (
                <ChildTabGrid
                  tableName={tab.tableName}
                  parentColumnName={parentCol}
                  parentId={entityId}
                  fields={fieldsByTab[tab.slug] ?? []}
                />
              )
            ) : isChildTab ? (
              <p className="text-muted-foreground text-sm italic">Save the record first to add child records.</p>
            ) : (
              <FieldGroupRenderer fields={fields} data={data} onDataChange={onDataChange} readOnly={readOnly} />
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

/** Render fields grouped by AD_FieldGroup.Name, with DisplayLogic evaluation */
function FieldGroupRenderer({
  fields,
  data,
  onDataChange,
  readOnly,
}: {
  fields: WindowField[];
  data: EntityRow | null;
  onDataChange: (col: string, val: unknown) => void;
  readOnly: boolean;
}) {
  // ponytail: evaluate display logic per field — hidden fields don't render
  const visibleFields = fields.filter((f) => {
    if (f.displayLogic) {
      return evaluateDisplayLogic(f.displayLogic, data ?? {});
    }
    return true;
  });

  // Group by fieldGroup.name, preserving seqNo order
  type Bucket = { key: string; label: string | null; fields: WindowField[] };
  const buckets: Bucket[] = [];
  const bucketIndex = new Map<string, Bucket>();
  const DEFAULT_KEY = "__default__";
  for (const f of visibleFields) {
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
}

/** Level2TabGrid — level-2 tabs link via Contact (ad_user), not BP directly */
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
        const resp = await getModels<{ id: number }>("ad_user", token, {
          filter: `C_BPartner_ID eq ${bpId}`,
          orderby: "id asc",
          top: 1,
        });
        if (!cancelled && resp.records.length > 0) {
          setContactId(resp.records[0].id);
        }
      } catch {
        /* no contacts */
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

  // ponytail: FK/List fields use cached options from TanStack Query
  if (isFKField(field)) {
    return <FKSelect field={field} value={value} onChange={onChange} readOnly={readOnly} />;
  }

  if (isListField(field)) {
    return <ListSelect field={field} value={value} onChange={onChange} readOnly={readOnly} />;
  }

  // Scalar fallback
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

// ponytail: FK lookup Select — now uses TanStack Query cache (shared across all FKSelect for same model)
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
  const modelName = field.reference?.["model-name"];
  const { data: options = [], isLoading } = useFKOptions(modelName);

  const currentId = extractFkId(value);
  const currentLabel = extractFkLabel(value);

  if (readOnly) {
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel label={label} isMandatory={field.isMandatory} help={Help} />
        <Input value={currentLabel} disabled readOnly />
      </div>
    );
  }

  if (!modelName) {
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
          <SelectValue placeholder={isLoading ? "Loading..." : (Description ?? "Select...")} />
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

function extractFkId(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "id" in value) {
    return (value as { id: number }).id;
  }
  return undefined;
}

function extractFkLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "identifier" in value) {
    return (value as { identifier?: string }).identifier ?? "";
  }
  return "";
}

function fieldGridSpan(columnSpan?: number): string {
  switch (columnSpan) {
    case 4:
    case 5:
      return "sm:col-span-2 lg:col-span-3";
    case 3:
      return "sm:col-span-2 lg:col-span-2";
    default:
      return "sm:col-span-1 lg:col-span-1";
  }
}

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

/** List-type dropdown — fetches options from AD_Ref_List by referenceValueId */
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
        /* fallback to text input */
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

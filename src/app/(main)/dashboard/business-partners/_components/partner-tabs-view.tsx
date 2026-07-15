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

const MAX_TAB_LEVEL = 1;

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
        // ponytail: child tabs show editable grid with Add/Edit/Delete
        const isChildTab = tab.TabLevel > 0;
        return (
          <TabsContent key={tab.slug} value={tab.slug} className="mt-4">
            {/* biome-ignore lint/style/noNestedTernary: three-way branch is clear here */}
            {isChildTab && bpId && tab.tableName ? (
              <ChildTabGrid
                tableName={tab.tableName}
                parentColumnName="C_BPartner_ID"
                parentId={bpId}
                fields={fieldsByTab[tab.slug] ?? []}
              />
            ) : isChildTab ? (
              <p className="text-muted-foreground text-sm italic">Save the record first to add child records.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {fields.map((f) => {
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
            )}
          </TabsContent>
        );
      })}
    </Tabs>
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
          <Label htmlFor={key}>{label}</Label>
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
        <Label htmlFor={key}>
          {label}
          {field.isMandatory && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
        <Textarea
          id={key}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          placeholder={Description ?? ""}
          className="min-h-20"
          rows={field.numLines ?? 3}
        />
        {Help && <FieldHelp text={Help} />}
      </div>
    );
  }

  // Number fields (AD_Reference_ID = 11, 12, 22, 37)
  if (isNumberField(field)) {
    const numVal = typeof value === "number" ? value : Number(value ?? 0);
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={key}>
          {label}
          {field.isMandatory && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
        <Input
          id={key}
          type="number"
          value={Number.isNaN(numVal) ? 0 : numVal}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={readOnly}
          placeholder={Description ?? ""}
        />
        {Help && <FieldHelp text={Help} />}
      </div>
    );
  }

  // Date fields (AD_Reference_ID = 15, 16)
  if (isDateField(field)) {
    const dateVal = value ? new Date(value as string).toISOString().split("T")[0] : "";
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={key}>
          {label}
          {field.isMandatory && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
        <Input
          id={key}
          type="date"
          value={dateVal}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          placeholder={Description ?? ""}
        />
        {Help && <FieldHelp text={Help} />}
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
      <Label htmlFor={key}>
        {label}
        {field.isMandatory && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <Input
        id={key}
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
        placeholder={Description ?? ""}
        maxLength={field.fieldLength ?? undefined}
      />
      {Help && <FieldHelp text={Help} />}
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

  const label2 = (
    <Label>
      {label}
      {field.isMandatory && <span className="ml-0.5 text-destructive">*</span>}
    </Label>
  );

  if (readOnly) {
    return (
      <div className="flex flex-col gap-1.5">
        {label2}
        <Input value={currentLabel} disabled readOnly />
      </div>
    );
  }

  if (error || !modelName) {
    // ponytail: fallback to text input if reference model is unknown or fetch fails
    return (
      <div className="flex flex-col gap-1.5">
        {label2}
        <Input value={currentLabel} onChange={(e) => onChange(e.target.value)} placeholder={Description ?? ""} />
        {Help && <FieldHelp text={Help} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label2}
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
      {Help && <FieldHelp text={Help} />}
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

/** Click-to-open help popover — replaces wall-of-text under each field. */
function FieldHelp({ text }: { text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
        >
          <HelpCircle className="size-3" />
          <span>Info</span>
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
  // biome-ignore lint/style/noNestedTernary: three-way extraction is readable
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
        <Label htmlFor={key}>
          {label}
          {field.isMandatory && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
        <Input id={key} value={display} disabled readOnly />
        {Help && <FieldHelp text={Help} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={key}>
        {label}
        {field.isMandatory && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
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
      {Help && <FieldHelp text={Help} />}
    </div>
  );
}

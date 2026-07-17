"use client";

import { HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { evaluateDisplayLogic } from "@/lib/idempiere/display-logic";
import { useAllTabFields, useFKOptions, useListOptions, useWindowTabsCached } from "@/lib/idempiere/entity-hooks";
import {
  deriveTable,
  isBooleanField,
  isDateField,
  isFKField,
  isFormField,
  isListField,
  isNumberField,
  isTextareaField,
} from "@/lib/idempiere/field-utils";
import type { WindowField } from "@/lib/idempiere/types";

// biome-ignore lint/suspicious/noImportCycles: parent-child cycle is harmless for tree-shaking
import { ChildTabGrid } from "./child-tab-grid";

const MAX_TAB_LEVEL = 2;

export type EntityRow = Record<string, unknown> & { id?: number; uid?: string };

interface EntityTabsViewProps {
  windowSlug?: string;
  entityId: number | string | null; // null = add mode (only current tab shown)
  activeTab: string;
  onTabChange: (slug: string) => void;
  data: EntityRow | null;
  onDataChange: (columnName: string, value: unknown) => void;
  readOnly?: boolean;
  currentTabSlug?: string; // which tab this form renders (default: header/level-0); its direct children render as grids
}

export function EntityTabsView({
  windowSlug = "business-partner",
  entityId,
  activeTab,
  onTabChange,
  data,
  onDataChange,
  readOnly = false,
  currentTabSlug,
}: EntityTabsViewProps) {
  const { data: tabData, isPending: tabsLoading } = useWindowTabsCached(windowSlug);
  const tabs = tabData?.tabs ?? [];
  const fieldsByTab = useAllTabFields(windowSlug, tabs, MAX_TAB_LEVEL);

  if (tabsLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (tabs.length === 0) {
    return <p className="text-muted-foreground text-sm">No fields available.</p>;
  }

  const currentTab =
    (currentTabSlug ? tabs.find((t) => t.slug === currentTabSlug) : undefined) ??
    tabs.find((t) => t.TabLevel === 0) ??
    tabs[0];
  if (!currentTab) return null;
  // ponytail: direct children = one level deeper whose parent column resolves to this tab's table
  const directChildren = tabs.filter(
    (t) =>
      t.TabLevel === currentTab.TabLevel + 1 &&
      !!t.tableName &&
      !!currentTab.tableName &&
      deriveTable(t.parentColumnName) === currentTab.tableName,
  );
  const visibleTabs = entityId ? [currentTab, ...directChildren] : [currentTab];
  const defaultTab = currentTab.slug;

  return (
    <Tabs value={activeTab || defaultTab} onValueChange={onTabChange} className="w-full">
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
        const parentCol = tab.parentColumnName ?? "C_BPartner_ID";
        const isCurrent = tab.slug === currentTab.slug;
        return (
          <TabsContent key={tab.slug} value={tab.slug} className="mt-4">
            {isCurrent ? (
              <FieldGroupRenderer fields={fields} data={data} onDataChange={onDataChange} readOnly={readOnly} />
            ) : entityId && tab.tableName ? (
              <ChildTabGrid
                tableName={tab.tableName}
                parentColumnName={parentCol}
                parentId={entityId}
                tabSlug={tab.slug}
                fields={fieldsByTab[tab.slug] ?? []}
              />
            ) : (
              <p className="text-muted-foreground text-sm italic">Save the record first to add child records.</p>
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
              const start = fieldGridStart(f.xPosition);
              return (
                <div key={f.columnName} className={`${span} ${start}`}>
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
    const dateVal = toDateInputValue(value);
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

// ponytail: format a value for <input type="date"> without the UTC day-shift toISOString causes.
// Date-only strings pass through; timestamps resolve to local Y/M/D (iDempiere stores UTC, shown as WIB).
function toDateInputValue(val: unknown): string {
  if (!val) return "";
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ponytail: FK lookup — searchable combobox with TanStack Query cache (shared across all FKSelect for same model)
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
  const { data, isLoading } = useFKOptions(modelName);
  const options = data?.options ?? [];
  const truncated = data?.truncated ?? false;

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
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between">
            {currentLabel || (isLoading ? "Loading..." : (Description ?? "Select..."))}
            <HelpCircle className="ml-2 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput placeholder="Search..." />
            <CommandList>
              <CommandEmpty>No match found.</CommandEmpty>
              {options.map((opt) => (
                <CommandItem
                  key={opt.id}
                  value={opt.name}
                  onSelect={() => onChange({ id: opt.id, identifier: opt.name })}
                >
                  {opt.name}
                </CommandItem>
              ))}
              {truncated && (
                <div className="px-2 py-1.5 text-muted-foreground text-xs">
                  Showing first 200 — more options exist on the server.
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
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

// ponytail: map xPosition (1-12) to 3-col grid: 1=start, 2=middle, 3=end. Values >3 default to auto-placement.
function fieldGridStart(xPosition?: number): string {
  if (!xPosition || xPosition < 1 || xPosition > 3) return "";
  return `lg:col-start-${xPosition}`;
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

/** List-type dropdown — uses cached TanStack Query hook for AD_Ref_List options */
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
  const { data: options = [], isLoading } = useListOptions(refListId ?? 0);

  const currentId =
    typeof value === "object" && value !== null && "id" in value
      ? String((value as { id: string }).id)
      : typeof value === "string"
        ? value
        : "";

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
          <SelectValue placeholder={isLoading ? "Loading..." : (Description ?? "Select...")} />
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

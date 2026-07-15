"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  isBooleanField,
  isDateField,
  isFKField,
  isFormField,
  isNumberField,
  isTextareaField,
} from "@/lib/idempiere/field-utils";
import type { WindowField } from "@/lib/idempiere/types";
import { useWindowLayout } from "@/lib/idempiere/use-window-layout";

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
        // ponytail: child tabs show read-only note until parent is saved
        const isChildTab = tab.TabLevel > 0;
        return (
          <TabsContent key={tab.slug} value={tab.slug} className="mt-4">
            {isChildTab && (
              <p className="mb-3 text-muted-foreground text-xs italic">Child records are view-only in this version.</p>
            )}
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))" }}>
              {fields.map((f) => {
                const colSpan = f.columnSpan ?? 2;
                const colStart = f.xPosition ?? 1;
                return (
                  <div key={f.columnName} className="min-w-0" style={{ gridColumn: `${colStart} / span ${colSpan}` }}>
                    <FieldInput
                      field={f}
                      value={data?.[f.columnName]}
                      onChange={(v) => onDataChange(f.columnName, v)}
                      // biome-ignore lint/nursery/useNullishCoalescing: boolean OR is intentional — both operands are booleans
                      readOnly={(readOnly ?? false) || isChildTab || f.isReadOnly === true}
                    />
                  </div>
                );
              })}
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

function FieldInput({
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
        {Help && <span className="text-muted-foreground text-xs">{Help}</span>}
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
        {Help && <span className="text-muted-foreground text-xs">{Help}</span>}
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
        {Help && <span className="text-muted-foreground text-xs">{Help}</span>}
      </div>
    );
  }

  // FK reference → text input (ponytail: could be a Select with lookup, but YAGNI until we have reference data endpoints)
  // Scalar fallback → text input
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
      {Help && <span className="text-muted-foreground text-xs">{Help}</span>}
    </div>
  );
}

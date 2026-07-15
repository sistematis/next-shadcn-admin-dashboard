"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getWindowFields, getWindowTabs } from "@/lib/idempiere/client";
import type { WindowField, WindowTab } from "@/lib/idempiere/types";

import type { BPRow } from "./use-business-partners";

// ponytail: skip system/audit columns — not user-editable
const SYSTEM_COLUMNS = new Set([
  "C_BPartner_UU",
  "C_BPartner_ID",
  "AD_Client_ID",
  "AD_Org_ID",
  "CreatedBy",
  "UpdatedBy",
  "Created",
  "Updated",
  "model-name",
  "uid",
  "id",
]);

// Only header + level-1 tabs are useful for headless frontend
const MAX_TAB_LEVEL = 1;

function isFormField(f: WindowField): boolean {
  if (SYSTEM_COLUMNS.has(f.columnName)) return false;
  // ponytail: FK columns (_ID suffix) are kept — rendered as text input with identifier
  return true;
}

interface PartnerTabsViewProps {
  bpId: number | null; // null = add mode (only header tab shown)
  data: BPRow | null;
  onDataChange: (columnName: string, value: unknown) => void;
  readOnly?: boolean;
}

export function PartnerTabsView({ bpId, data, onDataChange, readOnly = false }: PartnerTabsViewProps) {
  const [tabs, setTabs] = React.useState<WindowTab[]>([]);
  const [fieldsByTab, setFieldsByTab] = React.useState<Record<string, WindowField[]>>({});
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = getTokenFromStorage();
        if (!token) return;
        const allTabs = await getWindowTabs("business-partner", token);
        const useful = allTabs.filter((t) => t.TabLevel <= MAX_TAB_LEVEL).sort((a, b) => a.SeqNo - b.SeqNo);
        if (cancelled) return;
        setTabs(useful);

        // Fetch fields for all tabs in parallel
        const entries = await Promise.all(
          useful.map(async (t) => {
            const fields = await getWindowFields("business-partner", t.slug, token);
            return [t.slug, fields.filter(isFormField)] as const;
          }),
        );
        if (cancelled) return;
        const map: Record<string, WindowField[]> = {};
        for (const [slug, fields] of entries) map[slug] = fields;
        setFieldsByTab(map);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="flex h-32 items-center justify-center text-muted-foreground text-sm">Loading fields...</div>;
  }

  if (tabs.length === 0) {
    return <p className="text-muted-foreground text-sm">No fields available.</p>;
  }

  // ponytail: in add mode, only show header tab — child tabs need a parent record first
  const visibleTabs = bpId ? tabs : tabs.filter((t) => t.TabLevel === 0);
  const defaultTab = visibleTabs[0]?.slug ?? "business-partner";

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
        const fields = fieldsByTab[tab.slug] ?? [];
        // ponytail: child tabs show read-only note until parent is saved
        const isChildTab = tab.TabLevel > 0;
        return (
          <TabsContent key={tab.slug} value={tab.slug} className="mt-4">
            {isChildTab && (
              <p className="mb-3 text-muted-foreground text-xs italic">Child records are view-only in this version.</p>
            )}
            <div className="grid gap-4">
              {fields.map((f) => (
                <FieldInput
                  key={f.columnName}
                  field={f}
                  value={data?.[f.columnName]}
                  onChange={(v) => onDataChange(f.columnName, v)}
                  // biome-ignore lint/nursery/useNullishCoalescing: boolean OR is intentional — both operands are booleans
                  readOnly={(readOnly ?? false) || isChildTab}
                />
              ))}
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

  // Boolean → Switch
  if (key.startsWith("Is")) {
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

  // Long text → Textarea
  if (key === "Description" || key === "Help" || key === "Comments") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={key}>{label}</Label>
        <Textarea
          id={key}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          placeholder={Description ?? ""}
          className="min-h-20"
        />
        {Help && <span className="text-muted-foreground text-xs">{Help}</span>}
      </div>
    );
  }

  // Number fields
  if (isNumericColumn(key)) {
    const numVal = typeof value === "number" ? value : Number(value ?? 0);
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={key}>{label}</Label>
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

  // FK reference → text input (ponytail: could be a Select with lookup, but YAGNI until we have reference data endpoints)
  // Scalar fallback → text input
  const strVal =
    typeof value === "object" && value !== null
      ? ((value as { identifier?: string }).identifier ?? "")
      : String(value ?? "");

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
        placeholder={Description ?? ""}
      />
      {Help && <span className="text-muted-foreground text-xs">{Help}</span>}
    </div>
  );
}

function isNumericColumn(key: string): boolean {
  return (
    key.endsWith("Amt") ||
    key.endsWith("Limit") ||
    key.endsWith("Qty") ||
    key.endsWith("Price") ||
    key.endsWith("Credit") ||
    key.endsWith("Balance") ||
    key.endsWith("Cost") ||
    key.endsWith("Volume") ||
    key === "NumberEmployees" ||
    key === "ShareOfCustomer"
  );
}

// ponytail: read token from storage — works outside React tree (dialog/drawer event handlers)
function getTokenFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  const useLocal = localStorage.getItem("erp_remember") === "true";
  const s = useLocal ? localStorage : sessionStorage;
  const raw = s.getItem("erp_token");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as string;
  } catch {
    return raw;
  }
}

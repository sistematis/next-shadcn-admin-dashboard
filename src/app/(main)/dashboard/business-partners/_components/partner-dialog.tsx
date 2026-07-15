"use client";

import * as React from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createModel, updateModel } from "@/lib/idempiere/client";
import { isSystemField } from "@/lib/idempiere/field-utils";
import { getTokenFromStorage } from "@/lib/idempiere/token-utils";

import { PartnerTabsView } from "./partner-tabs-view";
import type { BPRow } from "./use-business-partners";

export type DialogMode = "add" | "edit";

interface PartnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: DialogMode;
  initialData?: BPRow | null;
  onSaved?: () => void;
}

export function PartnerDialog({ open, onOpenChange, mode, initialData, onSaved }: PartnerDialogProps) {
  const [formData, setFormData] = React.useState<Record<string, unknown>>({});
  const [saving, setSaving] = React.useState(false);

  // ponytail: reset form when dialog opens — avoids stale state from previous edit
  React.useEffect(() => {
    if (open) {
      setFormData(initialData ? { ...initialData } : {});
    }
  }, [open, initialData]);

  function handleFieldChange(columnName: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [columnName]: value }));
  }

  async function handleSave() {
    const token = getTokenFromStorage();
    if (!token) {
      toast.error("Not authenticated");
      return;
    }

    // ponytail: strip system/audit fields from payload
    const payload = stripSystemFields(formData);
    // ponytail: no client-side mandatory validation — backend enforces IsMandatory from AD_Column

    setSaving(true);
    try {
      if (mode === "add") {
        await createModel("c_bpartner", payload, token);
        toast.success("Business partner created");
      } else {
        const id = initialData?.id;
        if (!id) {
          toast.error("Missing record ID for update");
          return;
        }
        await updateModel("c_bpartner", id, payload, token);
        toast.success("Business partner updated");
      }
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to save: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  const title = mode === "add" ? "Add Business Partner" : "Edit Business Partner";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "add" ? "Create a new business partner record." : "Edit fields and save to update the record."}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] overflow-y-auto pr-1">
          <PartnerTabsView
            bpId={mode === "edit" ? (initialData?.id ?? null) : null}
            data={formData as BPRow}
            onDataChange={handleFieldChange}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function stripSystemFields(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (isSystemField(k)) continue;
    out[k] = v;
  }
  return out;
}

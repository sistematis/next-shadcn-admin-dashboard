"use client";

import * as React from "react";

import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { createModel, deleteModel, getModels, updateModel } from "@/lib/idempiere/client";
import { isSystemField } from "@/lib/idempiere/field-utils";
import { getTokenFromStorage } from "@/lib/idempiere/token-utils";
import type { WindowField } from "@/lib/idempiere/types";

// biome-ignore lint/suspicious/noImportCycles: parent-child cycle is harmless for tree-shaking
import { FieldInput } from "./partner-tabs-view";

// ponytail: child tab CRUD grid — queries child model filtered by parent FK, renders inline table + add/edit dialog
type ChildRow = Record<string, unknown> & { id: number };

interface ChildTabGridProps {
  tableName: string;
  parentColumnName: string;
  parentId: number;
  fields: WindowField[];
}

export function ChildTabGrid({ tableName, parentColumnName, parentId, fields }: ChildTabGridProps) {
  const [rows, setRows] = React.useState<ChildRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ChildRow | null>(null);
  const [formData, setFormData] = React.useState<Record<string, unknown>>({});
  const [saving, setSaving] = React.useState(false);

  const formFields = React.useMemo(
    () =>
      fields
        .filter((f) => f.isDisplayed !== false && !isSystemField(f.columnName))
        .sort((a, b) => (a.seqNo ?? 999) - (b.seqNo ?? 999)),
    [fields],
  );

  // ponytail: grid columns — first 4 pickable fields, same logic as header table
  const gridFields = React.useMemo(
    () => fields.filter((f) => f.isDisplayedGrid !== false && !isSystemField(f.columnName)).slice(0, 5),
    [fields],
  );

  const fetchChild = React.useCallback(async () => {
    const token = getTokenFromStorage();
    if (!token) return;
    setLoading(true);
    try {
      const resp = await getModels<ChildRow>(tableName, token, {
        filter: `${parentColumnName} eq ${parentId}`,
        orderby: "id asc",
        top: 50,
      });
      setRows(resp.records);
    } catch {
      toast.error(`Failed to load ${tableName}`);
    } finally {
      setLoading(false);
    }
  }, [tableName, parentColumnName, parentId]);

  React.useEffect(() => {
    void fetchChild();
  }, [fetchChild]);

  function handleAdd() {
    setEditing(null);
    setFormData({ [parentColumnName]: { id: parentId } });
    setDialogOpen(true);
  }

  function handleEdit(row: ChildRow) {
    setEditing(row);
    setFormData({ ...row });
    setDialogOpen(true);
  }

  async function handleDelete(row: ChildRow) {
    const token = getTokenFromStorage();
    if (!token) return;
    try {
      await deleteModel(tableName, row.id, token);
      toast.success("Deleted");
      await fetchChild();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleSave() {
    const token = getTokenFromStorage();
    if (!token) return;

    // ponytail: mandatory validation — server enforces too, but better UX to catch early
    for (const f of formFields) {
      if (f.isMandatory) {
        const val = formData[f.columnName];
        if (val === undefined || val === null || val === "") {
          toast.error(`${f.Name} is required`);
          return;
        }
      }
    }

    const payload = stripSystemFields(formData);
    setSaving(true);
    try {
      if (editing) {
        await updateModel(tableName, editing.id, payload, token);
        toast.success("Updated");
      } else {
        // ponytail: ensure parent FK is set on create
        payload[parentColumnName] = { id: parentId };
        await createModel(tableName, payload, token);
        toast.success("Created");
      }
      setDialogOpen(false);
      await fetchChild();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading...</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={handleAdd}>
          <Plus className="size-4" /> Add
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">No records. Click Add to create one.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {gridFields.map((f) => (
                  <th key={f.columnName} className="px-3 py-2 text-left font-medium">
                    {f.Name}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  {gridFields.map((f) => (
                    <td key={f.columnName} className="px-3 py-2">
                      {formatCell(row[f.columnName])}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" onClick={() => handleEdit(row)}>
                        <Pencil className="size-3" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => handleDelete(row)}>
                        <Trash2 className="size-3 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} Record</DialogTitle>
            <DialogDescription>
              {editing ? "Update the record fields." : "Fill in the fields to create a new record."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
            {formFields.map((f) => (
              <FieldInput
                key={f.columnName}
                field={f}
                value={formData[f.columnName]}
                onChange={(v) => setFormData((prev) => ({ ...prev, [f.columnName]: v }))}
                readOnly={f.isReadOnly === true}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatCell(val: unknown): string {
  if (val === undefined || val === null) return "-";
  if (typeof val === "object" && val !== null && "identifier" in val) {
    return String((val as { identifier?: string }).identifier ?? "-");
  }
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val);
}

function stripSystemFields(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (isSystemField(k)) continue;
    out[k] = v;
  }
  return out;
}

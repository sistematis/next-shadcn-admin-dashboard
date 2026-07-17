"use client";

import * as React from "react";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useChildRecords, useCreateEntity, useDeleteEntity, useUpdateEntity } from "@/lib/idempiere/entity-hooks";
import { isSystemField, stripSystemFields } from "@/lib/idempiere/field-utils";
import type { WindowField } from "@/lib/idempiere/types";

// biome-ignore lint/suspicious/noImportCycles: parent-child cycle is harmless for tree-shaking
import { FieldInput } from "./entity-tabs-view";

// ponytail: child tab CRUD grid — queries child model filtered by parent FK, renders inline table + add/edit dialog
type ChildRow = Record<string, unknown> & { id: number };

interface ChildTabGridProps {
  tableName: string;
  parentColumnName: string;
  parentId: number;
  fields: WindowField[];
}

export function ChildTabGrid({ tableName, parentColumnName, parentId, fields }: ChildTabGridProps) {
  // Data query
  const { data: rows = [], isPending: loading } = useChildRecords(tableName, parentColumnName, parentId);

  // Mutations
  const createMut = useCreateEntity(tableName);
  const updateMut = useUpdateEntity(tableName);
  const deleteMut = useDeleteEntity(tableName);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ChildRow | null>(null);
  const [formData, setFormData] = React.useState<Record<string, unknown>>({});
  const [saving, setSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<ChildRow | null>(null);

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

  function handleDelete(row: ChildRow) {
    setDeleteTarget(row);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteMut.mutate(deleteTarget.id);
    setDeleteTarget(null);
  }

  function handleSave() {
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
    if (editing) {
      updateMut.mutate({ id: editing.id, data: payload });
    } else {
      // ponytail: ensure parent FK is set on create
      payload[parentColumnName] = { id: parentId };
      createMut.mutate(payload);
    }
    setDialogOpen(false);
    setSaving(false);
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete record?"
        description="This action cannot be undone. The record will be permanently removed."
        confirmText="Delete"
        destructive
        onConfirm={confirmDelete}
      />
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

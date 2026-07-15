"use client";

import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { PartnerTabsView } from "./partner-tabs-view";
import type { BPRow } from "./use-business-partners";

interface DetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: BPRow | null;
  onEdit: () => void;
}

export function DetailDrawer({ open, onOpenChange, data, onEdit }: DetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{String(data?.Name ?? "Business Partner")}</SheetTitle>
          <SheetDescription>
            {String(data?.Value ?? "")}
            {data?.IsCustomer ? " · Customer" : ""}
            {data?.IsVendor ? " · Vendor" : ""}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <PartnerTabsView bpId={data?.id ?? null} data={data} onDataChange={() => undefined} readOnly />
        </div>
        <div className="border-t p-4">
          <Button onClick={onEdit} className="w-full" variant="outline">
            <Pencil className="size-4" /> Edit Partner
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

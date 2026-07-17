"use client";

import { EntityFormPage } from "@/components/data/entity-form-page";

export function ClientEditPartnerPage(props: {
  windowSlug: string;
  modelName: string;
  basePath: string;
  title: string;
  entityId: number | string;
}) {
  return <EntityFormPage {...props} />;
}

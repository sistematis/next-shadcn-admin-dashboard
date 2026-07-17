"use client";

import { EntityFormPage } from "@/components/data/entity-form-page";

export function ClientNewPartnerPage(props: {
  windowSlug: string;
  modelName: string;
  basePath: string;
  title: string;
}) {
  return <EntityFormPage {...props} entityId={undefined} />;
}

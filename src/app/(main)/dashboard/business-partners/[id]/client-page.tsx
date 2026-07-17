"use client";

import { EntityFormPage } from "../_components/entity-form-page";

export function ClientEditPartnerPage(props: {
  windowSlug: string;
  modelName: string;
  basePath: string;
  title: string;
  entityId: number | string;
}) {
  return <EntityFormPage {...props} />;
}

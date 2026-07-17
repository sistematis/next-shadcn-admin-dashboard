import { Suspense } from "react";

import { EntityList } from "@/components/data/entity-list";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export default function Page() {
  return (
    <ErrorBoundary>
      <Suspense>
        <EntityList
          windowSlug="business-partner"
          modelName="c_bpartner"
          title="Business Partners"
          description="Manage customers, vendors, and business partner relationships."
          basePath="/dashboard/business-partners"
        />
      </Suspense>
    </ErrorBoundary>
  );
}

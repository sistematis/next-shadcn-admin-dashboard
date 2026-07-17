import { ErrorBoundary } from "@/components/ui/error-boundary";

import { EntityList } from "./_components/entity-list";

export default function Page() {
  return (
    <ErrorBoundary>
      <EntityList
        windowSlug="business-partner"
        modelName="c_bpartner"
        title="Business Partners"
        description="Manage customers, vendors, and business partner relationships."
        basePath="/dashboard/business-partners"
      />
    </ErrorBoundary>
  );
}

import { EntityDrillPage } from "@/components/data/entity-drill-page";

export default async function ChildDrillPage({ params }: { params: Promise<{ id: string; drill: string[] }> }) {
  const { id, drill } = await params;
  return (
    <EntityDrillPage
      windowSlug="business-partner"
      basePath="/dashboard/business-partners"
      title="Business Partner"
      headerId={Number(id)}
      drill={drill}
    />
  );
}

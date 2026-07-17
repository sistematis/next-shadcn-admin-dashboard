import { ClientEditPartnerPage } from "./client-page";

export default async function EditPartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ClientEditPartnerPage
      windowSlug="business-partner"
      modelName="c_bpartner"
      basePath="/dashboard/business-partners"
      title="Business Partner"
      entityId={Number(id)}
    />
  );
}

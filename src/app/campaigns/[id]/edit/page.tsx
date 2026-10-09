import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { NoPermission } from "@/components/no-permission";
import { toFormValues } from "@/features/campaigns/form-values";
import { buildCampaignSchemas } from "@/features/campaigns/schemas";
import { CampaignWizard } from "@/features/campaigns/wizard/campaign-wizard";
import { furthestAllowedStep, stepRedirect } from "@/features/campaigns/wizard/steps";
import { canEditCampaign } from "@/lib/permissions";
import { getCampaign } from "@/server/campaigns";
import { getConfig } from "@/server/config";
import { getCurrentUser } from "@/server/session";

export async function generateMetadata({ params }: PageProps<"/campaigns/[id]/edit">): Promise<Metadata> {
  const campaign = getCampaign((await params).id);
  return { title: campaign ? `Edit ${campaign.name}` : "Campaign not found" };
}

export default async function EditCampaignPage({ params, searchParams }: PageProps<"/campaigns/[id]/edit">) {
  const { id } = await params;
  const campaign = getCampaign(id);
  if (!campaign) notFound();

  const user = await getCurrentUser();
  if (campaign.status === "archived") return <NoPermission message="Archived campaigns can't be edited." />;
  if (!canEditCampaign(user.role, campaign.status)) {
    return <NoPermission message={`Your role (${user.role}) can't edit a ${campaign.status} campaign.`} />;
  }

  const config = getConfig();
  const values = toFormValues(campaign);

  // A saved draft may be filled up to some step: a direct link further than that goes to the first invalid step.
  const redirectTo = stepRedirect((await searchParams).step, furthestAllowedStep(values, buildCampaignSchemas(config).steps));
  if (redirectTo) redirect(`/campaigns/${id}/edit?step=${redirectTo}`);

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-6">
      <h1 className="text-2xl font-semibold">Edit “{campaign.name}”</h1>
      <CampaignWizard mode="edit" campaignId={campaign.id} defaultValues={values} config={config} />
    </main>
  );
}

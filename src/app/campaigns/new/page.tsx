import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoPermission } from "@/components/no-permission";
import { buildCampaignSchemas } from "@/features/campaigns/schemas";
import { CampaignWizard } from "@/features/campaigns/wizard/campaign-wizard";
import { furthestAllowedStep, stepRedirect } from "@/features/campaigns/wizard/steps";
import { can } from "@/lib/permissions";
import { getDefaultFormValues } from "@/server/campaigns";
import { getConfig } from "@/server/config";
import { getPreferences } from "@/server/preferences";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "New campaign" };

export default async function NewCampaignPage({ searchParams }: PageProps<"/campaigns/new">) {
  const user = await getCurrentUser();
  // A viewer may open this page by a direct link: show why instead of a broken form.
  if (!can(user.role, "campaign:create")) {
    return <NoPermission message="Your role (viewer) can't create campaigns." />;
  }

  const config = getConfig();
  const defaultValues = getDefaultFormValues(getPreferences(user.id).defaultTimezone);

  // Nothing is filled in yet, so only the first step is reachable: /new?step=budget → basics.
  const redirectTo = stepRedirect((await searchParams).step, furthestAllowedStep(defaultValues, buildCampaignSchemas(config).steps));
  if (redirectTo) redirect(`/campaigns/new?step=${redirectTo}`);

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-6">
      <h1 className="text-2xl font-semibold">New campaign</h1>
      <CampaignWizard mode="create" defaultValues={defaultValues} config={config} />
    </main>
  );
}

import type { Metadata } from "next";
import { CampaignsView } from "@/features/campaigns/list/campaigns-view";
import { getPreferences } from "@/server/preferences";
import { getCurrentUser } from "@/server/session";
import { listUsers } from "@/server/users";

export const metadata: Metadata = { title: "Campaigns" };

// Server Component: passes the role, owners and saved column preferences to the client list.
// The rows themselves are loaded by the client page by page (infinite scroll), not here.
export default async function CampaignsPage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-[1600px] flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">Campaigns</h1>
      <CampaignsView role={user.role} owners={listUsers()} preferences={getPreferences(user.id)} />
    </main>
  );
}

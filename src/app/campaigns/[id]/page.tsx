import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ActivityLog } from "@/features/campaigns/detail/activity-log";
import { BackToList } from "@/features/campaigns/detail/back-to-list";
import { LiveMetrics } from "@/features/campaigns/detail/live-metrics";
import { RuleTreeView } from "@/features/campaigns/detail/rule-tree-view";
import { StatusActions } from "@/features/campaigns/detail/status-actions";
import type { Campaign } from "@/features/campaigns/types";
import { formatWallTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { listActivity } from "@/server/activity";
import { getCampaign } from "@/server/campaigns";
import { getMetrics } from "@/server/metrics";
import { getCurrentUser } from "@/server/session";
import { listUsers } from "@/server/users";

// A Server Component page. Only the interactive leaves are client components:
// StatusActions (optimistic pause/resume), LiveMetrics (polling), ActivityLog ("load more"), BackToList.

export async function generateMetadata({ params }: PageProps<"/campaigns/[id]">): Promise<Metadata> {
  // Reading SQLite is synchronous and cheap, so reading the campaign twice (here and in the page) is fine.
  const campaign = getCampaign((await params).id);
  return { title: campaign?.name ?? "Campaign not found" };
}

export default async function CampaignPage({ params }: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
  const campaign = getCampaign(id);
  if (!campaign) notFound();

  const user = await getCurrentUser();
  const ownerName = listUsers().find((u) => u.id === campaign.ownerId)?.name ?? "Unknown";
  const activity = listActivity(id);

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-6">
      <div className="grid gap-3">
        <BackToList />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold">{campaign.name}</h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{campaign.slug}</span> · <span className="capitalize">{campaign.objective}</span> ·
              Owner: {ownerName} · v{campaign.version}
            </p>
          </div>
          <StatusActions campaignId={campaign.id} name={campaign.name} status={campaign.status} role={user.role} />
        </div>
      </div>

      <LiveMetrics
        campaignId={campaign.id}
        status={campaign.status}
        currency={campaign.budget.currency}
        initialMetrics={getMetrics(campaign)}
      />

      <div className="grid gap-8 md:grid-cols-2">
        <BudgetAndSchedule campaign={campaign} />
        <section aria-labelledby="audience-heading" className="grid content-start gap-3">
          <h2 id="audience-heading" className="text-lg font-medium">
            Audience
          </h2>
          <RuleTreeView group={campaign.audience} />
        </section>
      </div>

      <Creatives creatives={campaign.creatives} />

      {activity.ok && <ActivityLog campaignId={campaign.id} initialPage={activity.data} />}
    </main>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function BudgetAndSchedule({ campaign }: { campaign: Campaign }) {
  const { budget, schedule } = campaign;
  const rows: [string, string][] = [
    ["Budget", `${formatMoney(budget.amount, budget.currency)} ${budget.type === "daily" ? "per day" : "lifetime"}`],
    ...(budget.type === "lifetime" ? [["Pacing", budget.pacing] as [string, string]] : []),
    ["Timezone", schedule.timezone],
    ["Start", formatWallTime(schedule.start)],
    ["End", schedule.end ? formatWallTime(schedule.end) : "No end date"],
    [
      "Dayparting",
      schedule.dayparting.length > 0
        ? schedule.dayparting.map((part) => `${WEEKDAYS[part.weekday]} ${part.from}–${part.to}`).join(", ")
        : "All day",
    ],
  ];

  return (
    <section aria-labelledby="budget-heading" className="grid content-start gap-3">
      <h2 id="budget-heading" className="text-lg font-medium">
        Budget &amp; schedule
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border p-4 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Creatives({ creatives }: { creatives: Campaign["creatives"] }) {
  return (
    <section aria-labelledby="creatives-heading" className="grid gap-3">
      <h2 id="creatives-heading" className="text-lg font-medium">
        Creatives
      </h2>
      {creatives.length === 0 ? (
        <p className="text-sm text-muted-foreground">No creatives yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {creatives.map((creative) => (
            <li key={creative.id} className="grid content-start gap-2 rounded-lg border p-3">
              {/* width/height give the browser the aspect ratio up front: no layout shift while loading. */}
              <Image
                src={creative.url}
                alt={creative.headline}
                width={creative.width}
                height={creative.height}
                sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
                className="h-auto w-full rounded-md"
              />
              <p className="text-sm font-medium">{creative.headline}</p>
              <p className="text-xs text-muted-foreground">
                CTA “{creative.cta}” · {creative.width}×{creative.height} · {Math.round(creative.sizeBytes / 1024)} KB
                {creative.isPrimary && " · Primary"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

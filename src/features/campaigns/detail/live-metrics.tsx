"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import { formatMoney } from "@/lib/money";
import type { CampaignStatus, MetricsSnapshot } from "../types";
import { SpendChart } from "./spend-chart";

const POLL_INTERVAL_MS = 2_000;

type Props = {
  campaignId: string;
  status: CampaignStatus;
  currency: string;
  /** Rendered on the server, so the numbers are there before JavaScript loads. */
  initialMetrics: MetricsSnapshot;
};

/**
 * Live metrics by polling (Core; SSE is Advanced). Only this component re-renders on each
 * tick — the rest of the page is server-rendered HTML and doesn't change.
 * React Query handles the interval, pauses it in a background tab, and keeps the last good
 * data when a poll fails.
 */
export function LiveMetrics({ campaignId, status, currency, initialMetrics }: Props) {
  const live = status === "running";
  const { data, isError, isFetching } = useQuery({
    queryKey: ["metrics", campaignId],
    queryFn: ({ signal }) => fetchJson<MetricsSnapshot>(`/api/campaigns/${campaignId}/metrics`, { signal }),
    initialData: initialMetrics,
    refetchInterval: live ? POLL_INTERVAL_MS : false,
    staleTime: 0,
  });

  const tiles = [
    { label: "Impressions", value: data.impressions.toLocaleString("en-US") },
    { label: "Clicks", value: data.clicks.toLocaleString("en-US") },
    { label: "Spend", value: formatMoney(data.spend, currency) },
    { label: "CTR", value: `${(data.ctr * 100).toFixed(2)}%` },
  ];

  return (
    <section aria-labelledby="metrics-heading" className="grid gap-4">
      <div className="flex items-center gap-3">
        <h2 id="metrics-heading" className="text-lg font-medium">
          Metrics
        </h2>
        <span role="status" className="text-xs text-muted-foreground">
          {!live ? "Updates only while the campaign is running" : isError ? (
            <span className="text-destructive">Live updates interrupted — retrying…</span>
          ) : (
            <>
              <span className={isFetching ? "text-primary" : undefined}>●</span> Live, every 2 s
            </>
          )}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{tile.label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{tile.value}</dd>
          </div>
        ))}
      </dl>

      <SpendChart points={data.spendSeries} currency={currency} />
    </section>
  );
}

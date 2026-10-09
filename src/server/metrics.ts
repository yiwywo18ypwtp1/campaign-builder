import "server-only";
import type { Campaign } from "@/features/campaigns/types";
import { createRandom } from "./seed";

// Fake live metrics. Spend per minute is derived from (campaign id, minute), so every poll
// returns the same history for past minutes and only the newest point changes.

export type MetricsSnapshot = {
  impressions: number;
  clicks: number;
  spend: number; // minor units
  ctr: number; // 0..1
  /** Spend per minute for the last 60 minutes, oldest first. */
  spendSeries: { minute: string; spend: number }[];
};

const MINUTE = 60_000;

export function getMetrics(campaign: Campaign): MetricsSnapshot {
  const live = campaign.status === "running";
  const seed = Number(campaign.id.replace(/\D/g, "").slice(0, 9)) || 1;
  const currentMinute = Math.floor(Date.now() / MINUTE);

  const spendSeries = Array.from({ length: 60 }, (_, i) => {
    const minute = currentMinute - 59 + i;
    const random = createRandom(seed * 100_003 + minute);
    return { minute: new Date(minute * MINUTE).toISOString(), spend: live ? Math.round(50 + random() * 450) : 0 };
  });

  const spend = campaign.spend + spendSeries.reduce((sum, point) => sum + point.spend, 0);
  const impressions = Math.round(spend * 3.7);
  const clicks = Math.round(impressions * 0.021);
  return { impressions, clicks, spend, ctr: impressions ? clicks / impressions : 0, spendSeries };
}

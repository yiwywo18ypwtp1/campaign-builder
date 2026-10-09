import "server-only";
import type { Campaign, MetricsSnapshot } from "@/features/campaigns/types";
import { createRandom } from "./seed";

// Fake live metrics. Spend per minute is derived from (campaign id, minute), so every poll
// returns the same history for past minutes and only the newest point changes.

const MINUTE = 60_000;

export function getMetrics(campaign: Campaign): MetricsSnapshot {
  const live = campaign.status === "running";
  const seed = Number(campaign.id.replace(/\D/g, "").slice(0, 9)) || 1;
  const currentMinute = Math.floor(Date.now() / MINUTE);

  // The current minute is still in progress: its spend grows with the elapsed seconds, so totals
  // change on every 2-second poll while finished minutes stay the same.
  const minuteProgress = (Date.now() % MINUTE) / MINUTE;
  const spendSeries = Array.from({ length: 60 }, (_, i) => {
    const minute = currentMinute - 59 + i;
    const random = createRandom(seed * 100_003 + minute);
    const fullMinuteSpend = live ? 50 + random() * 450 : 0;
    const spend = Math.round(i === 59 ? fullMinuteSpend * minuteProgress : fullMinuteSpend);
    return { minute: new Date(minute * MINUTE).toISOString(), spend };
  });

  // Totals must never go down. Summing the 60-minute window would drop the oldest minute when a new
  // one starts, so the total grows from `updatedAt` at the average per-minute rate instead.
  const AVERAGE_SPEND_PER_MINUTE = 275; // middle of the 50–500 range above
  const liveSpend = live ? Math.round(((Date.now() - Date.parse(campaign.updatedAt)) / MINUTE) * AVERAGE_SPEND_PER_MINUTE) : 0;
  const spend = campaign.spend + Math.max(0, liveSpend);
  const impressions = Math.round(spend * 3.7);
  const clicks = Math.round(impressions * 0.021);
  return { impressions, clicks, spend, ctr: impressions ? clicks / impressions : 0, spendSeries };
}

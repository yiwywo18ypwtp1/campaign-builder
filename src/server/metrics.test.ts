import { afterEach, describe, expect, it, vi } from "vitest";
import type { Campaign } from "@/features/campaigns/types";
import { getMetrics } from "./metrics";

const campaign = { id: "cmp_00042", status: "running", spend: 10_000 } as Campaign;

afterEach(() => {
  vi.useRealTimers();
});

describe("getMetrics", () => {
  it("returns 60 per-minute points for a running campaign", () => {
    const metrics = getMetrics(campaign);
    expect(metrics.spendSeries).toHaveLength(60);
    expect(metrics.spendSeries.every((point) => point.spend > 0)).toBe(true);
    expect(metrics.spend).toBeGreaterThan(campaign.spend);
  });

  it("keeps past minutes stable between polls, so the chart only gains a new point", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:30Z"));
    const before = getMetrics(campaign).spendSeries;

    vi.setSystemTime(new Date("2026-10-10T12:01:30Z"));
    const after = getMetrics(campaign).spendSeries;

    expect(after.slice(0, 59)).toEqual(before.slice(1));
  });

  it("is flat for a campaign that isn't running", () => {
    const metrics = getMetrics({ ...campaign, status: "paused" });
    expect(metrics.spendSeries.every((point) => point.spend === 0)).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Campaign } from "@/features/campaigns/types";
import { getMetrics } from "./metrics";

const campaign = { id: "cmp_00042", status: "running", spend: 10_000, updatedAt: "2026-10-10T10:00:00.000Z" } as Campaign;

afterEach(() => {
  vi.useRealTimers();
});

describe("getMetrics", () => {
  it("returns 60 per-minute points for a running campaign", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:30Z"));
    const metrics = getMetrics(campaign);
    expect(metrics.spendSeries).toHaveLength(60);
    expect(metrics.spendSeries.slice(0, 59).every((point) => point.spend > 0)).toBe(true);
    expect(metrics.spend).toBeGreaterThan(campaign.spend);
  });

  it("keeps finished minutes stable between polls, so the chart only shifts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:30Z"));
    const before = getMetrics(campaign).spendSeries;

    vi.setSystemTime(new Date("2026-10-10T12:01:30Z"));
    const after = getMetrics(campaign).spendSeries;

    // Minutes that were already finished in `before` are unchanged in `after`.
    expect(after.slice(0, 58)).toEqual(before.slice(1, 59));
  });

  it("grows the current minute between two polls of the same minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:10Z"));
    const early = getMetrics(campaign);
    vi.setSystemTime(new Date("2026-10-10T12:00:50Z"));
    const late = getMetrics(campaign);

    expect(late.spendSeries[59].spend).toBeGreaterThan(early.spendSeries[59].spend);
    expect(late.spend).toBeGreaterThan(early.spend);
  });

  it("never decreases the total when a new minute starts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:58Z"));
    const before = getMetrics(campaign).spend;
    vi.setSystemTime(new Date("2026-10-10T12:01:02Z"));
    expect(getMetrics(campaign).spend).toBeGreaterThanOrEqual(before);
  });

  it("is flat for a campaign that isn't running", () => {
    const metrics = getMetrics({ ...campaign, status: "paused" });
    expect(metrics.spendSeries.every((point) => point.spend === 0)).toBe(true);
  });
});

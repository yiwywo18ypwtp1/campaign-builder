import "server-only";
import type { Objective } from "@/features/campaigns/types";

// Static app config, served by `GET /api/config` and read directly by Server Components.

export type AppConfig = {
  currencies: { code: string; minAmount: number }[]; // minAmount in minor units
  ctaByObjective: Record<Objective, string[]>;
  timezones: string[];
};

const CONFIG: AppConfig = {
  currencies: [
    { code: "USD", minAmount: 1_000 },
    { code: "EUR", minAmount: 1_000 },
    { code: "GBP", minAmount: 1_000 },
    { code: "UAH", minAmount: 40_000 },
  ],
  ctaByObjective: {
    awareness: ["Learn more", "Watch more"],
    conversion: ["Buy now", "Sign up", "Get offer"],
    retention: ["Come back", "Learn more", "Get offer"],
  },
  timezones: [
    "UTC",
    "Europe/Kyiv",
    "Europe/Warsaw",
    "Europe/London",
    "America/New_York",
    "America/Los_Angeles",
    "Asia/Tokyo",
  ],
};

export function getConfig(): AppConfig {
  return CONFIG;
}

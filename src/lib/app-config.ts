import type { Objective } from "@/features/campaigns/types";

/** Shape of `GET /api/config`. The values live in `server/config.ts`; the type is shared with the client. */
export type AppConfig = {
  currencies: { code: string; minAmount: number }[]; // minAmount in minor units
  ctaByObjective: Record<Objective, string[]>;
  timezones: string[];
};

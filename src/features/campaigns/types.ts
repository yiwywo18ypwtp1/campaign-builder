import type { z } from "zod";
import type {
  budgetSchema,
  buildCampaignSchemas,
  campaignStatusSchema,
  objectiveSchema,
  ruleGroupSchema,
  ruleSchema,
  scheduleSchema,
} from "./schemas";

// Types are inferred from the schemas, so the form, the server and the tests can't drift apart.

export type CampaignStatus = z.infer<typeof campaignStatusSchema>;
export type Objective = z.infer<typeof objectiveSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type RuleField = Rule["field"];
export type RuleGroup = z.infer<typeof ruleGroupSchema>;
export type Budget = z.infer<typeof budgetSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;

/** What the wizard edits. */
export type CampaignFormValues = z.infer<ReturnType<typeof buildCampaignSchemas>["campaign"]>;

export type Creative = {
  id: string;
  kind: "image" | "video";
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
  headline: string;
  cta: string;
  isPrimary: boolean;
};

/** Stored campaign: form values + fields owned by the server. */
export type Campaign = CampaignFormValues & {
  id: string;
  status: CampaignStatus;
  creatives: Creative[]; // edited in step 4 (Advanced); Core only displays them
  spend: number; // minor units; not in the task's model, needed for the "Spend" column
  version: number;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
};

/** `GET /api/campaigns/:id/metrics` */
export type MetricsSnapshot = {
  impressions: number;
  clicks: number;
  spend: number; // minor units
  ctr: number; // 0..1
  /** Spend per minute for the last 60 minutes, oldest first. */
  spendSeries: { minute: string; spend: number }[];
};

/** `GET /api/campaigns/:id/activity` */
export type ActivityItem = { id: number; at: string; actorId: string; actorName: string; message: string };
export type ActivityPage = { items: ActivityItem[]; nextCursor: string | null };

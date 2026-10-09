import { z } from "zod";
import { campaignStatusSchema, objectiveSchema } from "./schemas";
import type { Budget, CampaignStatus, Objective } from "./types";

// Query of `GET /api/campaigns`. The server parses it strictly (bad input → 400);
// the list page (phase 4) builds it from the page URL.

export const SORT_KEYS = ["name", "status", "objective", "budget", "spend", "start", "end", "owner", "updatedAt"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** Columns the user can show/hide/resize. "Actions" is always visible. */
export const COLUMN_KEYS = ["name", "status", "objective", "budget", "spend", "start", "end", "owner"] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  name: "Name",
  status: "Status",
  objective: "Objective",
  budget: "Budget",
  spend: "Spend",
  start: "Start",
  end: "End",
  owner: "Owner",
};

const dateSchema = z.iso.date(); // "YYYY-MM-DD"

export const listFiltersSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.array(campaignStatusSchema).optional(),
  objective: objectiveSchema.optional(),
  owner: z.string().optional(),
  from: dateSchema.optional(), // start date range, in the campaign's own timezone
  to: dateSchema.optional(),
});
export type ListFilters = z.infer<typeof listFiltersSchema>;

export const listQuerySchema = listFiltersSchema.extend({
  sort: z.enum(SORT_KEYS).default("updatedAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

/** URLSearchParams → plain object for `listQuerySchema` (`status[]` is repeated). */
export function searchParamsToListQuery(params: URLSearchParams) {
  const value = (key: string) => params.get(key) ?? undefined;
  const statuses = params.getAll("status[]");
  return {
    search: value("search"),
    status: statuses.length > 0 ? statuses : undefined,
    objective: value("objective"),
    owner: value("owner"),
    from: value("from"),
    to: value("to"),
    sort: value("sort"),
    order: value("order"),
    cursor: value("cursor"),
    limit: value("limit"),
  };
}

/** One row of the list: only what the table shows, not the whole campaign. */
export type CampaignListItem = {
  id: string;
  slug: string;
  name: string;
  status: CampaignStatus;
  objective: Objective;
  budget: Budget;
  spend: number;
  timezone: string;
  start: string;
  end: string | null;
  ownerId: string;
  ownerName: string;
  updatedAt: string;
  version: number;
};

export type CampaignPage = {
  items: CampaignListItem[];
  nextCursor: string | null;
  total: number;
};

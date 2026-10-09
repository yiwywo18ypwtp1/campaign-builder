import { z } from "zod";
import { COLUMN_KEYS } from "@/features/campaigns/list-query";

// Per-user preferences, stored on the server (`GET/PUT /api/me/preferences`).

export const preferencesSchema = z.object({
  defaultTimezone: z.string().min(1),
  columns: z.object({
    visible: z.array(z.enum(COLUMN_KEYS)).min(1, "Show at least one column"),
    order: z.array(z.enum(COLUMN_KEYS)),
    widths: z.partialRecord(z.enum(COLUMN_KEYS), z.int().min(60).max(800)),
  }),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = {
  defaultTimezone: "UTC",
  columns: { visible: [...COLUMN_KEYS], order: [...COLUMN_KEYS], widths: {} },
};

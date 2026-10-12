import { TZDate } from "@date-fns/tz";
import { z } from "zod";

// Single source of validation for the campaign form: the wizard (zodResolver) and the server
// (Server Actions / Route Handlers) both use `buildCampaignSchemas(config)`.

export const campaignStatusSchema = z.enum([
  "draft",
  "scheduled",
  "running",
  "paused",
  "finished",
  "archived",
]);

export const objectiveSchema = z.enum(["awareness", "conversion", "retention"]);

/* -------------------------------------------------------------------------------------------- */
/* Audience rules                                                                                */
/* -------------------------------------------------------------------------------------------- */

export const MAX_RULES_PER_GROUP = 50;

const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code");

// `field` is the discriminator: it decides which `op` values and which `value` type are allowed.
// z.object strips unknown keys, so switching a rule from `ltv` to `country` can't leave a stale
// `currency` in the parsed data.
export const ruleSchema = z.discriminatedUnion("field", [
  z.object({
    kind: z.literal("rule"),
    field: z.literal("country"),
    op: z.enum(["in", "not_in"]),
    value: z.array(z.string().regex(/^[A-Z]{2}$/, "Use 2-letter country codes")).min(1, "Pick at least one country"),
  }),
  z.object({
    kind: z.literal("rule"),
    field: z.literal("age"),
    op: z.literal("between"),
    value: z
      .tuple([z.int().min(13).max(120), z.int().min(13).max(120)])
      .refine(([from, to]) => from <= to, { message: "Max age must be ≥ min age", path: [1] }),
  }),
  z.object({
    kind: z.literal("rule"),
    field: z.literal("ltv"),
    op: z.enum(["gt", "lt"]),
    value: z.number().min(0, "LTV can't be negative"),
    currency: currencyCodeSchema,
  }),
  z.object({
    kind: z.literal("rule"),
    field: z.literal("last_seen"),
    op: z.literal("within_days"),
    value: z.int().min(1).max(365),
  }),
  z.object({
    kind: z.literal("rule"),
    field: z.literal("tag"),
    op: z.enum(["has", "not_has"]),
    value: z.string().trim().min(1, "Enter a tag").max(50),
  }),
]);

export type Rule = z.infer<typeof ruleSchema>;

/** A group of rules and sub-groups. Declared by hand: the schema below is built level by level. */
export interface RuleGroup {
  kind: "group";
  op: "and" | "or";
  children: (RuleGroup | Rule)[];
}

/**
 * Nesting limit: the root group plus one level of sub-groups (Core). Shared by the UI and the server.
 * The limit is part of the schema, not only of the UI: a request with a deeper tree is a validation
 * error, and zod never descends deeper than this (a recursive schema would recurse as deep as the
 * input goes, and 2000 levels overflow the call stack).
 */
export const MAX_GROUP_DEPTH = 2;

const groupOpSchema = z.enum(["and", "or"]);
type RuleGroupSchema = z.ZodObject<{
  kind: z.ZodLiteral<"group">;
  op: typeof groupOpSchema;
  children: z.ZodType<RuleGroup["children"], RuleGroup["children"]>;
}>;

/** Schema of a group at `level` (1 = root). Its children may be groups only above the deepest level. */
function ruleGroupSchemaAt(level: number): RuleGroupSchema {
  const child =
    level < MAX_GROUP_DEPTH
      ? z.discriminatedUnion("kind", [ruleGroupSchemaAt(level + 1), ruleSchema])
      : z.discriminatedUnion("kind", [ruleSchema], {
          error: `Groups can be nested at most ${MAX_GROUP_DEPTH} levels deep`,
        });
  return z.object({
    kind: z.literal("group"),
    op: groupOpSchema,
    children: z
      .array(child)
      .min(1, "Group can't be empty")
      .max(MAX_RULES_PER_GROUP, `Group can't have more than ${MAX_RULES_PER_GROUP} items`),
  });
}

export const ruleGroupSchema = ruleGroupSchemaAt(1);

/* -------------------------------------------------------------------------------------------- */
/* Budget & schedule                                                                             */
/* -------------------------------------------------------------------------------------------- */

// Amounts are integers in minor units (cents).
const amountSchema = z.int("Enter an amount").positive("Amount must be greater than 0");

export const budgetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily"), amount: amountSchema, currency: currencyCodeSchema }),
  z.object({
    type: z.literal("lifetime"),
    amount: amountSchema,
    currency: currencyCodeSchema,
    pacing: z.enum(["even", "asap"]),
  }),
]);

// Schedule dates are wall-clock ISO date-times *in the campaign timezone* ("2026-10-10T23:30"),
// not UTC instants. See ARCHITECTURE.md → assumptions.
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const localDateTimeSchema = z.string().refine(isValidLocalDateTime, "Enter a valid date and time");

const timezoneSchema = z.string().refine(isValidTimezone, "Unknown timezone");

const daypartSchema = z
  .object({
    weekday: z.literal([0, 1, 2, 3, 4, 5, 6]),
    from: z.string().regex(TIME, "Use HH:mm"),
    to: z.string().regex(TIME, "Use HH:mm"),
  })
  // Overnight intervals (22:00–02:00) are rejected on purpose: split them into two days.
  .refine((part) => part.from < part.to, { message: "End must be after start (split overnight intervals)", path: ["to"] });

export const scheduleSchema = z.object({
  timezone: timezoneSchema,
  start: localDateTimeSchema,
  end: localDateTimeSchema.optional(),
  dayparting: z.array(daypartSchema),
});

/* -------------------------------------------------------------------------------------------- */
/* Campaign form                                                                                 */
/* -------------------------------------------------------------------------------------------- */

// Budget minimums come from the server (`GET /api/config`), so the schema is built from config.
/** Wizard steps that own form fields, in order (the review step has no fields of its own). */
export const FORM_STEPS = ["basics", "audience", "budget"] as const;
export type FormStep = (typeof FORM_STEPS)[number];

export type CampaignSchemaConfig = {
  currencies: { code: string; minAmount: number }[];
};

// Uniqueness is checked separately (async, debounced) and finally by the server.
export const slugSchema = z
  .string()
  .min(3, "At least 3 characters")
  .max(60, "At most 60 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, digits and single dashes only");

const basicsShape = {
  name: z.string().trim().min(3, "At least 3 characters").max(80, "At most 80 characters"),
  slug: slugSchema,
  objective: objectiveSchema,
};

type SchemaOptions = {
  /** The campaign has started: its start can't change, so "start can't be in the past" doesn't apply. */
  startLocked?: boolean;
};

export function buildCampaignSchemas(config: CampaignSchemaConfig, { startLocked = false }: SchemaOptions = {}) {
  // Cross-field rules of step 3. Shared by the step schema and the full schema.
  function checkBudgetAndSchedule(
    value: { budget: z.infer<typeof budgetSchema>; schedule: z.infer<typeof scheduleSchema> },
    ctx: z.RefinementCtx,
  ) {
    const { budget, schedule } = value;

    const currency = config.currencies.find((c) => c.code === budget.currency);
    if (!currency) {
      ctx.addIssue({ code: "custom", message: "Unsupported currency", path: ["budget", "currency"] });
    } else if (budget.amount < currency.minAmount) {
      ctx.addIssue({
        code: "custom",
        message: `Minimum is ${(currency.minAmount / 100).toFixed(2)} ${currency.code}`,
        path: ["budget", "amount"],
      });
    }

    if (budget.type === "lifetime" && !schedule.end) {
      ctx.addIssue({ code: "custom", message: "End date is required for a lifetime budget", path: ["schedule", "end"] });
    }

    // Both values are in the same timezone and format, so string comparison is chronological.
    if (schedule.end && schedule.end <= schedule.start) {
      ctx.addIssue({ code: "custom", message: "End must be after start", path: ["schedule", "end"] });
    }

    // "Not in the past" is checked in the campaign timezone, not in the browser's local time.
    if (!startLocked && isValidLocalDateTime(schedule.start) && isValidTimezone(schedule.timezone)) {
      const start = localDateTimeToInstant(schedule.start, schedule.timezone).getTime();
      const currentMinute = Math.floor(Date.now() / 60_000) * 60_000;
      if (start < currentMinute) {
        ctx.addIssue({ code: "custom", message: "Start can't be in the past", path: ["schedule", "start"] });
      }
    }

    for (const index of findOverlappingDayparts(schedule.dayparting)) {
      ctx.addIssue({
        code: "custom",
        message: "Overlaps another interval on the same day",
        path: ["schedule", "dayparting", index, "from"],
      });
    }
  }

  const budgetAndScheduleShape = { budget: budgetSchema, schedule: scheduleSchema };

  const campaign = z
    .object({ ...basicsShape, audience: ruleGroupSchema, ...budgetAndScheduleShape })
    .superRefine(checkBudgetAndSchedule);

  // Slices of the same rules, used for silent per-step checks (autosave) and draft saves.
  const steps = {
    basics: z.object(basicsShape),
    audience: z.object({ audience: ruleGroupSchema }),
    budget: z.object(budgetAndScheduleShape).superRefine(checkBudgetAndSchedule),
  } satisfies Record<FormStep, z.ZodType>;

  return { campaign, steps };
}

/* -------------------------------------------------------------------------------------------- */
/* Helpers                                                                                       */
/* -------------------------------------------------------------------------------------------- */

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function isValidLocalDateTime(value: string) {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  // Round-trip through Date.UTC to reject impossible dates like Feb 30.
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute
  );
}

/** "2026-10-10T23:30" in "America/Los_Angeles" → the real instant. */
export function localDateTimeToInstant(value: string, timezone: string): Date {
  const [year, month, day, hour, minute] = LOCAL_DATE_TIME.exec(value)!.slice(1).map(Number);
  return new TZDate(year, month - 1, day, hour, minute, timezone);
}

/** Indexes of intervals that overlap another interval on the same weekday. */
function findOverlappingDayparts(parts: { weekday: number; from: string; to: string }[]) {
  const overlapping = new Set<number>();
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i];
      const b = parts[j];
      // Half-open intervals: 10:00–12:00 and 12:00–14:00 touch but don't overlap.
      if (a.weekday === b.weekday && a.from < b.to && b.from < a.to) {
        overlapping.add(i);
        overlapping.add(j);
      }
    }
  }
  return [...overlapping];
}

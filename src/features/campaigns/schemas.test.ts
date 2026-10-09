import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toFieldErrors } from "@/lib/result";
import { buildCampaignSchemas, ruleGroupSchema, ruleSchema } from "./schemas";
import type { CampaignFormValues, RuleGroup } from "./types";

const config = { currencies: [{ code: "USD", minAmount: 1_000 }] }; // min $10.00
const { campaign, steps } = buildCampaignSchemas(config);

// 2026-10-11 06:00 UTC = 2026-10-10 23:00 in Los Angeles (PDT) = 2026-10-11 09:00 in Kyiv.
const NOW = new Date("2026-10-11T06:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

function validCampaign(): CampaignFormValues {
  return {
    name: "Autumn sale",
    slug: "autumn-sale",
    objective: "conversion",
    audience: {
      kind: "group",
      op: "and",
      children: [{ kind: "rule", field: "country", op: "in", value: ["UA", "PL"] }],
    },
    budget: { type: "daily", amount: 5_000, currency: "USD" },
    schedule: { timezone: "Europe/Kyiv", start: "2026-10-12T10:00", dayparting: [] },
  };
}

/** Parses and returns `{ path: message }` (empty object when valid). */
function errorsOf(value: unknown) {
  const result = campaign.safeParse(value);
  return result.success ? {} : toFieldErrors(result.error);
}

describe("campaign schema", () => {
  it("accepts a valid campaign", () => {
    expect(errorsOf(validCampaign())).toEqual({});
  });

  it("validates name length and slug format", () => {
    const errors = errorsOf({ ...validCampaign(), name: "ab", slug: "Bad Slug" });
    expect(errors).toHaveProperty("name");
    expect(errors).toHaveProperty("slug");
  });
});

describe("rule discriminated union", () => {
  it("only allows operators that belong to the field", () => {
    const result = ruleSchema.safeParse({ kind: "rule", field: "age", op: "in", value: [18, 30] });
    expect(result.success).toBe(false);
  });

  it("checks the value type by field", () => {
    const result = ruleSchema.safeParse({ kind: "rule", field: "last_seen", op: "within_days", value: "7" });
    expect(result.success).toBe(false);
  });

  it("puts the age range error on the max value", () => {
    const result = ruleSchema.safeParse({ kind: "rule", field: "age", op: "between", value: [40, 20] });
    expect(result.success).toBe(false);
    expect(toFieldErrors(result.error!)).toHaveProperty("value.1");
  });

  it("strips keys left over from another field type", () => {
    // e.g. the user switched a rule from `ltv` to `country`, and `currency` stayed in the object
    const parsed = ruleSchema.parse({ kind: "rule", field: "country", op: "in", value: ["UA"], currency: "USD" });
    expect(parsed).toEqual({ kind: "rule", field: "country", op: "in", value: ["UA"] });
  });
});

describe("rule group tree", () => {
  it("accepts nested groups", () => {
    const tree: RuleGroup = {
      kind: "group",
      op: "or",
      children: [
        { kind: "rule", field: "tag", op: "has", value: "vip" },
        {
          kind: "group",
          op: "and",
          children: [
            { kind: "rule", field: "age", op: "between", value: [18, 35] },
            { kind: "rule", field: "ltv", op: "gt", value: 100, currency: "USD" },
          ],
        },
      ],
    };
    expect(ruleGroupSchema.safeParse(tree).success).toBe(true);
  });

  it("reports errors by the full nested path", () => {
    const value = validCampaign();
    value.audience.children = [
      { kind: "rule", field: "tag", op: "has", value: "vip" },
      { kind: "group", op: "and", children: [{ kind: "rule", field: "tag", op: "has", value: "" }] },
    ];
    expect(errorsOf(value)).toHaveProperty(["audience.children.1.children.0.value"]);
  });

  it("puts empty-group and too-many-rules errors on the group", () => {
    const empty = validCampaign();
    empty.audience.children = [{ kind: "group", op: "and", children: [] }];
    expect(errorsOf(empty)).toHaveProperty(["audience.children.0.children"]);

    const tooMany = validCampaign();
    tooMany.audience.children = Array.from({ length: 51 }, () => ({
      kind: "rule" as const,
      field: "tag" as const,
      op: "has" as const,
      value: "x",
    }));
    expect(errorsOf(tooMany)).toHaveProperty(["audience.children"]);
  });
});

describe("budget", () => {
  it("drops `pacing` from a daily budget", () => {
    const value = { ...validCampaign(), budget: { type: "daily", amount: 5_000, currency: "USD", pacing: "even" } };
    const parsed = campaign.parse(value);
    expect(parsed.budget).not.toHaveProperty("pacing");
  });

  it("requires pacing for a lifetime budget", () => {
    const value = { ...validCampaign(), budget: { type: "lifetime", amount: 5_000, currency: "USD" } };
    expect(errorsOf(value)).toHaveProperty(["budget.pacing"]);
  });

  it("enforces the per-currency minimum from config", () => {
    const value = { ...validCampaign(), budget: { type: "daily", amount: 999, currency: "USD" } };
    expect(errorsOf(value)).toEqual({ "budget.amount": "Minimum is 10.00 USD" });
  });

  it("rejects a currency that isn't in config", () => {
    const value = { ...validCampaign(), budget: { type: "daily", amount: 5_000, currency: "EUR" } };
    expect(errorsOf(value)).toHaveProperty(["budget.currency"]);
  });
});

describe("schedule cross-validation", () => {
  it("requires end for a lifetime budget", () => {
    const value = validCampaign();
    value.budget = { type: "lifetime", amount: 5_000, currency: "USD", pacing: "even" };
    expect(errorsOf(value)).toEqual({ "schedule.end": "End date is required for a lifetime budget" });
  });

  it("requires end after start", () => {
    const value = validCampaign();
    value.schedule.end = "2026-10-12T09:00";
    expect(errorsOf(value)).toEqual({ "schedule.end": "End must be after start" });
  });

  it("checks 'not in the past' in the campaign timezone, not the browser's", () => {
    // In LA it's 23:00 on Oct 10, while in Kyiv it's already Oct 11.
    const later = validCampaign();
    later.schedule = { timezone: "America/Los_Angeles", start: "2026-10-10T23:30", dayparting: [] };
    expect(errorsOf(later)).toEqual({});

    const earlier = validCampaign();
    earlier.schedule = { timezone: "America/Los_Angeles", start: "2026-10-10T22:30", dayparting: [] };
    expect(errorsOf(earlier)).toEqual({ "schedule.start": "Start can't be in the past" });
  });

  it("rejects impossible dates and unknown timezones", () => {
    const value = validCampaign();
    value.schedule = { timezone: "Mars/Olympus", start: "2026-02-30T10:00", dayparting: [] };
    const errors = errorsOf(value);
    expect(errors).toHaveProperty(["schedule.timezone"]);
    expect(errors).toHaveProperty(["schedule.start"]);
  });
});

describe("dayparting", () => {
  it("marks every overlapping interval of the same day", () => {
    const value = validCampaign();
    value.schedule.dayparting = [
      { weekday: 1, from: "09:00", to: "12:00" },
      { weekday: 1, from: "11:00", to: "14:00" },
      { weekday: 2, from: "11:00", to: "14:00" }, // other day: fine
    ];
    expect(errorsOf(value)).toEqual({
      "schedule.dayparting.0.from": "Overlaps another interval on the same day",
      "schedule.dayparting.1.from": "Overlaps another interval on the same day",
    });
  });

  it("treats touching intervals as non-overlapping", () => {
    const value = validCampaign();
    value.schedule.dayparting = [
      { weekday: 1, from: "10:00", to: "12:00" },
      { weekday: 1, from: "12:00", to: "14:00" },
    ];
    expect(errorsOf(value)).toEqual({});
  });

  it("rejects overnight intervals like 22:00–02:00", () => {
    const value = validCampaign();
    value.schedule.dayparting = [{ weekday: 5, from: "22:00", to: "02:00" }];
    expect(errorsOf(value)).toHaveProperty(["schedule.dayparting.0.to"]);
  });
});

describe("step schemas", () => {
  it("validate only their own fields", () => {
    const value = { ...validCampaign(), audience: { kind: "group", op: "and", children: [] } };
    expect(steps.basics.safeParse(value).success).toBe(true);
    expect(steps.audience.safeParse(value).success).toBe(false);
  });

  it("run the same cross-field rules as the full schema", () => {
    const value = validCampaign();
    value.schedule.end = "2026-10-12T09:00";
    expect(steps.budget.safeParse(value).success).toBe(false);
  });
});

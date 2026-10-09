import { describe, expect, it } from "vitest";
import { buildCampaignSchemas } from "../schemas";
import type { CampaignFormValues } from "../types";
import { furthestAllowedStep, isStepAllowed, parseStep } from "./steps";
import { slugify } from "./slugify";

const { steps } = buildCampaignSchemas({ currencies: [{ code: "USD", minAmount: 1_000 }] });

const values: CampaignFormValues = {
  name: "Autumn sale",
  slug: "autumn-sale",
  objective: "conversion",
  audience: { kind: "group", op: "and", children: [] }, // invalid: empty group
  budget: { type: "daily", amount: 5_000, currency: "USD" },
  schedule: { timezone: "UTC", start: "2099-01-01T10:00", dayparting: [] },
};

describe("wizard steps", () => {
  it("parses only known steps (?step=unknown → null)", () => {
    expect(parseStep("audience")).toBe("audience");
    expect(parseStep("unknown")).toBeNull();
    expect(parseStep(null)).toBeNull();
  });

  it("stops at the first invalid step", () => {
    expect(furthestAllowedStep(values, steps)).toBe("audience");
    expect(furthestAllowedStep({ ...values, name: "" }, steps)).toBe("basics");

    const complete = {
      ...values,
      audience: { kind: "group", op: "and", children: [{ kind: "rule", field: "tag", op: "has", value: "vip" }] },
    };
    expect(furthestAllowedStep(complete, steps)).toBe("review");
  });

  it("allows the furthest step and everything before it", () => {
    expect(isStepAllowed("basics", "audience")).toBe(true);
    expect(isStepAllowed("audience", "audience")).toBe(true);
    expect(isStepAllowed("budget", "audience")).toBe(false);
  });
});

describe("slugify", () => {
  it.each([
    ["Black Friday — 50% OFF!", "black-friday-50-off"],
    ["  Café   Crème ", "cafe-creme"],
    ["Привет мир", ""], // no latin letters: the user has to type a slug
    ["a".repeat(59) + " b", "a".repeat(59)],
  ])("%j → %j", (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });
});

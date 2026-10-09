import { describe, expect, it } from "vitest";
import { ruleSchema } from "../../schemas";
import type { RuleField } from "../../types";
import { defaultRule, FIELD_OPERATORS, newGroup } from "./rules";

const FIELDS: RuleField[] = ["country", "age", "ltv", "last_seen", "tag"];

describe("defaultRule", () => {
  it.each(FIELDS)("%s: has the field's first operator and only the keys of its type", (field) => {
    const rule = defaultRule(field);
    expect(rule.field).toBe(field);
    expect(rule.op).toBe(FIELD_OPERATORS[field][0].value);
    // Parsing strips unknown keys; equal objects mean the default has no extra keys.
    const parsed = ruleSchema.safeParse(rule);
    if (parsed.success) expect(parsed.data).toEqual(rule);
  });

  it("switching from LTV to Country leaves no currency behind", () => {
    const ltv = defaultRule("ltv");
    expect(ltv).toHaveProperty("currency");
    expect(defaultRule("country")).not.toHaveProperty("currency");
  });

  it("defaults that need user input are invalid on purpose", () => {
    // An empty country list / tag must be filled in before the step can be completed.
    expect(ruleSchema.safeParse(defaultRule("country")).success).toBe(false);
    expect(ruleSchema.safeParse(defaultRule("tag")).success).toBe(false);
    expect(ruleSchema.safeParse(defaultRule("age")).success).toBe(true);
  });

  it("every operator offered in the UI is accepted by the schema for that field", () => {
    for (const field of FIELDS) {
      for (const { value: op } of FIELD_OPERATORS[field]) {
        const rule = { ...defaultRule(field), op };
        const issues = ruleSchema.safeParse(rule).error?.issues ?? [];
        expect(issues.some((issue) => issue.path[0] === "op")).toBe(false);
      }
    }
  });
});

describe("newGroup", () => {
  it("starts with one rule so it isn't empty", () => {
    expect(newGroup().children).toHaveLength(1);
  });
});

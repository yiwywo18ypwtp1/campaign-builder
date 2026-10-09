import type { Rule, RuleField, RuleGroup } from "../../types";

/** Core: the root group plus one level of sub-groups. The schema allows any depth; the UI limits it. */
export const MAX_GROUP_DEPTH = 2;

export const COUNTRIES = ["UA", "PL", "DE", "US", "GB", "FR", "ES", "IT", "NL", "SE", "CA", "JP"];

export const FIELD_LABELS: Record<RuleField, string> = {
  country: "Country",
  age: "Age",
  ltv: "Lifetime value",
  last_seen: "Last seen",
  tag: "Tag",
};

/** Operators allowed for each field (the same pairs the zod discriminated union accepts). */
export const FIELD_OPERATORS = {
  country: [
    { value: "in", label: "is one of" },
    { value: "not_in", label: "is not one of" },
  ],
  age: [{ value: "between", label: "is between" }],
  ltv: [
    { value: "gt", label: "greater than" },
    { value: "lt", label: "less than" },
  ],
  last_seen: [{ value: "within_days", label: "within the last" }],
  tag: [
    { value: "has", label: "has" },
    { value: "not_has", label: "doesn't have" },
  ],
} satisfies Record<RuleField, { value: Rule["op"]; label: string }[]>;

/**
 * A fresh rule for `field`. Changing a rule's field replaces the whole object with this, so the
 * operator and value always match the field and nothing from the previous type is left behind
 * (e.g. no stale `currency` after switching from LTV to Country).
 */
export function defaultRule(field: RuleField): Rule {
  switch (field) {
    case "country":
      return { kind: "rule", field, op: "in", value: [] };
    case "age":
      return { kind: "rule", field, op: "between", value: [18, 65] };
    case "ltv":
      return { kind: "rule", field, op: "gt", value: 100, currency: "USD" };
    case "last_seen":
      return { kind: "rule", field, op: "within_days", value: 30 };
    case "tag":
      return { kind: "rule", field, op: "has", value: "" };
  }
}

export function newGroup(): RuleGroup {
  return { kind: "group", op: "and", children: [defaultRule("country")] };
}

/*
 * Field paths in a recursive tree.
 * React Hook Form's path types stop after the first level of a recursive type (ARCHITECTURE.md,
 * phase 1): "audience.children.0.children.1.op" is not a typed path. But the tree is self-similar —
 * any group's `children` has exactly the type of `audience.children`, and any child the type of
 * `audience.children.${number}`. So the real (runtime) path is cast to the top-level literal here,
 * in one place: value types stay exact, only the path literal is approximate.
 */
export type GroupPath = "audience";
export type ChildPath = `audience.children.${number}`;

export const asGroupPath = (path: string) => path as GroupPath;
export const asChildPath = (path: string) => path as ChildPath;

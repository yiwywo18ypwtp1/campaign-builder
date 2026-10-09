import type { Rule, RuleGroup } from "../types";

// Read-only audience tree. A Server Component: recursion and formatting run on the server,
// the browser gets plain HTML and no JavaScript.

const OPERATOR_LABELS: Record<Rule["op"], string> = {
  in: "is one of",
  not_in: "is not one of",
  between: "is between",
  gt: "is greater than",
  lt: "is less than",
  within_days: "was seen within",
  has: "has",
  not_has: "doesn't have",
};

const FIELD_LABELS: Record<Rule["field"], string> = {
  country: "Country",
  age: "Age",
  ltv: "Lifetime value",
  last_seen: "Last seen",
  tag: "Tag",
};

export function RuleTreeView({ group }: { group: RuleGroup }) {
  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Match {group.op === "and" ? "all" : "any"} of
      </span>
      <ul className="grid gap-2">
        {group.children.map((child, index) => (
          // Read-only and never reordered: the index is a stable key here.
          <li key={index}>{child.kind === "group" ? <RuleTreeView group={child} /> : <RuleText rule={child} />}</li>
        ))}
      </ul>
    </div>
  );
}

function RuleText({ rule }: { rule: Rule }) {
  return (
    <p className="text-sm">
      <span className="font-medium">{FIELD_LABELS[rule.field]}</span> {OPERATOR_LABELS[rule.op]}{" "}
      <span className="font-medium">{formatValue(rule)}</span>
    </p>
  );
}

function formatValue(rule: Rule): string {
  switch (rule.field) {
    case "country":
      return rule.value.join(", ");
    case "age":
      return `${rule.value[0]} and ${rule.value[1]}`;
    case "ltv":
      return `${rule.value} ${rule.currency}`;
    case "last_seen":
      return `${rule.value} days`;
    case "tag":
      return rule.value;
  }
}

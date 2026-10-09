import "server-only";
import type { Rule, RuleGroup } from "@/features/campaigns/types";

// Fake but deterministic audience size: every rule keeps some share of the population,
// AND multiplies the shares, OR combines them like independent events.

const POPULATION = 50_000_000;

export function estimateAudience(group: RuleGroup): number {
  return Math.round(POPULATION * groupShare(group));
}

function groupShare(group: RuleGroup): number {
  const shares = group.children.map((child) => (child.kind === "group" ? groupShare(child) : ruleShare(child)));
  if (group.op === "and") return shares.reduce((acc, share) => acc * share, 1);
  return 1 - shares.reduce((acc, share) => acc * (1 - share), 1);
}

function ruleShare(rule: Rule): number {
  switch (rule.field) {
    case "country": {
      const share = Math.min(1, rule.value.length * 0.06);
      return rule.op === "in" ? share : 1 - share;
    }
    case "age":
      return Math.min(1, (rule.value[1] - rule.value[0] + 1) / 60);
    case "ltv":
      return rule.op === "gt" ? 0.3 : 0.7;
    case "last_seen":
      return Math.min(1, rule.value / 90);
    case "tag":
      return rule.op === "has" ? 0.15 : 0.85;
  }
}

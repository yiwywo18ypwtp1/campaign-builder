import { describe, expect, it } from "vitest";
import type { Rule, RuleGroup } from "@/features/campaigns/types";
import { addActivity, listActivity } from "./activity";
import { estimateAudience } from "./audience";

describe("listActivity", () => {
  it("pages through the log newest first without duplicates", () => {
    const campaignId = "cmp_00010"; // every 10th seeded campaign has a long log
    addActivity(campaignId, "u_me", "paused the campaign");

    const items: { at: string; id: number }[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const result = listActivity(campaignId, cursor);
      if (!result.ok) throw new Error(result.error.message);
      if (pages === 0) expect(result.data.items[0].message).toBe("paused the campaign");
      items.push(...result.data.items);
      cursor = result.data.nextCursor ?? undefined;
      pages++;
    } while (cursor);

    expect(pages).toBeGreaterThan(1);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    for (let i = 1; i < items.length; i++) {
      const [prev, next] = [items[i - 1], items[i]];
      expect(prev.at > next.at || (prev.at === next.at && prev.id > next.id)).toBe(true);
    }
  });

  it("rejects a garbage cursor", () => {
    const result = listActivity("cmp_00010", "garbage");
    expect(result.ok ? null : result.error.code).toBe("INVALID_CURSOR");
  });
});

describe("estimateAudience", () => {
  const vip: Rule = { kind: "rule", field: "tag", op: "has", value: "vip" };
  const young: Rule = { kind: "rule", field: "age", op: "between", value: [18, 24] };

  it("narrows with AND and widens with OR", () => {
    const and: RuleGroup = { kind: "group", op: "and", children: [vip, young] };
    const or: RuleGroup = { kind: "group", op: "or", children: [vip, young] };
    const single: RuleGroup = { kind: "group", op: "and", children: [vip] };

    expect(estimateAudience(and)).toBeLessThan(estimateAudience(single));
    expect(estimateAudience(or)).toBeGreaterThan(estimateAudience(single));
  });

  it("is deterministic", () => {
    const tree: RuleGroup = { kind: "group", op: "and", children: [vip, { kind: "group", op: "or", children: [young, vip] }] };
    expect(estimateAudience(tree)).toBe(estimateAudience(structuredClone(tree)));
  });
});

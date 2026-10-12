import { describe, expect, it } from "vitest";
import { listQuerySchema, type CampaignListItem } from "@/features/campaigns/list-query";
import type { Campaign } from "@/features/campaigns/types";
import type { Result } from "@/lib/result";
import {
  bulkChangeStatus,
  changeStatus,
  createCampaign,
  getCampaign,
  getDefaultFormValues,
  listCampaigns,
  publishCampaign,
  submitCampaign,
  updateCampaign,
} from "./campaigns";
import { getDb } from "./db";
import type { CurrentUser } from "./session";

const viewer: CurrentUser = { id: "u_me", role: "viewer" };
const editor: CurrentUser = { id: "u_me", role: "editor" };
const admin: CurrentUser = { id: "u_me", role: "admin" };

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}

function errorOf(result: Result<unknown>) {
  if (result.ok) throw new Error("Expected an error");
  return result.error;
}

/** Follows `nextCursor` until the end and returns every row. */
function listAll(query: Record<string, unknown>): { items: CampaignListItem[]; total: number } {
  const items: CampaignListItem[] = [];
  let cursor: string | undefined;
  let total = 0;
  do {
    const page = unwrap(listCampaigns(listQuerySchema.parse({ ...query, cursor, limit: 200 })));
    items.push(...page.items);
    total = page.total;
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return { items, total };
}

/** A seeded campaign in the given status that no earlier test has touched (version 1). */
function findSeeded(status: Campaign["status"]): Campaign {
  const row = getDb().prepare("SELECT id FROM campaigns WHERE status = ? AND version = 1 LIMIT 1").get(status) as { id: string };
  return getCampaign(row.id)!;
}

let slugCounter = 0;
function newDraft(): Campaign {
  slugCounter++;
  const values = { ...getDefaultFormValues("UTC"), name: `Test campaign ${slugCounter}`, slug: `test-campaign-${slugCounter}` };
  return unwrap(createCampaign(editor, { values, step: "basics" }));
}

describe("listCampaigns (keyset pagination)", () => {
  it.each([
    { sort: "name", order: "asc" },
    { sort: "spend", order: "desc" },
    { sort: "end", order: "asc" },
  ])("walks every filtered row exactly once, in order ($sort $order)", ({ sort, order }) => {
    const { items, total } = listAll({ objective: "retention", status: ["running", "paused"], sort, order });

    expect(total).toBeGreaterThan(1_000);
    expect(items).toHaveLength(total);
    expect(new Set(items.map((item) => item.id)).size).toBe(total);
    expect(items.every((item) => item.objective === "retention" && ["running", "paused"].includes(item.status))).toBe(true);

    if (sort === "spend") {
      const spends = items.map((item) => item.spend);
      expect(spends).toEqual([...spends].sort((a, b) => b - a));
    }
  });

  it("doesn't repeat or skip rows when a campaign is added between pages", () => {
    const query = { sort: "updatedAt", order: "desc", limit: 50 };
    const first = unwrap(listCampaigns(listQuerySchema.parse(query)));
    newDraft(); // newest updatedAt → lands before the cursor, must not shift the next page
    const second = unwrap(listCampaigns(listQuerySchema.parse({ ...query, cursor: first.nextCursor })));

    const firstIds = new Set(first.items.map((item) => item.id));
    expect(second.items.some((item) => firstIds.has(item.id))).toBe(false);
    expect(second.items[0].updatedAt <= first.items.at(-1)!.updatedAt).toBe(true);
  });

  it("rejects a garbage cursor and a cursor from another sort", () => {
    expect(errorOf(listCampaigns(listQuerySchema.parse({ cursor: "garbage" }))).code).toBe("INVALID_CURSOR");

    const page = unwrap(listCampaigns(listQuerySchema.parse({ sort: "name" })));
    expect(errorOf(listCampaigns(listQuerySchema.parse({ sort: "spend", cursor: page.nextCursor }))).code).toBe(
      "INVALID_CURSOR",
    );
  });

  it("treats search text literally", () => {
    expect(unwrap(listCampaigns(listQuerySchema.parse({ search: "%" }))).total).toBe(0);
    expect(unwrap(listCampaigns(listQuerySchema.parse({ search: "FLASH sale" }))).total).toBeGreaterThan(0);
  });

  it("filters by start date range", () => {
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const [from, to] = [day(-30), day(-20)]; // seeded starts are relative to today
    const { items } = listAll({ from, to });

    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.start.slice(0, 10) >= from && item.start.slice(0, 10) <= to)).toBe(true);
  });

  it("rejects unknown statuses at the API level", () => {
    expect(listQuerySchema.safeParse({ status: ["hack"] }).success).toBe(false);
  });
});

describe("createCampaign", () => {
  it("is forbidden for viewers", () => {
    expect(errorOf(createCampaign(viewer, { values: {}, step: "basics" })).code).toBe("FORBIDDEN");
  });

  it("validates only the steps up to the current one and ignores later input", () => {
    const values = {
      ...getDefaultFormValues("UTC"),
      name: "Step one only",
      slug: "step-one-only",
      budget: { type: "daily", amount: 5, currency: "USD" }, // invalid, but step 3 isn't reached yet
    };
    const campaign = unwrap(createCampaign(editor, { values, step: "basics" }));

    expect(campaign.status).toBe("draft");
    expect(campaign.budget.amount).toBe(getDefaultFormValues("UTC").budget.amount);
  });

  it("returns field errors by path", () => {
    const error = errorOf(createCampaign(editor, { values: { name: "ab", slug: "x" }, step: "basics" }));
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.fieldErrors).toHaveProperty("name");
    expect(error.fieldErrors).toHaveProperty("slug");
  });

  it("rejects a taken slug", () => {
    const existing = newDraft();
    const values = { ...getDefaultFormValues("UTC"), name: "Copy", slug: existing.slug };
    const error = errorOf(createCampaign(editor, { values, step: "basics" }));
    expect(error.code).toBe("SLUG_TAKEN");
    expect(error.fieldErrors).toEqual({ slug: "This slug is already taken" });
  });
});

describe("updateCampaign (optimistic concurrency)", () => {
  it("requires the version and rejects a stale one", () => {
    const draft = newDraft();
    const input = { values: { ...draft, name: "Renamed" }, step: "basics" };

    expect(errorOf(updateCampaign(editor, draft.id, input, undefined)).code).toBe("PRECONDITION_REQUIRED");

    const saved = unwrap(updateCampaign(editor, draft.id, input, draft.version));
    expect(saved.version).toBe(draft.version + 1);
    expect(saved.name).toBe("Renamed");

    // A second tab still holds the old version.
    expect(errorOf(updateCampaign(editor, draft.id, input, draft.version)).code).toBe("VERSION_CONFLICT");
  });

  it("lets editors edit drafts only", () => {
    const running = findSeeded("running");
    expect(errorOf(updateCampaign(editor, running.id, { values: running }, running.version)).code).toBe("FORBIDDEN");
  });

  it("frees the old slug after a rename", () => {
    const draft = newDraft();
    unwrap(updateCampaign(editor, draft.id, { values: { ...draft, slug: `${draft.slug}-v2` }, step: "basics" }, draft.version));
    const values = { ...getDefaultFormValues("UTC"), name: "Takes the old slug", slug: draft.slug };
    expect(createCampaign(editor, { values, step: "basics" }).ok).toBe(true);
  });
});

describe("editing a campaign that has started", () => {
  it("saves a running campaign although its start is in the past", () => {
    const running = findSeeded("running");
    const saved = unwrap(updateCampaign(admin, running.id, { values: { ...running, name: "Renamed while running" } }, running.version));
    expect(saved.name).toBe("Renamed while running");
    expect(saved.status).toBe("running");
  });

  it.each([
    ["slug", (c: Campaign) => ({ ...c, slug: `${c.slug}-changed` })],
    ["objective", (c: Campaign) => ({ ...c, objective: c.objective === "awareness" ? "conversion" : "awareness" })],
    ["schedule.start", (c: Campaign) => ({ ...c, schedule: { ...c.schedule, start: "2099-01-01T09:00" } })],
    ["schedule.timezone", (c: Campaign) => ({ ...c, schedule: { ...c.schedule, timezone: c.schedule.timezone === "UTC" ? "Asia/Tokyo" : "UTC" } })],
  ])("rejects a change of the locked field %s", (path, change) => {
    const paused = findSeeded("paused");
    const error = errorOf(updateCampaign(admin, paused.id, { values: change(paused) }, paused.version));
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(Object.keys(error.fieldErrors ?? {})).toEqual([path]);
  });

  it("still checks the start of drafts and scheduled campaigns", () => {
    const draft = newDraft();
    const values = { ...draft, schedule: { ...draft.schedule, start: "2020-01-01T09:00" } };
    const error = errorOf(updateCampaign(editor, draft.id, { values, step: "budget" }, draft.version));
    expect(error.fieldErrors).toHaveProperty(["schedule.start"]);
  });
});

describe("submitCampaign (new campaign)", () => {
  const valid = () => ({
    ...getDefaultFormValues("UTC"),
    name: "Submitted at once",
    slug: `submitted-${++slugCounter}`,
    audience: { kind: "group", op: "and", children: [{ kind: "rule", field: "country", op: "in", value: ["UA"] }] },
  });
  const count = (slug: string) => (getDb().prepare("SELECT COUNT(*) AS n FROM campaigns WHERE slug = ?").get(slug) as { n: number }).n;

  it("creates the campaign already scheduled, in one write", () => {
    const values = valid();
    const campaign = unwrap(submitCampaign(editor, undefined, values, undefined));
    expect(campaign).toMatchObject({ status: "scheduled", version: 1 });
    expect(count(values.slug)).toBe(1);
  });

  it("leaves nothing behind when the campaign is invalid", () => {
    const values = { ...valid(), budget: { type: "daily", amount: 1, currency: "USD" } };
    expect(errorOf(submitCampaign(editor, undefined, values, undefined)).fieldErrors).toHaveProperty(["budget.amount"]);
    expect(count(values.slug)).toBe(0);
  });
});

describe("publishCampaign", () => {
  it("maps nested validation errors to field paths", () => {
    const draft = newDraft(); // default audience has a country rule without countries
    const error = errorOf(publishCampaign(editor, draft.id, draft, draft.version));
    expect(error.fieldErrors).toHaveProperty(["audience.children.0.value"]);
  });

  it("schedules a fully valid draft", () => {
    const draft = newDraft();
    const values = {
      ...draft,
      audience: { kind: "group", op: "and", children: [{ kind: "rule", field: "country", op: "in", value: ["UA"] }] },
    };
    const published = unwrap(publishCampaign(editor, draft.id, values, draft.version));
    expect(published.status).toBe("scheduled");
  });
});

describe("changeStatus and bulk", () => {
  it("checks the role on the server", () => {
    const running = findSeeded("running");
    expect(errorOf(changeStatus(editor, running.id, "archive")).code).toBe("FORBIDDEN");
    expect(errorOf(changeStatus(viewer, running.id, "pause")).code).toBe("FORBIDDEN");
  });

  it("follows the transition rules", () => {
    const draft = newDraft();
    expect(errorOf(changeStatus(editor, draft.id, "pause")).code).toBe("INVALID_TRANSITION");

    const running = findSeeded("running");
    expect(unwrap(changeStatus(editor, running.id, "pause")).status).toBe("paused");
    expect(unwrap(changeStatus(editor, running.id, "resume")).status).toBe("running");
    expect(unwrap(changeStatus(admin, running.id, "archive")).status).toBe("archived");
  });

  it("reports partial failures per campaign", () => {
    const running = findSeeded("running");
    const draft = newDraft();
    const result = unwrap(bulkChangeStatus(editor, { ids: [running.id, draft.id, "missing"] }, "pause"));

    expect(result.ok).toEqual([{ id: running.id, status: "paused" }]);
    expect(result.failed).toEqual([
      { id: draft.id, reason: "Can't pause a draft campaign" },
      { id: "missing", reason: "Campaign not found" },
    ]);
    expect(getCampaign(running.id)?.status).toBe("paused");
  });

  it("accepts a filter instead of ids", () => {
    const result = unwrap(bulkChangeStatus(editor, { filter: { status: ["paused"], objective: "awareness" } }, "resume"));
    expect(result.ok.length).toBeGreaterThan(0);
    expect(result.failed).toEqual([]);
  });
});

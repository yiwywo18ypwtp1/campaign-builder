import "server-only";
import { SqliteError } from "better-sqlite3";
import { z } from "zod";
import type { CampaignListItem, CampaignPage, ListFilters, ListQuery, SortKey } from "@/features/campaigns/list-query";
import { buildCampaignSchemas, FORM_STEPS, localDateTimeToInstant, type FormStep } from "@/features/campaigns/schemas";
import { canTransition, TRANSITIONS, type StatusAction } from "@/features/campaigns/status";
import type { Campaign, CampaignFormValues } from "@/features/campaigns/types";
import { can, canEditCampaign } from "@/lib/permissions";
import { fail, ok, toFieldErrors, type Result } from "@/lib/result";
import { addActivity } from "./activity";
import { getConfig } from "./config";
import { decodeCursor, encodeCursor } from "./cursor";
import { getDb } from "./db";
import { getPreferences } from "./preferences";
import type { CurrentUser } from "./session";

// All campaign rules live here: validation, permissions, versions, status transitions.
// Route Handlers and Server Actions are thin adapters that call these functions
// (ARCHITECTURE.md → D2). Functions take the user explicitly, so they are easy to test.

/* -------------------------------------------------------------------------------------------- */
/* Rows                                                                                          */
/* -------------------------------------------------------------------------------------------- */

type CampaignRow = {
  id: string;
  slug: string;
  name: string;
  status: Campaign["status"];
  objective: Campaign["objective"];
  owner_id: string;
  audience: string;
  budget: string;
  schedule: string;
  creatives: string;
  spend: number;
  version: number;
  created_at: string;
  updated_at: string;
};

function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    objective: row.objective,
    ownerId: row.owner_id,
    audience: JSON.parse(row.audience),
    budget: JSON.parse(row.budget),
    schedule: JSON.parse(row.schedule),
    creatives: JSON.parse(row.creatives),
    spend: row.spend,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* -------------------------------------------------------------------------------------------- */
/* Reads                                                                                         */
/* -------------------------------------------------------------------------------------------- */

export function getCampaign(id: string): Campaign | undefined {
  const row = getDb().prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as CampaignRow | undefined;
  return row && toCampaign(row);
}

export function isSlugAvailable(slug: string, excludeId?: string): boolean {
  const row = getDb().prepare("SELECT id FROM campaigns WHERE slug = ?").get(slug) as { id: string } | undefined;
  return row === undefined || row.id === excludeId;
}

/** SQL expression per sort key. Only these fixed strings are interpolated into SQL; values go as parameters. */
const SORT_SQL: Record<SortKey, string> = {
  name: "lower(c.name)",
  status: "c.status",
  objective: "c.objective",
  budget: "c.budget_amount", // assumption: compared without currency conversion
  spend: "c.spend",
  start: "c.schedule_start", // wall-clock time, as shown in the table
  end: "coalesce(c.schedule_end, '9999')", // "no end" sorts after any date
  owner: "lower(u.name)",
  updatedAt: "c.updated_at",
};

/** WHERE clause for the list filters, with `?` placeholders and their values. */
function filtersToSql(filters: ListFilters): { conditions: string[]; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.search) {
    // instr() is a plain substring match: "%" and "_" have no special meaning, unlike LIKE.
    const search = filters.search.toLowerCase();
    conditions.push("(instr(lower(c.name), ?) > 0 OR instr(c.slug, ?) > 0)");
    params.push(search, search);
  }
  if (filters.status?.length) {
    conditions.push(`c.status IN (${filters.status.map(() => "?").join(", ")})`);
    params.push(...filters.status);
  }
  if (filters.objective) {
    conditions.push("c.objective = ?");
    params.push(filters.objective);
  }
  if (filters.owner) {
    conditions.push("c.owner_id = ?");
    params.push(filters.owner);
  }
  // Start date in the campaign's own timezone (the wall-clock date part).
  if (filters.from) {
    conditions.push("substr(c.schedule_start, 1, 10) >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push("substr(c.schedule_start, 1, 10) <= ?");
    params.push(filters.to);
  }
  return { conditions, params };
}

function where(conditions: string[]) {
  return conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
}

const listCursorSchema = z.object({
  sort: z.string(),
  order: z.enum(["asc", "desc"]),
  value: z.union([z.string(), z.number()]),
  id: z.string(),
});

/**
 * Keyset pagination: the cursor holds the sort value and id of the last returned row, and the
 * next page is `WHERE (sort_value, id) > (cursor.value, cursor.id)`. Unlike an offset, it doesn't
 * skip or repeat rows when campaigns are added or changed between requests.
 */
export function listCampaigns(query: ListQuery): Result<CampaignPage> {
  const { sort, order, limit } = query;
  const sortSql = SORT_SQL[sort];
  const direction = order === "asc" ? "ASC" : "DESC";

  const filters = filtersToSql(query);
  const conditions = [...filters.conditions];
  const params = [...filters.params];

  if (query.cursor) {
    const cursor = decodeCursor(query.cursor, listCursorSchema);
    // A cursor from a different sort points to a meaningless position.
    if (!cursor || cursor.sort !== sort || cursor.order !== order) {
      return fail("INVALID_CURSOR", "Invalid cursor");
    }
    conditions.push(`(${sortSql}, c.id) ${order === "asc" ? ">" : "<"} (?, ?)`);
    params.push(cursor.value, cursor.id);
  }

  const db = getDb();
  // One row more than the limit tells whether there is a next page.
  const rows = db
    .prepare(
      `SELECT c.*, u.name AS owner_name, ${sortSql} AS sort_value
       FROM campaigns c JOIN users u ON u.id = c.owner_id
       ${where(conditions)}
       ORDER BY sort_value ${direction}, c.id ${direction}
       LIMIT ?`,
    )
    .all(...params, limit + 1) as (CampaignRow & { owner_name: string; sort_value: string | number })[];

  const { total } = db
    .prepare(`SELECT count(*) AS total FROM campaigns c ${where(filters.conditions)}`)
    .get(...filters.params) as { total: number };

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return ok({
    items: page.map((row) => toListItem(toCampaign(row), row.owner_name)),
    nextCursor: rows.length > limit && last ? encodeCursor({ sort, order, value: last.sort_value, id: last.id }) : null,
    total,
  });
}

function toListItem(campaign: Campaign, ownerName: string): CampaignListItem {
  return {
    id: campaign.id,
    slug: campaign.slug,
    name: campaign.name,
    status: campaign.status,
    objective: campaign.objective,
    budget: campaign.budget,
    spend: campaign.spend,
    timezone: campaign.schedule.timezone,
    start: campaign.schedule.start,
    end: campaign.schedule.end ?? null,
    ownerId: campaign.ownerId,
    ownerName,
    updatedAt: campaign.updatedAt,
    version: campaign.version,
  };
}

/* -------------------------------------------------------------------------------------------- */
/* Writes                                                                                        */
/* -------------------------------------------------------------------------------------------- */

function slugTaken(): Result<never> {
  return fail("SLUG_TAKEN", "This slug is already taken", { slug: "This slug is already taken" });
}

function isUniqueSlugError(error: unknown) {
  return error instanceof SqliteError && error.code === "SQLITE_CONSTRAINT_UNIQUE" && error.message.includes("slug");
}

function insertCampaign(campaign: Campaign): Result<Campaign> {
  try {
    getDb()
      .prepare(
        `INSERT INTO campaigns (id, slug, name, status, objective, owner_id, audience, budget, schedule, creatives,
                                spend, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        campaign.id,
        campaign.slug,
        campaign.name,
        campaign.status,
        campaign.objective,
        campaign.ownerId,
        JSON.stringify(campaign.audience),
        JSON.stringify(campaign.budget),
        JSON.stringify(campaign.schedule),
        JSON.stringify(campaign.creatives),
        campaign.spend,
        campaign.version,
        campaign.createdAt,
        campaign.updatedAt,
      );
  } catch (error) {
    // The UNIQUE constraint is the real guarantee: it also covers two saves racing for the same slug.
    if (isUniqueSlugError(error)) return slugTaken();
    throw error;
  }
  return ok(campaign);
}

/**
 * Writes a new version. `WHERE version = ?` makes the check-and-write atomic: if anyone saved in
 * between, no row matches and we report a conflict instead of overwriting their changes.
 */
function saveCampaign(
  current: Campaign,
  changes: Partial<CampaignFormValues> & { status?: Campaign["status"] },
  user: CurrentUser,
  activity: string,
): Result<Campaign> {
  const next: Campaign = { ...current, ...changes, version: current.version + 1, updatedAt: new Date().toISOString() };
  try {
    const { changes: updated } = getDb()
      .prepare(
        `UPDATE campaigns
         SET slug = ?, name = ?, status = ?, objective = ?, audience = ?, budget = ?, schedule = ?,
             version = ?, updated_at = ?
         WHERE id = ? AND version = ?`,
      )
      .run(
        next.slug,
        next.name,
        next.status,
        next.objective,
        JSON.stringify(next.audience),
        JSON.stringify(next.budget),
        JSON.stringify(next.schedule),
        next.version,
        next.updatedAt,
        current.id,
        current.version,
      );
    if (updated === 0) return fail("VERSION_CONFLICT", "Someone else changed this campaign");
  } catch (error) {
    if (isUniqueSlugError(error)) return slugTaken();
    throw error;
  }
  addActivity(next.id, user.id, activity);
  return ok(next);
}

/* -------------------------------------------------------------------------------------------- */
/* Drafts: create / update / publish                                                             */
/* -------------------------------------------------------------------------------------------- */

/** Initial form values for a new campaign. Later steps start type-correct but not necessarily valid. */
export function getDefaultFormValues(timezone: string): CampaignFormValues {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const currency = getConfig().currencies[0];
  return {
    name: "",
    slug: "",
    objective: "awareness",
    audience: { kind: "group", op: "and", children: [{ kind: "rule", field: "country", op: "in", value: [] }] },
    budget: { type: "daily", amount: currency.minAmount, currency: currency.code },
    schedule: { timezone, start: `${tomorrow}T09:00`, dayparting: [] },
  };
}

/** Body of create/update: `{ values, step? }`. Validated here because it arrives from outside. */
const draftInputSchema = z.object({
  values: z.unknown(),
  // The wizard step the user is on. Steps up to it must be valid; later steps aren't saved yet.
  step: z.enum(FORM_STEPS).default("budget"),
});

/**
 * Validates the steps up to `step` and merges *only their parsed data* into `base`.
 * Data of later steps is ignored and stays as it was on the server: we never store unvalidated input.
 */
function validateDraft(values: unknown, step: FormStep, base: CampaignFormValues): Result<CampaignFormValues> {
  const { steps } = buildCampaignSchemas(getConfig());
  const merged = { ...base };
  let fieldErrors: Record<string, string> = {};

  for (const key of FORM_STEPS.slice(0, FORM_STEPS.indexOf(step) + 1)) {
    const result = steps[key].safeParse(values);
    if (result.success) Object.assign(merged, result.data);
    else fieldErrors = { ...fieldErrors, ...toFieldErrors(result.error) };
  }

  if (Object.keys(fieldErrors).length > 0) return fail("VALIDATION_FAILED", "Some fields are invalid", fieldErrors);
  return ok(merged);
}

export function createCampaign(user: CurrentUser, input: unknown): Result<Campaign> {
  if (!can(user.role, "campaign:create")) return fail("FORBIDDEN", "Your role can't create campaigns");

  const parsedInput = draftInputSchema.safeParse(input);
  if (!parsedInput.success) return fail("VALIDATION_FAILED", "Invalid request");

  const timezone = getPreferences(user.id).defaultTimezone;
  const validated = validateDraft(parsedInput.data.values, parsedInput.data.step, getDefaultFormValues(timezone));
  if (!validated.ok) return validated;

  const now = new Date().toISOString();
  const created = insertCampaign({
    ...validated.data,
    id: crypto.randomUUID(),
    status: "draft",
    creatives: [],
    spend: 0,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ownerId: user.id,
  });
  if (created.ok) addActivity(created.data.id, user.id, "created the campaign");
  return created;
}

/**
 * Saves form values. `expectedVersion` is the version the client started from (optimistic
 * concurrency): if someone saved in between, the save is rejected with VERSION_CONFLICT.
 * Drafts may be saved step by step; other statuses must be fully valid.
 */
export function updateCampaign(
  user: CurrentUser,
  id: string,
  input: unknown,
  expectedVersion: number | undefined,
): Result<Campaign> {
  const current = getCampaign(id);
  if (!current) return fail("NOT_FOUND", "Campaign not found");
  if (current.status === "archived") return fail("INVALID_TRANSITION", "Archived campaigns can't be edited");
  if (!canEditCampaign(user.role, current.status)) return fail("FORBIDDEN", "Your role can't edit this campaign");
  if (expectedVersion === undefined) return fail("PRECONDITION_REQUIRED", "The current version is required");
  if (expectedVersion !== current.version) return fail("VERSION_CONFLICT", "Someone else changed this campaign");

  const parsedInput = draftInputSchema.safeParse(input);
  if (!parsedInput.success) return fail("VALIDATION_FAILED", "Invalid request");
  const step = current.status === "draft" ? parsedInput.data.step : "budget";

  const validated = validateDraft(parsedInput.data.values, step, current);
  if (!validated.ok) return validated;

  return saveCampaign(current, validated.data, user, "updated the campaign");
}

/** Final submit of the wizard: the whole form must be valid; the draft becomes scheduled. */
export function publishCampaign(user: CurrentUser, id: string, values: unknown, expectedVersion: number): Result<Campaign> {
  const current = getCampaign(id);
  if (!current) return fail("NOT_FOUND", "Campaign not found");
  if (current.status !== "draft") return fail("INVALID_TRANSITION", "Only drafts can be published");
  if (!canEditCampaign(user.role, current.status)) return fail("FORBIDDEN", "Your role can't edit this campaign");
  if (expectedVersion !== current.version) return fail("VERSION_CONFLICT", "Someone else changed this campaign");

  const result = buildCampaignSchemas(getConfig()).campaign.safeParse(values);
  if (!result.success) return fail("VALIDATION_FAILED", "Some fields are invalid", toFieldErrors(result.error));

  return saveCampaign(current, { ...result.data, status: "scheduled" }, user, "published the campaign");
}

/* -------------------------------------------------------------------------------------------- */
/* Status                                                                                        */
/* -------------------------------------------------------------------------------------------- */

const STATUS_ACTIVITY: Record<StatusAction, string> = {
  pause: "paused the campaign",
  resume: "resumed the campaign",
  archive: "archived the campaign",
};

export function changeStatus(user: CurrentUser, id: string, action: StatusAction): Result<Campaign> {
  if (!can(user.role, TRANSITIONS[action].permission)) return fail("FORBIDDEN", `Your role can't ${action} campaigns`);

  const current = getCampaign(id);
  if (!current) return fail("NOT_FOUND", "Campaign not found");
  if (!canTransition(current.status, action)) {
    return fail("INVALID_TRANSITION", `Can't ${action} a ${current.status} campaign`);
  }

  return saveCampaign(current, { status: nextStatus(current, action) }, user, STATUS_ACTIVITY[action]);
}

function nextStatus(campaign: Campaign, action: StatusAction): Campaign["status"] {
  if (action === "pause") return "paused";
  if (action === "archive") return "archived";
  // resume: back to running if the start time has passed, otherwise it's still scheduled
  const start = localDateTimeToInstant(campaign.schedule.start, campaign.schedule.timezone).getTime();
  return start <= Date.now() ? "running" : "scheduled";
}

export type BulkResult = { ok: string[]; failed: { id: string; reason: string }[] };

/** One request for many campaigns; each one succeeds or fails on its own (partial failure). */
export function bulkChangeStatus(
  user: CurrentUser,
  target: { ids: string[] } | { filter: ListFilters },
  action: StatusAction,
): Result<BulkResult> {
  if (!can(user.role, TRANSITIONS[action].permission)) return fail("FORBIDDEN", `Your role can't ${action} campaigns`);

  const db = getDb();
  let ids: string[];
  if ("ids" in target) {
    ids = target.ids;
  } else {
    const { conditions, params } = filtersToSql(target.filter);
    ids = (db.prepare(`SELECT c.id FROM campaigns c ${where(conditions)}`).all(...params) as { id: string }[]).map((row) => row.id);
  }

  const result: BulkResult = { ok: [], failed: [] };
  // One transaction: thousands of small writes are committed to disk once, not once per row.
  db.transaction(() => {
    for (const id of ids) {
      const outcome = changeStatus(user, id, action);
      if (outcome.ok) result.ok.push(id);
      else result.failed.push({ id, reason: outcome.error.message });
    }
  })();
  return ok(result);
}

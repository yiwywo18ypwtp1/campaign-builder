import "server-only";
import type { Campaign, CampaignStatus, Objective, Rule, RuleGroup } from "@/features/campaigns/types";

// Generates the 50 000 mock campaigns. A seeded PRNG makes the data the same on every run
// (dates are relative to "today", so statuses stay plausible).

export const SEED_SIZE = 50_000;

export const USERS = [
  { id: "u_me", name: "You" },
  { id: "u_anna", name: "Anna Kovalenko" },
  { id: "u_ben", name: "Ben Carter" },
  { id: "u_chen", name: "Chen Wei" },
  { id: "u_dana", name: "Dana Novak" },
  { id: "u_emil", name: "Emil Larsen" },
  { id: "u_fatima", name: "Fatima Zahra" },
  { id: "u_george", name: "George Miller" },
];

const DAY = 24 * 60 * 60 * 1000;

const TIMEZONES = ["UTC", "Europe/Kyiv", "Europe/Warsaw", "Europe/London", "America/New_York", "America/Los_Angeles"];
const CURRENCIES = [
  { code: "USD", min: 1_000 },
  { code: "EUR", min: 1_000 },
  { code: "GBP", min: 1_000 },
  { code: "UAH", min: 40_000 },
];
const OBJECTIVES: Objective[] = ["awareness", "conversion", "retention"];
const ADJECTIVES = ["Spring", "Summer", "Autumn", "Winter", "Flash", "Mega", "Weekend", "Holiday", "Loyalty", "Launch"];
const NOUNS = ["Sale", "Promo", "Drop", "Boost", "Push", "Week", "Deal", "Retarget", "Welcome", "Comeback"];
const COUNTRIES = ["UA", "PL", "DE", "US", "GB", "FR", "ES", "JP"];
const TAGS = ["vip", "newsletter", "churn-risk", "mobile", "trial"];

/** mulberry32: tiny deterministic PRNG returning numbers in [0, 1). */
export function createRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Date → "YYYY-MM-DDTHH:mm", reading UTC parts as the campaign's wall-clock time. */
function toWallTime(date: Date) {
  return date.toISOString().slice(0, 16);
}

export function seedCampaigns(ownerIds: string[]): Campaign[] {
  const random = createRandom(42);
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)];

  // Midnight today (UTC) as the reference point, rounded so all times are whole hours.
  const today = Math.floor(Date.now() / DAY) * DAY;
  const campaigns: Campaign[] = [];

  for (let i = 0; i < SEED_SIZE; i++) {
    const startMs = today + int(-180, 60) * DAY + int(6, 20) * 60 * 60 * 1000;
    const hasEnd = random() < 0.7;
    const endMs = startMs + int(7, 90) * DAY;
    const lifetime = hasEnd && random() < 0.5;
    const currency = pick(CURRENCIES);
    const amount = currency.min * int(1, 50);

    const status = pickStatus(random, startMs, hasEnd ? endMs : null);
    const started = status !== "draft" && status !== "scheduled" && startMs < Date.now();
    const daysRunning = started ? Math.max(1, Math.round((Math.min(Date.now(), hasEnd ? endMs : Date.now()) - startMs) / DAY)) : 0;
    // Created before the start (and never in the future); last updated somewhere between then and now.
    const createdMs = Math.min(Date.now() - DAY, startMs - int(1, 30) * DAY);
    const updatedMs = createdMs + random() * (Date.now() - createdMs);
    const name = `${pick(ADJECTIVES)} ${pick(NOUNS)} ${i + 1}`;

    campaigns.push({
      id: `cmp_${String(i + 1).padStart(5, "0")}`,
      slug: name.toLowerCase().replaceAll(" ", "-"),
      name,
      status,
      objective: pick(OBJECTIVES),
      audience: randomAudience(random, int, pick),
      budget: lifetime
        ? { type: "lifetime", amount: amount * 30, currency: currency.code, pacing: pick(["even", "asap"] as const) }
        : { type: "daily", amount, currency: currency.code },
      schedule: {
        timezone: pick(TIMEZONES),
        start: toWallTime(new Date(startMs)),
        end: hasEnd ? toWallTime(new Date(endMs)) : undefined,
        dayparting: [],
      },
      creatives: [],
      spend: started ? Math.round(amount * daysRunning * (0.3 + random() * 0.7)) : 0,
      version: 1,
      createdAt: new Date(createdMs).toISOString(),
      updatedAt: new Date(updatedMs).toISOString(),
      ownerId: pick(ownerIds),
    });
  }
  return campaigns;
}

function pickStatus(random: () => number, startMs: number, endMs: number | null): CampaignStatus {
  const now = Date.now();
  const roll = random();
  if (roll < 0.05) return "archived";
  if (startMs > now) return roll < 0.35 ? "draft" : "scheduled";
  if (endMs !== null && endMs < now) return "finished";
  return roll < 0.8 ? "running" : "paused";
}

function randomAudience(
  random: () => number,
  int: (min: number, max: number) => number,
  pick: <T>(items: readonly T[]) => T,
): RuleGroup {
  const randomRule = (): Rule => {
    switch (int(0, 4)) {
      case 0:
        return { kind: "rule", field: "country", op: pick(["in", "not_in"] as const), value: [pick(COUNTRIES), pick(COUNTRIES)].filter((c, i, all) => all.indexOf(c) === i) };
      case 1: {
        const from = int(18, 40);
        return { kind: "rule", field: "age", op: "between", value: [from, from + int(5, 25)] };
      }
      case 2:
        return { kind: "rule", field: "ltv", op: pick(["gt", "lt"] as const), value: int(10, 500), currency: "USD" };
      case 3:
        return { kind: "rule", field: "last_seen", op: "within_days", value: int(1, 90) };
      default:
        return { kind: "rule", field: "tag", op: pick(["has", "not_has"] as const), value: pick(TAGS) };
    }
  };

  const children: RuleGroup["children"] = Array.from({ length: int(1, 3) }, randomRule);
  if (random() < 0.3) {
    children.push({ kind: "group", op: "or", children: [randomRule(), randomRule()] });
  }
  return { kind: "group", op: pick(["and", "or"] as const), children };
}

const ACTIVITY_MESSAGES = ["updated the budget", "updated the audience", "changed the schedule", "renamed the campaign", "updated creatives"];

/** History of one seeded campaign: "created" plus a few edits; every 10th campaign gets a long log (to try "load more"). */
export function seedActivity(campaign: Campaign): { at: string; actorId: string; message: string }[] {
  const random = createRandom(Number(campaign.id.replace(/\D/g, "")) || 1);
  const createdAt = Date.parse(campaign.createdAt);
  const updatedAt = Date.parse(campaign.updatedAt);
  const count = campaign.id.endsWith("0") ? 30 + Math.floor(random() * 15) : Math.floor(random() * 4);

  const entries = [{ at: campaign.createdAt, actorId: campaign.ownerId, message: "created the campaign" }];
  for (let i = 0; i < count; i++) {
    entries.push({
      at: new Date(createdAt + random() * (updatedAt - createdAt)).toISOString(),
      actorId: campaign.ownerId,
      message: ACTIVITY_MESSAGES[Math.floor(random() * ACTIVITY_MESSAGES.length)],
    });
  }
  return entries;
}

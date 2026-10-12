import type { CampaignStatus } from "./types";

// Which form fields can't change any more. Shared: the server enforces it, the edit page passes the
// list to the wizard, which shows those fields read-only — the UI doesn't decide this on its own.

/**
 * Locked once a campaign has started. The timezone is locked with the start: the start is a wall
 * time in the campaign timezone, so changing the timezone would move the real start moment.
 */
const LOCKED_AFTER_START = ["slug", "objective", "schedule.timezone", "schedule.start"] as const;

export const LOCKED_HINT = "Can't be changed after the campaign has started.";

export type LockedField = (typeof LOCKED_AFTER_START)[number];

export function lockedFields(status: CampaignStatus): readonly LockedField[] {
  return status === "draft" || status === "scheduled" ? [] : LOCKED_AFTER_START;
}

/** Reads "schedule.start" from a value that came from outside (may be anything). */
export function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node !== null && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), value);
}

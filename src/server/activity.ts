import "server-only";
import { z } from "zod";
import type { ActivityItem, ActivityPage } from "@/features/campaigns/types";
import { fail, ok, type Result } from "@/lib/result";
import { decodeCursor, encodeCursor } from "./cursor";
import { getDb } from "./db";

export const ACTIVITY_PAGE_SIZE = 20;

const cursorSchema = z.object({ at: z.string(), id: z.number() });

export function addActivity(campaignId: string, actorId: string, message: string) {
  getDb()
    .prepare("INSERT INTO activity (campaign_id, at, actor_id, message) VALUES (?, ?, ?, ?)")
    .run(campaignId, new Date().toISOString(), actorId, message);
}

/** Newest first. Keyset on (at, id): the autoincrement id breaks ties between entries of the same millisecond. */
export function listActivity(campaignId: string, cursor?: string): Result<ActivityPage> {
  let position: z.infer<typeof cursorSchema> | null = null;
  if (cursor) {
    position = decodeCursor(cursor, cursorSchema);
    if (!position) return fail("INVALID_CURSOR", "Invalid cursor");
  }

  // One row more than the page size tells whether there is a next page.
  const rows = getDb()
    .prepare(
      `SELECT a.id, a.at, a.actor_id AS actorId, u.name AS actorName, a.message
       FROM activity a JOIN users u ON u.id = a.actor_id
       WHERE a.campaign_id = ? ${position ? "AND (a.at, a.id) < (?, ?)" : ""}
       ORDER BY a.at DESC, a.id DESC
       LIMIT ?`,
    )
    .all(campaignId, ...(position ? [position.at, position.id] : []), ACTIVITY_PAGE_SIZE + 1) as ActivityItem[];

  const items = rows.slice(0, ACTIVITY_PAGE_SIZE);
  const last = items.at(-1);
  return ok({
    items,
    nextCursor: rows.length > ACTIVITY_PAGE_SIZE && last ? encodeCursor({ at: last.at, id: last.id }) : null,
  });
}

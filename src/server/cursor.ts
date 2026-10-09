import "server-only";
import type { z } from "zod";

// Opaque keyset cursors: the position after the last returned item, base64url-encoded JSON.
// Shared by the campaign list and the activity log.

export function encodeCursor(position: unknown): string {
  return Buffer.from(JSON.stringify(position)).toString("base64url");
}

/** Returns `null` for anything that isn't a cursor we produced (`?cursor=garbage`). */
export function decodeCursor<T>(cursor: string, schema: z.ZodType<T>): T | null {
  try {
    const result = schema.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

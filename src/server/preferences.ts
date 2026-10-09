import "server-only";
import { DEFAULT_PREFERENCES, preferencesSchema, type Preferences } from "@/features/settings/preferences";
import { fail, ok, toFieldErrors, type Result } from "@/lib/result";
import { getConfig } from "./config";
import { getDb } from "./db";

export function getPreferences(userId: string): Preferences {
  const row = getDb().prepare("SELECT data FROM preferences WHERE user_id = ?").get(userId) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as Preferences) : DEFAULT_PREFERENCES;
}

export function savePreferences(userId: string, input: unknown): Result<Preferences> {
  const result = preferencesSchema.safeParse(input);
  if (!result.success) return fail("VALIDATION_FAILED", "Invalid preferences", toFieldErrors(result.error));
  if (!getConfig().timezones.includes(result.data.defaultTimezone)) {
    return fail("VALIDATION_FAILED", "Unsupported timezone", { defaultTimezone: "Unsupported timezone" });
  }

  getDb()
    .prepare(
      `INSERT INTO preferences (user_id, data) VALUES (?, ?)
       ON CONFLICT (user_id) DO UPDATE SET data = excluded.data`,
    )
    .run(userId, JSON.stringify(result.data));
  return ok(result.data);
}

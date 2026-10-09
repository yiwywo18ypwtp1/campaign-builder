"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { ROLES, type Role } from "@/lib/permissions";
import { fail, ok, type Result } from "@/lib/result";
import { simulateNetwork } from "@/server/mock";
import { savePreferences } from "@/server/preferences";
import { getCurrentUser, ROLE_COOKIE } from "@/server/session";
import type { Preferences } from "./preferences";

// Server Actions are public endpoints: arguments come from the browser and are validated here,
// even though TypeScript types them on the client.

export async function setRoleAction(role: Role): Promise<Result<Role>> {
  const failure = await simulateNetwork();
  if (failure) return { ok: false, error: failure };

  const parsed = z.enum(ROLES).safeParse(role);
  if (!parsed.success) return fail("VALIDATION_FAILED", "Unknown role");

  (await cookies()).set(ROLE_COOKIE, parsed.data, {
    path: "/",
    httpOnly: true, // only the server reads it
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  // Every page depends on the role: re-render the current one and drop cached ones.
  revalidatePath("/", "layout");
  return ok(parsed.data);
}

export async function savePreferencesAction(input: Preferences): Promise<Result<Preferences>> {
  const failure = await simulateNetwork();
  if (failure) return { ok: false, error: failure };

  const user = await getCurrentUser();
  const result = savePreferences(user.id, input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

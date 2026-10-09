import "server-only";
import { cookies } from "next/headers";
import { ROLES, type Role } from "@/lib/permissions";

// No real auth: there is one current user, and the role is taken from a cookie
// (switched on /settings). An unknown or missing value falls back to the default role.

export const ROLE_COOKIE = "role";
export const DEFAULT_ROLE: Role = "editor";
export const CURRENT_USER_ID = "u_me";

export type CurrentUser = { id: string; role: Role };

export async function getCurrentUser(): Promise<CurrentUser> {
  const value = (await cookies()).get(ROLE_COOKIE)?.value;
  const role = ROLES.find((r) => r === value) ?? DEFAULT_ROLE;
  return { id: CURRENT_USER_ID, role };
}

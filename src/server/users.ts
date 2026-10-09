import "server-only";
import { getDb } from "./db";

export type User = { id: string; name: string };

export function listUsers(): User[] {
  return getDb().prepare("SELECT id, name FROM users ORDER BY name").all() as User[];
}

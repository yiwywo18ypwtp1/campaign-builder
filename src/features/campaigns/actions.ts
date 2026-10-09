"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/lib/result";
import { bulkChangeStatus, changeStatus, type BulkResult } from "@/server/campaigns";
import { simulateNetwork } from "@/server/mock";
import { getCurrentUser } from "@/server/session";
import { STATUS_ACTIONS, type StatusAction } from "./status";
import type { Campaign } from "./types";

// Thin adapters: validate the arguments (they come from the browser), take the user from the
// cookie, call the server function. The rules (roles, transitions) live in `server/campaigns.ts`.

const actionSchema = z.enum(STATUS_ACTIONS);

export async function changeStatusAction(id: string, action: StatusAction): Promise<Result<Campaign>> {
  const failure = await simulateNetwork();
  if (failure) return { ok: false, error: failure };

  const parsed = z.object({ id: z.string(), action: actionSchema }).safeParse({ id, action });
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION_FAILED", message: "Invalid request" } };

  const result = changeStatus(await getCurrentUser(), parsed.data.id, parsed.data.action);
  if (result.ok) revalidatePath(`/campaigns/${id}`);
  return result;
}

export async function bulkStatusAction(ids: string[], action: StatusAction): Promise<Result<BulkResult>> {
  const failure = await simulateNetwork();
  if (failure) return { ok: false, error: failure };

  const parsed = z.object({ ids: z.array(z.string()).min(1).max(10_000), action: actionSchema }).safeParse({ ids, action });
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION_FAILED", message: "Invalid request" } };

  const result = bulkChangeStatus(await getCurrentUser(), { ids: parsed.data.ids }, parsed.data.action);
  if (result.ok) revalidatePath("/campaigns/[id]", "page");
  return result;
}

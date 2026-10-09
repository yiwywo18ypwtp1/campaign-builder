"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, type Result } from "@/lib/result";
import { bulkChangeStatus, changeStatus, createCampaign, submitCampaign, updateCampaign, type BulkResult } from "@/server/campaigns";
import { simulateNetwork } from "@/server/mock";
import { getCurrentUser } from "@/server/session";
import { FORM_STEPS } from "./schemas";
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

const submitSchema = z.object({ id: z.string().optional(), values: z.unknown(), version: z.number().int().optional() });

/** Final button of the wizard. `values` are validated in full on the server, not trusted. */
export async function submitCampaignAction(input: { id?: string; values: unknown; version?: number }): Promise<Result<Campaign>> {
  const failure = await simulateNetwork();
  if (failure) return { ok: false, error: failure };

  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION_FAILED", message: "Invalid request" } };

  const result = submitCampaign(await getCurrentUser(), parsed.data.id, parsed.data.values, parsed.data.version);
  if (result.ok) revalidatePath(`/campaigns/${result.data.id}`);
  return result;
}

const draftSchema = z.object({
  id: z.string().optional(),
  values: z.unknown(),
  step: z.enum(FORM_STEPS),
  version: z.int().optional(),
});

/** Autosave: creates the draft on the first save, then updates it. The server validates the steps up to `step`. */
export async function saveDraftAction(input: {
  id?: string;
  values: unknown;
  step: (typeof FORM_STEPS)[number];
  version?: number;
}): Promise<Result<{ id: string; version: number }>> {
  const failure = await simulateNetwork();
  if (failure) return { ok: false, error: failure };

  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION_FAILED", message: "Invalid request" } };

  const { id, values, step, version } = parsed.data;
  const user = await getCurrentUser();
  const result = id === undefined ? createCampaign(user, { values, step }) : updateCampaign(user, id, { values, step }, version);
  if (!result.ok) return result;
  // No revalidatePath: the draft isn't shown anywhere until the wizard is left, and the edit page reads fresh data.
  return ok({ id: result.data.id, version: result.data.version });
}

import type { NextRequest } from "next/server";
import { z } from "zod";
import { listFiltersSchema } from "@/features/campaigns/list-query";
import { STATUS_ACTIONS } from "@/features/campaigns/status";
import { bulkChangeStatus } from "@/server/campaigns";
import { errorResponse, readJson, resultResponse } from "@/server/http";
import { simulateNetwork } from "@/server/mock";
import { getCurrentUser } from "@/server/session";

const bodySchema = z.object({
  action: z.enum(STATUS_ACTIONS),
  target: z.union([z.object({ ids: z.array(z.string()).min(1) }), z.object({ filter: listFiltersSchema })]),
});

/** Body: `{ action, target: { ids } | { filter } }` → `{ ok: { id, status }[], failed: { id, reason }[] }`. */
export async function POST(request: NextRequest) {
  const failure = await simulateNetwork();
  if (failure) return errorResponse(failure);

  const body = bodySchema.safeParse(await readJson(request));
  if (!body.success) return errorResponse({ code: "VALIDATION_FAILED", message: "Expected { action, target: { ids } | { filter } }" });

  return resultResponse(bulkChangeStatus(await getCurrentUser(), body.data.target, body.data.action));
}

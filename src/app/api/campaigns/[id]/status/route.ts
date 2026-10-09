import type { NextRequest } from "next/server";
import { z } from "zod";
import { STATUS_ACTIONS } from "@/features/campaigns/status";
import { changeStatus } from "@/server/campaigns";
import { errorResponse, readJson, resultResponse } from "@/server/http";
import { simulateNetwork } from "@/server/mock";
import { getCurrentUser } from "@/server/session";

const bodySchema = z.object({ action: z.enum(STATUS_ACTIONS) });

export async function POST(request: NextRequest, ctx: RouteContext<"/api/campaigns/[id]/status">) {
  const failure = await simulateNetwork();
  if (failure) return errorResponse(failure);

  const body = bodySchema.safeParse(await readJson(request));
  if (!body.success) return errorResponse({ code: "VALIDATION_FAILED", message: "Expected { action: pause | resume | archive }" });

  return resultResponse(changeStatus(await getCurrentUser(), (await ctx.params).id, body.data.action));
}

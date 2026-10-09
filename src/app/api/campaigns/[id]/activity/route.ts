import type { NextRequest } from "next/server";
import { listActivity } from "@/server/activity";
import { getCampaign } from "@/server/campaigns";
import { errorResponse, resultResponse } from "@/server/http";
import { simulateNetwork } from "@/server/mock";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/campaigns/[id]/activity">) {
  const failure = await simulateNetwork();
  if (failure) return errorResponse(failure);

  const { id } = await ctx.params;
  if (!getCampaign(id)) return errorResponse({ code: "NOT_FOUND", message: "Campaign not found" });
  return resultResponse(listActivity(id, request.nextUrl.searchParams.get("cursor") ?? undefined));
}

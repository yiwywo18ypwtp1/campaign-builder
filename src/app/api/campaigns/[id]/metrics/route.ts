import type { NextRequest } from "next/server";
import { getCampaign } from "@/server/campaigns";
import { errorResponse } from "@/server/http";
import { getMetrics } from "@/server/metrics";
import { simulateNetwork } from "@/server/mock";

/** Polling endpoint for live metrics (Core). The SSE stream is Advanced. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/campaigns/[id]/metrics">) {
  const failure = await simulateNetwork();
  if (failure) return errorResponse(failure);

  const campaign = getCampaign((await ctx.params).id);
  if (!campaign) return errorResponse({ code: "NOT_FOUND", message: "Campaign not found" });
  return Response.json(getMetrics(campaign));
}

import type { NextRequest } from "next/server";
import { getCampaign, updateCampaign } from "@/server/campaigns";
import { errorResponse, invalidJsonResponse, readJson, resultResponse } from "@/server/http";
import { simulateNetwork } from "@/server/mock";
import { getCurrentUser } from "@/server/session";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/campaigns/[id]">) {
  const failure = await simulateNetwork();
  if (failure) return errorResponse(failure);

  const campaign = getCampaign((await ctx.params).id);
  if (!campaign) return errorResponse({ code: "NOT_FOUND", message: "Campaign not found" });
  return Response.json(campaign, { headers: { ETag: `"${campaign.version}"` } });
}

/** Saves form values. Body: `{ values, step? }`. The `If-Match` header with the version is required. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/campaigns/[id]">) {
  const failure = await simulateNetwork();
  if (failure) return errorResponse(failure);

  const body = await readJson(request);
  if (body === undefined) return invalidJsonResponse();

  const result = updateCampaign(
    await getCurrentUser(),
    (await ctx.params).id,
    body,
    parseIfMatch(request.headers.get("If-Match")),
  );
  return result.ok ? Response.json(result.data, { headers: { ETag: `"${result.data.version}"` } }) : resultResponse(result);
}

/** `"3"` or `W/"3"` → 3; anything else → undefined (treated as missing). */
function parseIfMatch(header: string | null): number | undefined {
  const match = header?.match(/^(?:W\/)?"?(\d+)"?$/);
  return match ? Number(match[1]) : undefined;
}

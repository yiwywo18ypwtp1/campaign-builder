import type { NextRequest } from "next/server";
import { listQuerySchema, searchParamsToListQuery } from "@/features/campaigns/list-query";
import { toFieldErrors } from "@/lib/result";
import { createCampaign, listCampaigns } from "@/server/campaigns";
import { errorResponse, invalidJsonResponse, readJson, resultResponse } from "@/server/http";
import { simulateNetwork } from "@/server/mock";
import { getCurrentUser } from "@/server/session";

export async function GET(request: NextRequest) {
  const failure = await simulateNetwork();
  if (failure) return errorResponse(failure);

  const query = listQuerySchema.safeParse(searchParamsToListQuery(request.nextUrl.searchParams));
  if (!query.success) {
    return errorResponse({ code: "VALIDATION_FAILED", message: "Invalid query", fieldErrors: toFieldErrors(query.error) });
  }
  return resultResponse(listCampaigns(query.data));
}

/** Creates a draft. Body: `{ values, step? }`. */
export async function POST(request: NextRequest) {
  const failure = await simulateNetwork();
  if (failure) return errorResponse(failure);

  const body = await readJson(request);
  if (body === undefined) return invalidJsonResponse();

  const result = createCampaign(await getCurrentUser(), body);
  return resultResponse(result, { status: 201 });
}

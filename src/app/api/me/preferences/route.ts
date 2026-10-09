import type { NextRequest } from "next/server";
import { errorResponse, invalidJsonResponse, readJson, resultResponse } from "@/server/http";
import { simulateNetwork } from "@/server/mock";
import { getPreferences, savePreferences } from "@/server/preferences";
import { getCurrentUser } from "@/server/session";

export async function GET() {
  const failure = await simulateNetwork();
  if (failure) return errorResponse(failure);

  return Response.json(getPreferences((await getCurrentUser()).id));
}

/** Replaces the preferences. Allowed for every role: they are personal settings, not campaign data. */
export async function PUT(request: NextRequest) {
  const failure = await simulateNetwork();
  if (failure) return errorResponse(failure);

  const body = await readJson(request);
  if (body === undefined) return invalidJsonResponse();
  return resultResponse(savePreferences((await getCurrentUser()).id, body));
}

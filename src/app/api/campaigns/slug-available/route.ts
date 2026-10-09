import type { NextRequest } from "next/server";
import { isSlugAvailable } from "@/server/campaigns";
import { errorResponse } from "@/server/http";
import { simulateNetwork } from "@/server/mock";

/** `?slug=…&excludeId=…` → `{ available: boolean }`. `excludeId` lets an edited campaign keep its own slug. */
export async function GET(request: NextRequest) {
  const failure = await simulateNetwork({ minMs: 300, maxMs: 800 });
  if (failure) return errorResponse(failure);

  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug) return errorResponse({ code: "VALIDATION_FAILED", message: "The slug parameter is required" });

  const excludeId = request.nextUrl.searchParams.get("excludeId") ?? undefined;
  return Response.json({ available: isSlugAvailable(slug, excludeId) });
}

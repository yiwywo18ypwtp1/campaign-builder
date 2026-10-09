import type { NextRequest } from "next/server";
import { ruleGroupSchema } from "@/features/campaigns/schemas";
import { toFieldErrors } from "@/lib/result";
import { estimateAudience } from "@/server/audience";
import { errorResponse, readJson } from "@/server/http";
import { simulateNetwork } from "@/server/mock";

/** Body: a `RuleGroup` → `{ count }`. */
export async function POST(request: NextRequest) {
  const failure = await simulateNetwork({ minMs: 200, maxMs: 1500 });
  if (failure) return errorResponse(failure);

  const group = ruleGroupSchema.safeParse(await readJson(request));
  if (!group.success) {
    return errorResponse({ code: "VALIDATION_FAILED", message: "Invalid rule tree", fieldErrors: toFieldErrors(group.error) });
  }
  return Response.json({ count: estimateAudience(group.data) });
}

import { getConfig } from "@/server/config";
import { errorResponse } from "@/server/http";
import { simulateNetwork } from "@/server/mock";

export async function GET() {
  const failure = await simulateNetwork();
  if (failure) return errorResponse(failure);

  return Response.json(getConfig());
}

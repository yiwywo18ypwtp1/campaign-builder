import "server-only";
import type { ApiErrorBody, ErrorCode, Result } from "@/lib/result";

// Turns `Result`s into HTTP responses with the single error format `{ error: { code, message, fieldErrors? } }`.

const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  INVALID_CURSOR: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SLUG_TAKEN: 409,
  VERSION_CONFLICT: 409,
  INVALID_TRANSITION: 422,
  PRECONDITION_REQUIRED: 428,
  INTERNAL: 500,
};

export function errorResponse(error: ApiErrorBody): Response {
  return Response.json({ error }, { status: HTTP_STATUS[error.code] });
}

export function resultResponse<T>(result: Result<T>, init?: ResponseInit): Response {
  return result.ok ? Response.json(result.data, init) : errorResponse(result.error);
}

/** Request body as JSON, or `undefined` if it isn't valid JSON. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function invalidJsonResponse(): Response {
  return errorResponse({ code: "VALIDATION_FAILED", message: "Request body must be valid JSON" });
}

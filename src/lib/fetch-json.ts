import type { ApiErrorBody } from "./result";

/** A non-2xx response of our API, with the parsed `{ error }` body. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
  }
}

/**
 * GET/POST JSON from our Route Handlers. Throws `ApiError` for API errors; network errors and
 * aborts (`AbortError`) are rethrown as they are, so callers can tell them apart.
 */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, body?.error ?? { code: "INTERNAL", message: `Request failed (${response.status})` });
  }
  return body as T;
}

import type { z } from "zod";

// One error format everywhere: API responses are `{ error: ApiErrorBody }`,
// Server Actions return `Result<T>` with the same body.

export type ErrorCode =
  | "VALIDATION_FAILED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "SLUG_TAKEN"
  | "VERSION_CONFLICT"
  | "PRECONDITION_REQUIRED"
  | "INVALID_TRANSITION"
  | "INVALID_CURSOR"
  | "INTERNAL";

export type ApiErrorBody = {
  code: ErrorCode;
  message: string;
  /** Keys are RHF field paths: "audience.children.2.children.0.value". */
  fieldErrors?: Record<string, string>;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiErrorBody };

/** Zod issues → `{ "dotted.path": "first message" }`, ready for RHF `setError(path, …)`. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.map(String).join(".");
    fieldErrors[path] ??= issue.message;
  }
  return fieldErrors;
}

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail(code: ErrorCode, message: string, fieldErrors?: Record<string, string>): Result<never> {
  return { ok: false, error: fieldErrors ? { code, message, fieldErrors } : { code, message } };
}

import { ZodError } from "zod";
import { AdminHttpError, adminErrorResponse } from "./requestSecurity";

// Only these intentional domain errors may cross the HTTP boundary. Storage,
// transport, and unexpected exceptions can contain private paths or responses.
const validationCodes = new Set([
  "effective-date-outside-live-window", "level-scope-invalid", "scope-invalid",
  "target-invalid", "school-level-mismatch", "duration-time-invalid",
  "duration-time-unexpected", "proof-url-invalid", "public-note-invalid",
  "idempotency-invalid", "record-id-invalid",
  ...["reason", "evidence", "duration"].flatMap((field) => [
    `${field}-required`, `${field}-invalid`, `${field}-preset-invalid`, `${field}-custom-not-allowed`,
  ]),
]);
const conflictCodes = new Set([
  "confirmation-invalid", "idempotency-conflict", "duplicate-publication",
  "stale-revision", "invalid-state-transition", "undo-window-expired",
]);

export function suspensionErrorResponse(error: unknown): Response {
  if (error instanceof ZodError) return adminErrorResponse(new AdminHttpError(422, "VALIDATION_FAILED"));
  if (error instanceof Error) {
    const code = error.message;
    if (validationCodes.has(code)) return adminErrorResponse(new AdminHttpError(422, code));
    if (conflictCodes.has(code)) return adminErrorResponse(new AdminHttpError(409, code));
    if (code === "record-not-found") return adminErrorResponse(new AdminHttpError(404, code));
    if (code === "unauthenticated" || code === "session-invalid") return adminErrorResponse(new AdminHttpError(401, "UNAUTHENTICATED"));
    if (code === "forbidden") return adminErrorResponse(new AdminHttpError(403, "FORBIDDEN"));
    if (code === "ADMIN_STORAGE_UNAVAILABLE") return adminErrorResponse(error);
  }
  // Keep the detailed exception on the server side while returning only the
  // generic response below. Storage adapters already redact remote payloads.
  console.error("Admin suspension mutation failed.", error);
  return adminErrorResponse(error);
}

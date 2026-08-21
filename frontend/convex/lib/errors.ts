/**
 * Safe domain errors for Convex functions.
 *
 * Every error exposes a stable code and a user-safe message.
 * Internal details are never leaked to clients.
 */
import { ConvexError } from "convex/values";

/**
 * Union of safe, user-visible error codes.
 */
export type DomainErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "EXPIRED";

/**
 * Shape of a safe domain error payload.
 */
export type DomainError = {
  /** Stable code for client branching. */
  code: DomainErrorCode;
  /** Safe message safe to show to users or logs. */
  message: string;
};

/**
 * Throws a safe domain error with the given code and message.
 */
export function throwDomainError(code: DomainErrorCode, message: string): never {
  throw new ConvexError({ code, message } satisfies DomainError);
}

/**
 * Throws UNAUTHORIZED when there is no authenticated identity.
 */
export function throwUnauthorized(message = "Authentication required."): never {
  throwDomainError("UNAUTHORIZED", message);
}

/**
 * Throws FORBIDDEN when the actor lacks permission for the organization.
 */
export function throwForbidden(message = "You do not have permission for this organization."): never {
  throwDomainError("FORBIDDEN", message);
}

/**
 * Throws NOT_FOUND without revealing whether the resource exists cross-tenant.
 */
export function throwNotFound(message = "Resource not found."): never {
  throwDomainError("NOT_FOUND", message);
}

/**
 * Throws VALIDATION_FAILED for invalid user input.
 */
export function throwValidation(message: string): never {
  throwDomainError("VALIDATION_FAILED", message);
}

/**
 * Throws CONFLICT for duplicate or concurrent revision errors.
 */
export function throwConflict(message: string): never {
  throwDomainError("CONFLICT", message);
}

/**
 * Throws RATE_LIMITED when a quota is exceeded.
 */
export function throwRateLimited(message = "Too many requests. Try again later."): never {
  throwDomainError("RATE_LIMITED", message);
}

/**
 * Throws UNAVAILABLE for transient dependency failures.
 */
export function throwUnavailable(message = "Service temporarily unavailable."): never {
  throwDomainError("UNAVAILABLE", message);
}

/**
 * Returns true if the value is a safe domain ConvexError.
 */
export function isDomainError(err: unknown): err is ConvexError<DomainError> {
  return err instanceof ConvexError && typeof (err.data as DomainError)?.code === "string";
}

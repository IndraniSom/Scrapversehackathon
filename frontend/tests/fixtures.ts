import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const examplesDirectory = resolve(process.cwd(), "../contracts/examples");

/** Reads a frozen contract example without asserting an unchecked shape. */
export function readFixture(name: string): unknown {
  const parsed: unknown = JSON.parse(readFileSync(resolve(examplesDirectory, name), "utf8"));
  return parsed;
}

/** Returns a JSON-compatible deep copy for isolated mutation tests. */
export function cloneFixture(value: unknown): unknown {
  return structuredClone(value);
}

/** Creates a complete JSON response for a network-boundary test. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Narrows an unknown JSON value to a mutable object for negative tests. */
export function objectValue(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError("Expected fixture object");
  return value;
}

/** Identifies a non-null, non-array JSON object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads and narrows a named object property from a fixture. */
export function objectProperty(value: unknown, key: string): Record<string, unknown> {
  return objectValue(objectValue(value)[key]);
}

/** Reads and narrows a named array property from a fixture object. */
export function arrayProperty(value: unknown, key: string): unknown[] {
  const candidate = objectValue(value)[key];
  if (!Array.isArray(candidate)) throw new TypeError(`Expected fixture array at ${key}`);
  return candidate;
}

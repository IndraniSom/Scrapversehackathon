import { afterEach, describe, expect, test, vi } from "vitest";

import { jsonResponse, readFixture } from "./fixtures";

vi.mock("next/dist/compiled/server-only", () => ({}));

const opportunities = readFixture("opportunities.manual.json");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("server API origin configuration", () => {
  test.each([
    "https://localhost:8000",
    "ftp://localhost:8000",
    "http://example.com:8000",
    "http://169.254.169.254:80",
    "http://10.0.0.1:8000",
    "http://127.0.0.2:8000",
    "http://[::1]:8000",
    "http://user:secret@localhost:8000",
    "http://localhost:8000/api",
    "http://localhost:8000?target=internal",
    "http://localhost:8000#proof",
    "http://localhost",
    "http://localhost:0",
    "http://localhost:65536",
  ])("rejects unsafe BIDRADAR_API_BASE_URL %s before fetching", async (configuredUrl) => {
    const fetcher = vi.fn();
    vi.stubEnv("BIDRADAR_API_BASE_URL", configuredUrl);
    vi.stubGlobal("fetch", fetcher);

    await expect(import("../lib/api")).rejects.toThrow(/BIDRADAR_API_BASE_URL/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  test.each([
    "http://localhost:1",
    "http://localhost:8000",
    "http://127.0.0.1:9000",
    "http://127.0.0.1:65535",
  ])("accepts explicit loopback origin %s", async (configuredUrl) => {
    const requests: string[] = [];
    const fetcher: typeof fetch = vi.fn(async (input) => {
      requests.push(input.toString());
      return jsonResponse(opportunities);
    });
    vi.stubEnv("BIDRADAR_API_BASE_URL", configuredUrl);
    const { getOpportunities } = await import("../lib/api");

    await expect(getOpportunities({ fetcher })).resolves.toMatchObject({ data: { total: 7 } });
    expect(requests).toEqual([`${configuredUrl}/api/v1/opportunities`]);
  });
});

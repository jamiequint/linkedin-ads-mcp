#!/usr/bin/env node
/**
 * Unit tests for LinkedInApiClient.
 * Mocks global.fetch to test retries, rate limits, param construction, and
 * higher-level batching logic without real HTTP calls.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import { LinkedInApiClient } from "../dist/linkedin-client.js";
import { LinkedInApiError } from "../dist/errors.js";

const TEST_CONFIG = {
  LINKEDIN_ACCESS_TOKEN: "test-token",
  LINKEDIN_API_VERSION: "202610",
  LINKEDIN_ENABLE_WRITES: false,
  MCP_SERVER_NAME: "test-server",
  MCP_SERVER_VERSION: "1.0.0",
};

let originalFetch;
let fetchCalls = [];
let fetchResponseQueue = [];

function mockFetch(responseOrQueue) {
  if (Array.isArray(responseOrQueue)) {
    fetchResponseQueue = [...responseOrQueue];
  } else {
    fetchResponseQueue = [responseOrQueue];
  }
  fetchCalls = [];
  global.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    const res = fetchResponseQueue.shift() || fetchResponseQueue[fetchResponseQueue.length - 1] || responseOrQueue;
    return res;
  };
}

function makeResponse({ status = 200, statusText = "OK", body = {}, headers = {} }) {
  const h = new Map(Object.entries(headers));
  return {
    status,
    statusText,
    ok: status >= 200 && status < 300,
    headers: {
      get: (key) => h.get(key.toLowerCase()) ?? null,
    },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

describe("LinkedInApiClient — request core", () => {
  before(() => {
    originalFetch = global.fetch;
  });

  after(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    fetchCalls = [];
    fetchResponseQueue = [];
  });

  it("performs a successful GET request", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(makeResponse({ body: { elements: [{ id: 1 }] } }));

    const result = await client.get("/adAccounts");
    assert.strictEqual(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].url.includes("/adAccounts"));
    assert.strictEqual(fetchCalls[0].init.method, "GET");
    assert.ok(fetchCalls[0].init.headers.Authorization.includes("test-token"));
    assert.deepStrictEqual(result, { elements: [{ id: 1 }] });
  });

  it("performs a successful POST request with body", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(makeResponse({ status: 201, body: { id: "urn:li:campaign:123" } }));

    const result = await client.post("/adAccounts/1/adCampaigns", { name: "Test" });
    assert.strictEqual(fetchCalls.length, 1);
    assert.strictEqual(fetchCalls[0].init.method, "POST");
    assert.deepStrictEqual(JSON.parse(fetchCalls[0].init.body), { name: "Test" });
    assert.strictEqual(fetchCalls[0].init.headers["Content-Type"], "application/json");
  });

  it("builds query parameters correctly", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(makeResponse({ body: {} }));

    await client.get("/adAccounts", {
      q: "search",
      status: ["ACTIVE", "DRAFT"],
      count: 50,
    });

    const url = fetchCalls[0].url;
    assert.ok(url.includes("q=search"));
    assert.ok(url.includes("status=List(ACTIVE,DRAFT)"));
    assert.ok(url.includes("count=50"));
  });

  it("handles 204 empty responses", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(makeResponse({ status: 204, body: {} }));
    await client.delete("/adAccounts/1/adCampaigns/2");
    assert.strictEqual(fetchCalls.length, 1);
    assert.strictEqual(fetchCalls[0].init.method, "DELETE");
  });

  it("extracts x-restli-id from 201 responses", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(makeResponse({ status: 201, headers: { "x-restli-id": "urn:li:campaign:99" } }));
    const result = await client.post("/adAccounts/1/adCampaigns", {});
    assert.deepStrictEqual(result, { id: "urn:li:campaign:99" });
  });

  it("retries on 500 errors with exponential backoff", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch([
      makeResponse({ status: 500, statusText: "Internal Server Error", body: { error: "boom" } }),
      makeResponse({ status: 500, statusText: "Internal Server Error", body: { error: "boom" } }),
      makeResponse({ body: { ok: true } }),
    ]);

    const result = await client.get("/test");
    assert.strictEqual(fetchCalls.length, 3);
    assert.deepStrictEqual(result, { ok: true });
  });

  it("does not retry a POST after a 500 response", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch([
      makeResponse({ status: 500, statusText: "Internal Server Error" }),
      makeResponse({ status: 201, body: { id: "duplicate" } }),
    ]);

    await assert.rejects(() => client.post("/dmpSegments", { name: "Audience" }), LinkedInApiError);
    assert.strictEqual(fetchCalls.length, 1);
  });

  it("does not retry a POST after a network failure with an unknown outcome", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      throw new TypeError("socket closed after upload");
    };

    await assert.rejects(() => client.post("/dmpSegments/123/users", { elements: [] }), /socket closed/);
    assert.strictEqual(calls, 1);
  });

  it("does not retry a rate-limited POST", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch([
      makeResponse({ status: 429, statusText: "Too Many Requests", headers: { "retry-after": "30" } }),
      makeResponse({ status: 201 }),
    ]);

    await assert.rejects(() => client.post("/dmpSegments", { name: "Audience" }), LinkedInApiError);
    assert.strictEqual(fetchCalls.length, 1);
  });

  it("throws LinkedInApiError after exhausting retries", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch([
      makeResponse({ status: 500, statusText: "Error", body: { msg: "fail" } }),
      makeResponse({ status: 500, statusText: "Error", body: { msg: "fail" } }),
      makeResponse({ status: 500, statusText: "Error", body: { msg: "fail" } }),
    ]);

    await assert.rejects(
      async () => client.get("/test"),
      (err) => {
        assert.ok(err instanceof LinkedInApiError);
        assert.strictEqual(err.statusCode, 500);
        assert.ok(err.message.includes("LinkedIn API error"));
        return true;
      }
    );
    assert.strictEqual(fetchCalls.length, 3);
  });

  it("does not retry 401 auth errors", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(makeResponse({ status: 401, statusText: "Unauthorized", body: {} }));

    await assert.rejects(
      async () => client.get("/test"),
      (err) => {
        assert.ok(err instanceof LinkedInApiError);
        assert.strictEqual(err.statusCode, 401);
        return true;
      }
    );
    assert.strictEqual(fetchCalls.length, 1);
  });

  it("does not retry 403 forbidden errors", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(makeResponse({ status: 403, statusText: "Forbidden", body: {} }));

    await assert.rejects(
      async () => client.get("/test"),
      (err) => {
        assert.ok(err instanceof LinkedInApiError);
        assert.strictEqual(err.statusCode, 403);
        return true;
      }
    );
    assert.strictEqual(fetchCalls.length, 1);
  });

  it("reads Retry-After header on 429 and uses it", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch([
      makeResponse({ status: 429, statusText: "Too Many Requests", headers: { "retry-after": "2" } }),
      makeResponse({ body: { ok: true } }),
    ]);

    const start = Date.now();
    const result = await client.get("/test");
    const elapsed = Date.now() - start;

    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(fetchCalls.length, 2);
    assert.ok(elapsed >= 1500, `Expected at least 1500ms delay, got ${elapsed}ms`);
  });

  it("falls back to exponential backoff on 429 without Retry-After", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch([makeResponse({ status: 429, statusText: "Too Many Requests" }), makeResponse({ body: { ok: true } })]);

    const start = Date.now();
    await client.get("/test");
    const elapsed = Date.now() - start;

    assert.strictEqual(fetchCalls.length, 2);
    assert.ok(elapsed >= 500, `Expected at least 500ms delay, got ${elapsed}ms`);
  });

  it("includes X-RestLi-Method header for RestLi operations", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(makeResponse({ body: {} }));
    await client.post("/test", { patch: { $set: {} } }, { restliMethod: "PARTIAL_UPDATE" });
    assert.strictEqual(fetchCalls[0].init.headers["X-RestLi-Method"], "PARTIAL_UPDATE");
  });

  it("serializes nested Rest.li search criteria without encoding structure", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(makeResponse({ body: { elements: [] } }));

    await client.listCampaigns("123", {
      campaignGroupIds: ["456"],
      status: ["ACTIVE", "PAUSED"],
    });

    const url = fetchCalls[0].url;
    assert.ok(
      url.includes(
        "search=(campaignGroup:(values:List(urn%3Ali%3AsponsoredCampaignGroup%3A456)),status:(values:List(ACTIVE,PAUSED)))"
      ),
      url
    );
  });

  it("preserves Rest.li structure while encoding URNs in complex parameters", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(makeResponse({ body: { elements: [] } }));

    await client.listLeadForms("123");

    assert.ok(
      fetchCalls[0].url.includes("owner=(sponsoredAccount:urn%3Ali%3AsponsoredAccount%3A123)"),
      fetchCalls[0].url
    );
  });

  it("fully URL-encodes URN resource keys in paths", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(makeResponse({ body: { id: "urn:li:sponsoredCreative:9" } }));

    await client.getCreative("123", "urn:li:sponsoredCreative:9");

    assert.ok(fetchCalls[0].url.includes("/creatives/urn%3Ali%3AsponsoredCreative%3A9"));
    assert.ok(fetchCalls[0].url.includes("fields="));
  });

  it("extracts requestId from response headers in errors", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch([
      makeResponse({
        status: 400,
        statusText: "Bad Request",
        body: { error: "invalid" },
        headers: { "x-linkedin-request-id": "req-abc-123" },
      }),
      makeResponse({
        status: 400,
        statusText: "Bad Request",
        body: { error: "invalid" },
        headers: { "x-linkedin-request-id": "req-abc-123" },
      }),
      makeResponse({
        status: 400,
        statusText: "Bad Request",
        body: { error: "invalid" },
        headers: { "x-linkedin-request-id": "req-abc-123" },
      }),
    ]);

    await assert.rejects(
      async () => client.get("/test"),
      (err) => {
        assert.ok(err instanceof LinkedInApiError);
        assert.strictEqual(err.requestId, "req-abc-123");
        return true;
      }
    );
  });
});

describe("LinkedInApiClient — date helpers", () => {
  it("formats a date range correctly", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    const result = client.formatDateRange("2024-01-15", "2024-03-20");
    assert.ok(result.includes("start:(year:2024,month:1,day:15)"));
    assert.ok(result.includes("end:(year:2024,month:3,day:20)"));
  });

  it("defaults end date to today when omitted", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    const result = client.formatDateRange("2024-01-01");
    assert.ok(result.includes("start:(year:2024,month:1,day:1)"));
    assert.ok(result.includes("end:(year:"));
  });
});

describe("LinkedInApiClient — account filtering", () => {
  before(() => {
    originalFetch = global.fetch;
  });
  after(() => {
    global.fetch = originalFetch;
  });
  beforeEach(() => {
    fetchCalls = [];
    fetchResponseQueue = [];
  });

  it("filters out test accounts by default", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(
      makeResponse({
        body: {
          elements: [
            { id: "1", test: false },
            { id: "2", test: true },
            { id: "3", test: false },
          ],
        },
      })
    );

    const accounts = await client.listAdAccounts();
    assert.strictEqual(accounts.length, 2);
    assert.ok(accounts.every((a) => !a.test));
  });

  it("includes test accounts when requested", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(
      makeResponse({
        body: {
          elements: [
            { id: "1", test: false },
            { id: "2", test: true },
          ],
        },
      })
    );

    const accounts = await client.listAdAccounts({ includeTest: true });
    assert.strictEqual(accounts.length, 2);
  });
});

describe("LinkedInApiClient — batching", () => {
  before(() => {
    originalFetch = global.fetch;
  });
  after(() => {
    global.fetch = originalFetch;
  });
  beforeEach(() => {
    fetchCalls = [];
    fetchResponseQueue = [];
  });

  it("getCampaignsByIds fetches in batches of 10", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    const responses = Array.from({ length: 12 }, (_, i) =>
      makeResponse({ body: { id: `urn:li:sponsoredCampaign:${i + 1}`, name: `Campaign ${i + 1}` } })
    );
    mockFetch(responses);

    const ids = Array.from({ length: 12 }, (_, i) => String(i + 1));
    const map = await client.getCampaignsByIds("123", ids);

    assert.strictEqual(map.size, 12);
    assert.strictEqual(fetchCalls.length, 12); // 12 individual GETs (batchSize=10 but Promise.all within batch)
    assert.ok(fetchCalls[0].url.includes("/adAccounts/123/adCampaigns/1"));
  });

  it("getCreativesByIds batches and extracts IDs via regex", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(
      makeResponse({
        body: {
          elements: [
            { id: "urn:li:sponsoredCreative:101", name: "Creative A" },
            { id: "urn:li:sponsoredCreative:102", name: "Creative B" },
          ],
        },
      })
    );

    const map = await client.getCreativesByIds("123", ["101", "102"]);
    assert.strictEqual(map.size, 2);
    assert.strictEqual(map.get("101").name, "Creative A");
    assert.strictEqual(map.get("102").name, "Creative B");
  });

  it("getCampaign returns null on 404", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(makeResponse({ status: 404, statusText: "Not Found", body: {} }));
    const result = await client.getCampaign("123", "999");
    assert.strictEqual(result, null);
  });

  it("getCreative returns null on 404", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(makeResponse({ status: 404, statusText: "Not Found", body: {} }));
    const result = await client.getCreative("123", "999");
    assert.strictEqual(result, null);
  });
});

describe("LinkedInApiClient — draft-aware deletes", () => {
  before(() => {
    originalFetch = global.fetch;
  });
  after(() => {
    global.fetch = originalFetch;
  });
  beforeEach(() => {
    fetchCalls = [];
    fetchResponseQueue = [];
  });

  it("deletes draft campaign immediately", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(makeResponse({ status: 204, body: {} }));
    await client.deleteCampaign("123", "456", true);
    assert.strictEqual(fetchCalls.length, 1);
    assert.strictEqual(fetchCalls[0].init.method, "DELETE");
  });

  it("sets live campaign to PENDING_DELETION", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(makeResponse({ body: {} }));
    await client.deleteCampaign("123", "456", false);
    assert.strictEqual(fetchCalls.length, 1);
    assert.strictEqual(fetchCalls[0].init.method, "POST");
    assert.deepStrictEqual(JSON.parse(fetchCalls[0].init.body), { patch: { $set: { status: "PENDING_DELETION" } } });
    assert.strictEqual(fetchCalls[0].init.headers["X-RestLi-Method"], "PARTIAL_UPDATE");
  });

  it("deletes draft campaign group immediately", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(makeResponse({ status: 204, body: {} }));
    await client.deleteCampaignGroup("123", "456", true);
    assert.strictEqual(fetchCalls[0].init.method, "DELETE");
  });

  it("sets live campaign group to PENDING_DELETION", async () => {
    const client = new LinkedInApiClient(TEST_CONFIG);
    mockFetch(makeResponse({ body: {} }));
    await client.deleteCampaignGroup("123", "456", false);
    assert.strictEqual(fetchCalls[0].init.method, "POST");
    assert.deepStrictEqual(JSON.parse(fetchCalls[0].init.body), { patch: { $set: { status: "PENDING_DELETION" } } });
  });
});

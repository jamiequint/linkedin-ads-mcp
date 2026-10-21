#!/usr/bin/env node

import { describe, it } from "node:test";
import assert from "node:assert";
import { AudienceTools } from "../dist/tools/audiences.js";
import { ToolRegistry } from "../dist/tool-registry.js";

const MUTATING_AUDIENCE_TOOLS = [
  "linkedin_ads_create_custom_audience",
  "linkedin_ads_update_custom_audience",
  "linkedin_ads_delete_custom_audience",
  "linkedin_ads_mutate_custom_audience_users",
  "linkedin_ads_mutate_custom_audience_companies",
];

describe("AudienceTools write gate", () => {
  it("exposes only the read tool in default read-only mode", async () => {
    let called = false;
    const apiClient = {
      createSavedAudience: async () => {
        called = true;
        return { id: "1" };
      },
    };
    const registry = new ToolRegistry();
    new AudienceTools(apiClient).registerTools(registry);

    assert.deepStrictEqual(
      registry.getToolList().map((tool) => tool.name),
      ["linkedin_ads_get_custom_audience"]
    );
    const denied = await registry.getHandler("linkedin_ads_create_custom_audience")({
      accountId: "123",
      name: "Test",
      type: "USER",
    });
    assert.strictEqual(denied.isError, true);
    assert.match(denied.content[0].text, /WRITES_DISABLED/);
    assert.strictEqual(called, false);
  });

  it("exposes every audience mutation only in explicit write mode", () => {
    const registry = new ToolRegistry(true);
    new AudienceTools({}).registerTools(registry);
    const names = registry.getToolList().map((tool) => tool.name);

    for (const name of MUTATING_AUDIENCE_TOOLS) {
      assert.ok(names.includes(name), `${name} should be visible`);
    }
  });
});

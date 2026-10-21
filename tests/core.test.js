#!/usr/bin/env node
/**
 * Unit tests for config, errors, and tool-registry.
 * Uses Node.js built-in test runner (node:test).
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { loadConfig } from "../dist/config.js";
import { LinkedInApiError, McpToolError } from "../dist/errors.js";
import { ToolRegistry } from "../dist/tool-registry.js";

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws when LINKEDIN_ACCESS_TOKEN is missing", () => {
    delete process.env.LINKEDIN_ACCESS_TOKEN;
    assert.throws(() => loadConfig(), /Missing required environment variable: LINKEDIN_ACCESS_TOKEN/);
  });

  it("returns config with defaults when only token is set", () => {
    process.env.LINKEDIN_ACCESS_TOKEN = "test_token_123";
    delete process.env.LINKEDIN_API_VERSION;
    delete process.env.LINKEDIN_ENABLE_WRITES;
    delete process.env.MCP_SERVER_NAME;
    delete process.env.MCP_SERVER_VERSION;

    const config = loadConfig();
    assert.strictEqual(config.LINKEDIN_ACCESS_TOKEN, "test_token_123");
    assert.strictEqual(config.LINKEDIN_API_VERSION, "202610");
    assert.strictEqual(config.LINKEDIN_ENABLE_WRITES, false);
    assert.strictEqual(config.MCP_SERVER_NAME, "linkedin-ads-mcp");
    assert.strictEqual(config.MCP_SERVER_VERSION, "1.0.0");
  });

  it("overrides defaults with environment variables", () => {
    process.env.LINKEDIN_ACCESS_TOKEN = "token";
    process.env.LINKEDIN_API_VERSION = "202604";
    process.env.LINKEDIN_ENABLE_WRITES = "true";
    process.env.MCP_SERVER_NAME = "custom-name";
    process.env.MCP_SERVER_VERSION = "2.0.0";

    const config = loadConfig();
    assert.strictEqual(config.LINKEDIN_API_VERSION, "202604");
    assert.strictEqual(config.LINKEDIN_ENABLE_WRITES, true);
    assert.strictEqual(config.MCP_SERVER_NAME, "custom-name");
    assert.strictEqual(config.MCP_SERVER_VERSION, "2.0.0");
  });
});

describe("LinkedInApiError", () => {
  it("stores all constructor properties", () => {
    const err = new LinkedInApiError(429, "Rate limited", { detail: "too many requests" }, "req-123", 60);
    assert.strictEqual(err.name, "LinkedInApiError");
    assert.strictEqual(err.statusCode, 429);
    assert.strictEqual(err.message, "Rate limited");
    assert.deepStrictEqual(err.responseBody, { detail: "too many requests" });
    assert.strictEqual(err.requestId, "req-123");
    assert.strictEqual(err.retryAfter, 60);
  });

  it("is an instance of Error", () => {
    const err = new LinkedInApiError(500, "Server error");
    assert.ok(err instanceof Error);
  });
});

describe("McpToolError", () => {
  it("stores code and sets isError to true", () => {
    const err = new McpToolError("INVALID_INPUT", "accountId is required");
    assert.strictEqual(err.name, "McpToolError");
    assert.strictEqual(err.code, "INVALID_INPUT");
    assert.strictEqual(err.message, "accountId is required");
    assert.strictEqual(err.isError, true);
  });

  it("is an instance of Error", () => {
    const err = new McpToolError("NOT_FOUND", "Tool not found");
    assert.ok(err instanceof Error);
  });
});

describe("ToolRegistry", () => {
  it("starts empty", () => {
    const registry = new ToolRegistry();
    assert.deepStrictEqual(registry.getToolList(), []);
    assert.strictEqual(registry.getHandler("nonexistent"), undefined);
  });

  it("registers a tool and its handler", async () => {
    const registry = new ToolRegistry();
    const tool = { name: "test_tool", description: "A test tool", inputSchema: { type: "object" } };
    const handler = async () => ({ content: [{ type: "text", text: "ok" }] });

    registry.register(tool, handler);
    assert.deepStrictEqual(registry.getToolList(), [tool]);
    assert.strictEqual(registry.getHandler("test_tool"), handler);
  });

  it("returns undefined for unregistered tools", () => {
    const registry = new ToolRegistry();
    registry.register({ name: "a", description: "", inputSchema: { type: "object" } }, async () => ({ content: [] }));
    assert.strictEqual(registry.getHandler("b"), undefined);
  });

  it("allows multiple tools", () => {
    const registry = new ToolRegistry();
    const tool1 = { name: "tool_1", description: "First", inputSchema: { type: "object" } };
    const tool2 = { name: "tool_2", description: "Second", inputSchema: { type: "object" } };

    registry.register(tool1, async () => ({ content: [] }));
    registry.register(tool2, async () => ({ content: [] }));

    const list = registry.getToolList();
    assert.strictEqual(list.length, 2);
    assert.ok(list.some((t) => t.name === "tool_1"));
    assert.ok(list.some((t) => t.name === "tool_2"));
  });

  it("handler returns the correct result when called", async () => {
    const registry = new ToolRegistry();
    const handler = async (args) => ({ content: [{ type: "text", text: JSON.stringify(args) }] });
    registry.register({ name: "echo", description: "", inputSchema: { type: "object" } }, handler);

    const result = await registry.getHandler("echo")({ hello: "world" });
    assert.strictEqual(result.content[0].text, '{"hello":"world"}');
  });

  it("hides and refuses mutating tools by default", async () => {
    const registry = new ToolRegistry();
    const handler = async () => ({ content: [{ type: "text", text: "mutated" }] });
    registry.register({ name: "dangerous_write", description: "", inputSchema: { type: "object" } }, handler, {
      mutating: true,
    });

    assert.deepStrictEqual(registry.getToolList(), []);
    const result = await registry.getHandler("dangerous_write")({});
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /WRITES_DISABLED/);
  });

  it("exposes mutating tools only when writes are explicitly enabled", () => {
    const registry = new ToolRegistry(true);
    const handler = async () => ({ content: [{ type: "text", text: "mutated" }] });
    registry.register({ name: "enabled_write", description: "", inputSchema: { type: "object" } }, handler, {
      mutating: true,
    });

    assert.deepStrictEqual(
      registry.getToolList().map((tool) => tool.name),
      ["enabled_write"]
    );
    assert.strictEqual(registry.getHandler("enabled_write"), handler);
  });
});

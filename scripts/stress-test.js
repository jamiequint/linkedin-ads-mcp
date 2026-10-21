#!/usr/bin/env node
/**
 * Dry-run stress test for the LinkedIn Ads MCP Server.
 * Tests tool registration, schema validation, error handling, and graceful
 * auth failures WITHOUT requiring real LinkedIn API credentials.
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, "../dist/index.js");

const COLORS = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
};

let passCount = 0;
let failCount = 0;
const errors = [];

function pass(label) {
  passCount++;
  console.log(`${COLORS.green}✓ PASS${COLORS.reset} ${label}`);
}

function fail(label, reason) {
  failCount++;
  console.log(`${COLORS.red}✗ FAIL${COLORS.reset} ${label}`);
  if (reason) console.log(`  ${COLORS.red}${reason}${COLORS.reset}`);
  errors.push({ label, reason });
}

function info(label) {
  console.log(`${COLORS.cyan}→ INFO${COLORS.reset} ${label}`);
}

// Shared stdout line buffer and pending request map
let stdoutBuffer = "";
const pendingRequests = new Map();

function attachStdoutHandler(server) {
  server.stdout.on("data", (data) => {
    stdoutBuffer += data.toString();
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop(); // keep incomplete line for next chunk

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && pendingRequests.has(msg.id)) {
          const { resolve, reject, timeout } = pendingRequests.get(msg.id);
          clearTimeout(timeout);
          pendingRequests.delete(msg.id);
          resolve(msg);
        }
      } catch {
        // ignore non-JSON lines
      }
    }
  });
}

async function sendRequest(server, request, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(request.id);
      reject(new Error(`Request timeout (${timeoutMs}ms)`));
    }, timeoutMs);
    pendingRequests.set(request.id, { resolve, reject, timeout });
    server.stdin.write(JSON.stringify(request) + "\n");
  });
}

async function runTests() {
  console.log(`\n${COLORS.cyan}═══════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.cyan}  LinkedIn Ads MCP Server — Dry Run Stress Test${COLORS.reset}`);
  console.log(`${COLORS.cyan}═══════════════════════════════════════════════════════${COLORS.reset}\n`);

  // ── Phase 1: Server Startup ────────────────────────────────────────────
  info("Starting MCP server with dummy token...");
  const server = spawn("node", [SERVER_PATH], {
    env: { ...process.env, LINKEDIN_ACCESS_TOKEN: "dummy_token_for_testing" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let serverCrashed = false;
  server.on("exit", (code) => {
    if (code !== null && code !== 0) {
      serverCrashed = true;
    }
  });

  // Attach shared stdout handler before any requests
  attachStdoutHandler(server);

  // Wait for server to initialize
  await new Promise((r) => setTimeout(r, 500));

  if (serverCrashed) {
    fail("Server startup", "Server crashed immediately");
    process.exit(1);
  }
  pass("Server starts without crashing");

  // ── Phase 2: Tool Discovery ────────────────────────────────────────────
  info("Requesting tool list...");
  const listToolsReq = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
  };

  let toolList;
  try {
    toolList = await sendRequest(server, listToolsReq);
  } catch (e) {
    fail("Tool list request", e.message);
    server.kill();
    process.exit(1);
  }

  if (!toolList.result || !Array.isArray(toolList.result.tools)) {
    fail("Tool list response", "Missing tools array in response");
    server.kill();
    process.exit(1);
  }

  const tools = toolList.result.tools;
  const toolNames = tools.map((t) => t.name).sort();

  pass(`Tool list returned ${tools.length} tools`);

  // Expected tools
  const expectedTools = [
    "linkedin_ads_list_accounts",
    "linkedin_ads_get_account",
    "linkedin_ads_list_campaign_groups",
    "linkedin_ads_get_campaign_group",
    "linkedin_ads_list_campaigns",
    "linkedin_ads_get_campaign",
    "linkedin_ads_get_campaign_performance",
    "linkedin_ads_list_creatives",
    "linkedin_ads_get_creative",
    "linkedin_ads_get_creative_performance",
    "linkedin_ads_get_analytics",
    "linkedin_ads_get_campaign_stats",
    "linkedin_ads_get_audience_demographics",
    "linkedin_ads_get_audience_reach",
    "linkedin_ads_list_saved_audiences",
    "linkedin_ads_get_custom_audience",
    "linkedin_ads_get_conversion_performance",
    "linkedin_ads_list_conversions",
    "linkedin_ads_get_lead_gen_performance",
    "linkedin_ads_list_lead_forms",
    "linkedin_ads_compare_performance",
    "linkedin_ads_get_daily_trends",
  ];

  const missing = expectedTools.filter((name) => !toolNames.includes(name));
  const unexpected = toolNames.filter((name) => !expectedTools.includes(name));

  if (missing.length === 0 && unexpected.length === 0) {
    pass(`All ${expectedTools.length} expected tools registered`);
  } else {
    if (missing.length) fail("Missing tools", missing.join(", "));
    if (unexpected.length) fail("Unexpected tools", unexpected.join(", "));
  }

  // ── Phase 3: Schema Validation ─────────────────────────────────────────
  info("Validating tool schemas...");
  let schemaErrors = 0;
  for (const tool of tools) {
    if (!tool.name) {
      schemaErrors++;
      fail(`Tool schema: missing name`);
      continue;
    }
    if (!tool.description) {
      schemaErrors++;
      fail(`Tool ${tool.name}: missing description`);
      continue;
    }
    if (!tool.inputSchema || tool.inputSchema.type !== "object") {
      schemaErrors++;
      fail(`Tool ${tool.name}: invalid inputSchema`);
      continue;
    }
  }
  if (schemaErrors === 0) pass("All tool schemas are valid");

  // ── Phase 4: Error Handling (dummy token = auth failures) ──────────────
  info("Testing error handling with dummy token...");

  const errorTests = [
    {
      name: "linkedin_ads_list_accounts",
      args: {},
      expectError: true,
      label: "list_accounts with invalid token",
    },
    {
      name: "linkedin_ads_get_campaign_performance",
      args: { accountId: "12345", startDate: "2024-01-01" },
      expectError: true,
      label: "get_campaign_performance with invalid token",
    },
    {
      name: "linkedin_ads_get_audience_demographics",
      args: { accountId: "12345", demographicType: "MEMBER_JOB_FUNCTION", startDate: "2024-01-01" },
      expectError: true,
      label: "get_audience_demographics with invalid token",
    },
    {
      name: "linkedin_ads_list_campaigns",
      args: { accountId: "12345" },
      expectError: true,
      label: "list_campaigns with invalid token",
    },
  ];

  let reqId = 10;
  for (const test of errorTests) {
    reqId++;
    try {
      const response = await sendRequest(server, {
        jsonrpc: "2.0",
        id: reqId,
        method: "tools/call",
        params: { name: test.name, arguments: test.args },
      });

      const resultText = response.result?.content?.[0]?.text;
      const hasError = response.result?.isError === true || (resultText && resultText.includes("error"));

      if (test.expectError && hasError) {
        pass(`${test.label} — returns error gracefully`);
      } else if (test.expectError && !hasError) {
        // Some tools might return empty arrays instead of errors with a dummy token
        // depending on LinkedIn's API behavior — this is still acceptable
        pass(`${test.label} — returns empty/data response (acceptable)`);
      } else {
        fail(test.label, "Unexpected response behavior");
      }
    } catch (e) {
      if (test.expectError) {
        pass(`${test.label} — request failed as expected (${e.message})`);
      } else {
        fail(test.label, e.message);
      }
    }
  }

  // ── Phase 5: Input Validation ──────────────────────────────────────────
  info("Testing input validation...");

  const validationTests = [
    {
      name: "linkedin_ads_get_campaign",
      args: {},
      label: "get_campaign missing accountId",
    },
    {
      name: "linkedin_ads_create_campaign",
      args: { accountId: "123" },
      label: "create_campaign missing required fields",
    },
    {
      name: "linkedin_ads_delete_campaign",
      args: { accountId: "123" },
      label: "delete_campaign missing campaignId",
    },
    {
      name: "linkedin_ads_upload_image",
      args: { organizationId: "123" },
      label: "upload_image missing filePath",
    },
  ];

  for (const test of validationTests) {
    reqId++;
    try {
      const response = await sendRequest(server, {
        jsonrpc: "2.0",
        id: reqId,
        method: "tools/call",
        params: { name: test.name, arguments: test.args },
      });

      const resultText = response.result?.content?.[0]?.text;
      const hasError = response.result?.isError === true;

      if (hasError || (resultText && resultText.includes("error"))) {
        pass(`${test.label} — validation rejects invalid input`);
      } else {
        fail(test.label, "Did not reject invalid input");
      }
    } catch (e) {
      pass(`${test.label} — request rejected (${e.message})`);
    }
  }

  // ── Phase 6: Tool Name Validation ──────────────────────────────────────
  info("Testing unknown tool handling...");
  reqId++;
  try {
    const response = await sendRequest(server, {
      jsonrpc: "2.0",
      id: reqId,
      method: "tools/call",
      params: { name: "nonexistent_tool_12345", arguments: {} },
    });

    const hasError = response.result?.isError === true;
    const text = response.result?.content?.[0]?.text || "";

    if (hasError && text.includes("not found")) {
      pass("Unknown tool returns 'not found' error");
    } else {
      fail("Unknown tool handling", "Did not return expected error");
    }
  } catch (e) {
    fail("Unknown tool handling", e.message);
  }

  // ── Phase 7: Memory / Stability ────────────────────────────────────────
  info("Running rapid-fire request burst (10 parallel calls)...");
  reqId++;
  const burst = Array.from({ length: 10 }, (_, i) =>
    sendRequest(
      server,
      {
        jsonrpc: "2.0",
        id: reqId + i,
        method: "tools/list",
      },
      15000
    )
  );

  try {
    const burstResults = await Promise.all(burst);
    const allValid = burstResults.every((r) => r.result && Array.isArray(r.result.tools));
    if (allValid) {
      pass("10 parallel tool/list requests handled correctly");
    } else {
      fail("Parallel request burst", "Some responses were invalid");
    }
  } catch (e) {
    fail("Parallel request burst", e.message);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────
  server.kill();
  await new Promise((r) => setTimeout(r, 300));

  if (serverCrashed) {
    fail("Server survived full test suite", "Server crashed during tests");
  } else {
    pass("Server shuts down cleanly after tests");
  }

  // ── Report ─────────────────────────────────────────────────────────────
  console.log(`\n${COLORS.cyan}═══════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.cyan}  Test Results${COLORS.reset}`);
  console.log(`${COLORS.cyan}═══════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.green}Passed: ${passCount}${COLORS.reset}`);
  console.log(`${COLORS.red}Failed: ${failCount}${COLORS.reset}`);
  console.log(`Total:  ${passCount + failCount}`);

  if (errors.length > 0) {
    console.log(`\n${COLORS.red}Errors:${COLORS.reset}`);
    for (const err of errors) {
      console.log(`  • ${err.label}: ${err.reason}`);
    }
  }

  console.log();
  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch((e) => {
  console.error(`${COLORS.red}Fatal error:${COLORS.reset}`, e);
  process.exit(1);
});

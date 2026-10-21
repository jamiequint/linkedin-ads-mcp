import type { LinkedInApiClient } from "../linkedin-client.js";
import { LinkedInApiError } from "../errors.js";
import type { ToolRegistry, McpTool, ToolHandler } from "../tool-registry.js";
import type { RunSchedule, BudgetAmount } from "../types.js";
import { calculateStandardMetrics } from "../lib/metrics.js";

export class CampaignGroupTools {
  private apiClient: LinkedInApiClient;

  constructor(apiClient: LinkedInApiClient) {
    this.apiClient = apiClient;
  }

  registerTools(registry: ToolRegistry): void {
    // ── 1. list_campaign_groups ──────────────────────────────────────────
    const listCampaignGroupsTool: McpTool = {
      name: "linkedin_ads_list_campaign_groups",
      description: "List campaign groups for a given ad account with optional performance metrics",
      inputSchema: {
        type: "object",
        properties: {
          accountId: { type: "string" },
          start: { type: "integer", default: 0 },
          count: { type: "integer", default: 50 },
          status: { type: "array", items: { type: "string" } },
          includePerformance: { type: "boolean", default: false },
          startDate: { type: "string" },
          endDate: { type: "string" },
        },
        required: ["accountId"],
      },
    };

    const listCampaignGroupsHandler: ToolHandler = async (args: unknown) => {
      const { accountId, status, includePerformance, startDate, endDate } = (args as Record<string, unknown>) ?? {};

      if (typeof accountId !== "string" || accountId.length === 0) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "accountId is required" }) }], isError: true };
      }

      try {
        const groups = await this.apiClient.listCampaignGroups(accountId, { status: status as string[] | undefined });

        let performanceByGroup: Record<string, any> = {};
        if (includePerformance && startDate) {
          const analytics = await this.apiClient.getCampaignGroupPerformance({
            accountId,
            startDate: startDate as string,
            endDate: endDate as string | undefined,
          });
          performanceByGroup = analytics.reduce((acc: Record<string, any>, record: any) => {
            const groupUrn = record.pivotValues?.[0] || "";
            const groupId = groupUrn.split(":").pop() || "";
            acc[groupId] = calculateStandardMetrics(record);
            return acc;
          }, {});
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  campaignGroups: groups.map((group) => ({
                    id: group.id,
                    name: group.name,
                    status: group.status,
                    totalBudget: group.totalBudget,
                    runSchedule: group.runSchedule,
                    performance: performanceByGroup[group.id] || null,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        if (err instanceof LinkedInApiError) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: err.message, statusCode: err.statusCode }) }],
            isError: true,
          };
        }
        return { content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    };

    registry.register(listCampaignGroupsTool, listCampaignGroupsHandler);

    // ── 2. get_campaign_group ────────────────────────────────────────────
    const getCampaignGroupTool: McpTool = {
      name: "linkedin_ads_get_campaign_group",
      description: "Get a single campaign group by ID",
      inputSchema: {
        type: "object",
        properties: {
          accountId: { type: "string" },
          campaignGroupId: { type: "string" },
        },
        required: ["accountId", "campaignGroupId"],
      },
    };

    const getCampaignGroupHandler: ToolHandler = async (args: unknown) => {
      const { accountId, campaignGroupId } = args as Record<string, unknown>;
      if (typeof accountId !== "string" || typeof campaignGroupId !== "string") {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "accountId and campaignGroupId are required" }) }],
          isError: true,
        };
      }

      try {
        const result = await this.apiClient.getCampaignGroup(accountId, campaignGroupId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        if (err instanceof LinkedInApiError) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: err.message, statusCode: err.statusCode }) }],
            isError: true,
          };
        }
        return { content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    };

    registry.register(getCampaignGroupTool, getCampaignGroupHandler);

    // ── 3. create_campaign_group ─────────────────────────────────────────
    const createCampaignGroupTool: McpTool = {
      name: "linkedin_ads_create_campaign_group",
      description: "Create a new campaign group",
      inputSchema: {
        type: "object",
        properties: {
          accountId: { type: "string" },
          name: { type: "string" },
          status: { type: "string", enum: ["ACTIVE", "DRAFT", "PAUSED"], default: "DRAFT" },
          runSchedule: { type: "object", properties: { start: { type: "integer" }, end: { type: "integer" } } },
          totalBudget: { type: "object", properties: { amount: { type: "string" }, currencyCode: { type: "string" } } },
        },
        required: ["accountId", "name"],
      },
    };

    const createCampaignGroupHandler: ToolHandler = async (args: unknown) => {
      const { accountId, name, status = "DRAFT", runSchedule, totalBudget } = args as Record<string, unknown>;
      if (typeof accountId !== "string" || typeof name !== "string") {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "accountId and name are required" }) }],
          isError: true,
        };
      }

      const body: Record<string, unknown> = { name, status };
      if (runSchedule !== undefined) body.runSchedule = runSchedule as RunSchedule;
      if (totalBudget !== undefined) body.totalBudget = totalBudget as BudgetAmount;

      try {
        const result = await this.apiClient.createCampaignGroup(accountId, body);
        return {
          content: [
            { type: "text", text: JSON.stringify({ success: true, campaignGroupId: result.id, name, status }) },
          ],
        };
      } catch (err) {
        if (err instanceof LinkedInApiError) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: err.message, statusCode: err.statusCode }) }],
            isError: true,
          };
        }
        return { content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    };

    registry.register(createCampaignGroupTool, createCampaignGroupHandler, {
      mutating: true,
    });

    // ── 4. update_campaign_group ─────────────────────────────────────────
    const updateCampaignGroupTool: McpTool = {
      name: "linkedin_ads_update_campaign_group",
      description: "Update an existing campaign group (partial update)",
      inputSchema: {
        type: "object",
        properties: {
          accountId: { type: "string" },
          campaignGroupId: { type: "string" },
          name: { type: "string" },
          status: { type: "string", enum: ["ACTIVE", "ARCHIVED", "CANCELED", "PAUSED"] },
          runSchedule: { type: "object" },
          totalBudget: { type: "object" },
        },
        required: ["accountId", "campaignGroupId"],
      },
    };

    const updateCampaignGroupHandler: ToolHandler = async (args: unknown) => {
      const { accountId, campaignGroupId, name, status, runSchedule, totalBudget } = args as Record<string, unknown>;
      if (typeof accountId !== "string" || typeof campaignGroupId !== "string") {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "accountId and campaignGroupId are required" }) }],
          isError: true,
        };
      }

      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (status !== undefined) updates.status = status;
      if (runSchedule !== undefined) updates.runSchedule = runSchedule;
      if (totalBudget !== undefined) updates.totalBudget = totalBudget;

      if (Object.keys(updates).length === 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "At least one field to update must be provided" }) }],
          isError: true,
        };
      }

      try {
        await this.apiClient.updateCampaignGroup(accountId, campaignGroupId, updates);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, campaignGroupId, updatedFields: Object.keys(updates) }),
            },
          ],
        };
      } catch (err) {
        if (err instanceof LinkedInApiError) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: err.message, statusCode: err.statusCode }) }],
            isError: true,
          };
        }
        return { content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    };

    registry.register(updateCampaignGroupTool, updateCampaignGroupHandler, {
      mutating: true,
    });

    // ── 5. delete_campaign_group ─────────────────────────────────────────
    const deleteCampaignGroupTool: McpTool = {
      name: "linkedin_ads_delete_campaign_group",
      description:
        "Delete a campaign group. Draft groups are deleted immediately. Non-draft groups are set to PENDING_DELETION.",
      inputSchema: {
        type: "object",
        properties: {
          accountId: { type: "string" },
          campaignGroupId: { type: "string" },
        },
        required: ["accountId", "campaignGroupId"],
      },
    };

    const deleteCampaignGroupHandler: ToolHandler = async (args: unknown) => {
      const { accountId, campaignGroupId } = args as Record<string, unknown>;
      if (typeof accountId !== "string" || typeof campaignGroupId !== "string") {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "accountId and campaignGroupId are required" }) }],
          isError: true,
        };
      }

      try {
        const group = await this.apiClient.getCampaignGroup(accountId, campaignGroupId);
        const isDraft = group?.status === "DRAFT";
        await this.apiClient.deleteCampaignGroup(accountId, campaignGroupId, isDraft);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                campaignGroupId,
                action: isDraft ? "DELETED" : "PENDING_DELETION",
                message: isDraft
                  ? `Draft campaign group ${campaignGroupId} deleted`
                  : `Campaign group ${campaignGroupId} set to PENDING_DELETION`,
              }),
            },
          ],
        };
      } catch (err) {
        if (err instanceof LinkedInApiError) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: err.message, statusCode: err.statusCode }) }],
            isError: true,
          };
        }
        return { content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    };

    registry.register(deleteCampaignGroupTool, deleteCampaignGroupHandler, {
      mutating: true,
    });
  }
}

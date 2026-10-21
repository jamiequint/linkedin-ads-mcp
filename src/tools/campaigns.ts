import type { LinkedInApiClient } from "../linkedin-client.js";
import type { ToolRegistry } from "../tool-registry.js";
import { calculateStandardMetrics } from "../lib/metrics.js";

export class CampaignTools {
  private apiClient: LinkedInApiClient;

  constructor(apiClient: LinkedInApiClient) {
    this.apiClient = apiClient;
  }

  registerTools(registry: ToolRegistry): void {
    // 1. list_campaigns — ALL campaigns including drafts
    registry.register(
      {
        name: "linkedin_ads_list_campaigns",
        description:
          "Lists ALL campaigns for a LinkedIn Ad Account including DRAFT and PAUSED with zero impressions. Supports filtering by campaign group and status. Use this when you need to see inactive or draft campaigns.",
        inputSchema: {
          type: "object",
          properties: {
            accountId: { type: "string", description: "The LinkedIn Ad Account ID" },
            campaignGroupIds: { type: "array", items: { type: "string" }, description: "Filter by campaign group IDs" },
            status: {
              type: "array",
              items: { type: "string", enum: ["ACTIVE", "PAUSED", "ARCHIVED", "DRAFT", "CANCELED"] },
              description: "Filter by status",
            },
          },
          required: ["accountId"],
        },
      },
      async (args: unknown) => {
        const params = args as Record<string, any>;
        if (!params.accountId) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "accountId is required" }) }],
            isError: true,
          };
        }
        try {
          const campaigns = await this.apiClient.listCampaigns(params.accountId, {
            campaignGroupIds: params.campaignGroupIds,
            status: params.status,
          });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    campaigns: campaigns.map((c) => ({
                      id: c.id,
                      name: c.name,
                      status: c.status,
                      type: c.type,
                      objectiveType: c.objectiveType,
                      costType: c.costType,
                      campaignGroup: c.campaignGroup,
                      dailyBudget: c.dailyBudget,
                      totalBudget: c.totalBudget,
                      runSchedule: c.runSchedule,
                    })),
                    totalCount: campaigns.length,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
        }
      }
    );

    // 2. get_campaign
    registry.register(
      {
        name: "linkedin_ads_get_campaign",
        description: "Get a specific campaign by ID",
        inputSchema: {
          type: "object",
          properties: {
            accountId: { type: "string" },
            campaignId: { type: "string" },
          },
          required: ["accountId", "campaignId"],
        },
      },
      async (args: unknown) => {
        const params = args as { accountId?: string; campaignId?: string };
        if (!params.accountId || !params.campaignId) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "accountId and campaignId are required" }) }],
            isError: true,
          };
        }
        try {
          const result = await this.apiClient.getCampaign(params.accountId, params.campaignId);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
        }
      }
    );

    // 3. create_campaign
    registry.register(
      {
        name: "linkedin_ads_create_campaign",
        description: "Create a new ad campaign",
        inputSchema: {
          type: "object",
          properties: {
            accountId: { type: "string" },
            campaignGroupId: { type: "string" },
            name: { type: "string" },
            status: { type: "string", enum: ["ACTIVE", "PAUSED", "DRAFT"] },
            objectiveType: { type: "string" },
            costType: { type: "string", enum: ["CPM", "CPC"] },
            dailyBudget: { type: "object" },
            totalBudget: { type: "object" },
            unitCost: { type: "object" },
            runSchedule: { type: "object", properties: { start: { type: "integer" }, end: { type: "integer" } } },
            targetingCriteria: { type: "object" },
            format: { type: "string" },
            offsiteDeliveryEnabled: { type: "boolean" },
            creativeSelection: { type: "string", enum: ["OPTIMIZED", "ROUND_ROBIN"] },
          },
          required: ["accountId", "campaignGroupId", "name", "status", "objectiveType", "costType", "format"],
        },
      },
      async (args: unknown) => {
        const params = args as Record<string, any>;
        const required = ["accountId", "campaignGroupId", "name", "status", "objectiveType", "costType", "format"];
        for (const field of required) {
          if (!params[field]) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: `${field} is required` }) }],
              isError: true,
            };
          }
        }

        const body: Record<string, unknown> = {
          campaignGroup: params.campaignGroupId,
          name: params.name,
          status: params.status,
          objectiveType: params.objectiveType,
          costType: params.costType,
          format: params.format,
        };
        if (params.dailyBudget) body.dailyBudget = params.dailyBudget;
        if (params.totalBudget) body.totalBudget = params.totalBudget;
        if (params.unitCost) body.unitCost = params.unitCost;
        if (params.runSchedule) body.runSchedule = params.runSchedule;
        if (params.targetingCriteria) body.targetingCriteria = params.targetingCriteria;
        if (params.offsiteDeliveryEnabled !== undefined) body.offsiteDeliveryEnabled = params.offsiteDeliveryEnabled;
        if (params.creativeSelection) body.creativeSelection = params.creativeSelection;

        try {
          const result = await this.apiClient.createCampaign(params.accountId, body);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  campaignId: result.id,
                  name: params.name,
                  status: params.status,
                }),
              },
            ],
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
        }
      },
      { mutating: true }
    );

    // 4. update_campaign
    registry.register(
      {
        name: "linkedin_ads_update_campaign",
        description: "Update an existing campaign (partial update)",
        inputSchema: {
          type: "object",
          properties: {
            accountId: { type: "string" },
            campaignId: { type: "string" },
            name: { type: "string" },
            status: { type: "string", enum: ["ACTIVE", "PAUSED", "ARCHIVED", "CANCELED"] },
            dailyBudget: { type: "object" },
            totalBudget: { type: "object" },
            unitCost: { type: "object" },
            runSchedule: { type: "object" },
            targetingCriteria: { type: "object" },
            offsiteDeliveryEnabled: { type: "boolean" },
          },
          required: ["accountId", "campaignId"],
        },
      },
      async (args: unknown) => {
        const params = args as Record<string, any>;
        if (!params.accountId || !params.campaignId) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "accountId and campaignId are required" }) }],
            isError: true,
          };
        }

        const updates: Record<string, unknown> = {};
        if (params.name !== undefined) updates.name = params.name;
        if (params.status !== undefined) updates.status = params.status;
        if (params.dailyBudget !== undefined) updates.dailyBudget = params.dailyBudget;
        if (params.totalBudget !== undefined) updates.totalBudget = params.totalBudget;
        if (params.unitCost !== undefined) updates.unitCost = params.unitCost;
        if (params.runSchedule !== undefined) updates.runSchedule = params.runSchedule;
        if (params.targetingCriteria !== undefined) updates.targetingCriteria = params.targetingCriteria;
        if (params.offsiteDeliveryEnabled !== undefined) updates.offsiteDeliveryEnabled = params.offsiteDeliveryEnabled;

        if (Object.keys(updates).length === 0) {
          return {
            content: [
              { type: "text", text: JSON.stringify({ error: "At least one field to update must be provided" }) },
            ],
            isError: true,
          };
        }

        try {
          await this.apiClient.updateCampaign(params.accountId, params.campaignId, updates);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  campaignId: params.campaignId,
                  updatedFields: Object.keys(updates),
                }),
              },
            ],
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
        }
      },
      { mutating: true }
    );

    // 5. delete_campaign — draft-aware
    registry.register(
      {
        name: "linkedin_ads_delete_campaign",
        description:
          "Delete (archive) a campaign. Draft campaigns are deleted immediately. Non-draft campaigns are set to PENDING_DELETION.",
        inputSchema: {
          type: "object",
          properties: {
            accountId: { type: "string" },
            campaignId: { type: "string" },
          },
          required: ["accountId", "campaignId"],
        },
      },
      async (args: unknown) => {
        const params = args as { accountId?: string; campaignId?: string };
        if (!params.accountId || !params.campaignId) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "accountId and campaignId are required" }) }],
            isError: true,
          };
        }

        try {
          const campaign = await this.apiClient.getCampaign(params.accountId, params.campaignId);
          const isDraft = campaign?.status === "DRAFT";
          await this.apiClient.deleteCampaign(params.accountId, params.campaignId, isDraft);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  campaignId: params.campaignId,
                  action: isDraft ? "DELETED" : "PENDING_DELETION",
                  message: isDraft
                    ? `Draft campaign ${params.campaignId} deleted`
                    : `Campaign ${params.campaignId} set to PENDING_DELETION`,
                }),
              },
            ],
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
        }
      },
      { mutating: true }
    );

    // 6. get_campaign_performance — with standard metrics + campaign names
    registry.register(
      {
        name: "linkedin_ads_get_campaign_performance",
        description:
          "Retrieves performance metrics for campaigns with standard KPIs (CTR, CPC, CPM, conversion rate, cost per conversion, audience penetration, average dwell time). Resolves campaign names automatically.",
        inputSchema: {
          type: "object",
          properties: {
            accountId: { type: "string", description: "The LinkedIn Ad Account ID" },
            campaignIds: { type: "array", items: { type: "string" }, description: "Specific campaign IDs to filter" },
            campaignGroupIds: { type: "array", items: { type: "string" }, description: "Filter by campaign group IDs" },
            startDate: { type: "string", description: "Start date in YYYY-MM-DD format" },
            endDate: { type: "string", description: "End date in YYYY-MM-DD format. Default: today" },
            timeGranularity: {
              type: "string",
              enum: ["ALL", "DAILY", "MONTHLY"],
              description: "Time granularity. Default: ALL",
            },
          },
          required: ["accountId", "startDate"],
        },
      },
      async (args: unknown) => {
        const params = args as Record<string, any>;
        if (!params.accountId || !params.startDate) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "accountId and startDate are required" }) }],
            isError: true,
          };
        }

        try {
          const analytics = await this.apiClient.getCampaignPerformance({
            accountId: params.accountId,
            campaignIds: params.campaignIds,
            campaignGroupIds: params.campaignGroupIds,
            startDate: params.startDate,
            endDate: params.endDate,
            timeGranularity: params.timeGranularity,
          });

          const campaignIds = analytics.map((record: any) => record.pivotValues?.[0]?.split(":").pop()).filter(Boolean);
          const campaignMap = await this.apiClient.getCampaignsByIds(params.accountId, campaignIds);

          const results = analytics.map((record: any) => {
            const campaignUrn = record.pivotValues?.[0] || "";
            const campaignId = campaignUrn.split(":").pop() || "";
            const campaign = campaignMap.get(campaignId);
            return {
              campaignId,
              campaignName: campaign?.name || "Unknown",
              campaignGroupId: campaign?.campaignGroup?.split(":").pop() || null,
              status: campaign?.status || "Unknown",
              metrics: {
                ...calculateStandardMetrics(record),
                landingPageClicks: record.landingPageClicks || 0,
                costInLocalCurrency: parseFloat(record.costInLocalCurrency) || 0,
              },
            };
          });

          const totalRecord = results.reduce(
            (acc: any, r: any) => ({
              impressions: acc.impressions + r.metrics.impressions,
              clicks: acc.clicks + r.metrics.clicks,
              costInUsd: acc.costInUsd + r.metrics.spend,
              totalEngagements: acc.totalEngagements + r.metrics.engagements,
              externalWebsiteConversions: acc.externalWebsiteConversions + r.metrics.conversions,
              approximateUniqueImpressions: acc.approximateUniqueImpressions + r.metrics.reach,
            }),
            {
              impressions: 0,
              clicks: 0,
              costInUsd: 0,
              totalEngagements: 0,
              externalWebsiteConversions: 0,
              approximateUniqueImpressions: 0,
            }
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    campaigns: results,
                    totals: calculateStandardMetrics(totalRecord),
                    dateRange: {
                      start: params.startDate,
                      end: params.endDate || new Date().toISOString().split("T")[0],
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
        }
      }
    );
  }
}

import type { LinkedInApiClient } from "../linkedin-client.js";
import type { ToolRegistry } from "../tool-registry.js";
import { calculateStandardMetrics, DEMOGRAPHIC_TYPE_MAP } from "../lib/metrics.js";

export class DemographicsTools {
  private apiClient: LinkedInApiClient;

  constructor(apiClient: LinkedInApiClient) {
    this.apiClient = apiClient;
  }

  registerTools(registry: ToolRegistry): void {
    // 1. get_audience_demographics
    registry.register(
      {
        name: "linkedin_ads_get_audience_demographics",
        description:
          "Retrieves demographic breakdown of who saw or interacted with your ads. Shows performance segmented by job function, seniority, industry, company size, job title, company, or geographic location. Essential for understanding if you're reaching your target audience. Note: Demographic data has a 12-24 hour delay.",
        inputSchema: {
          type: "object",
          properties: {
            accountId: { type: "string", description: "The LinkedIn Ad Account ID" },
            campaignIds: {
              type: "array",
              items: { type: "string" },
              description: "Filter by specific campaigns",
            },
            demographicType: {
              type: "string",
              enum: [
                "MEMBER_JOB_FUNCTION",
                "MEMBER_SENIORITY",
                "MEMBER_INDUSTRY",
                "MEMBER_COMPANY_SIZE",
                "MEMBER_JOB_TITLE",
                "MEMBER_COMPANY",
                "MEMBER_COUNTRY",
                "MEMBER_COUNTRY_V2",
                "MEMBER_REGION",
                "MEMBER_REGION_V2",
              ],
              description: "The demographic dimension to analyze",
            },
            startDate: { type: "string", description: "Start date in YYYY-MM-DD format" },
            endDate: { type: "string", description: "End date in YYYY-MM-DD format. Default: today" },
            metric: {
              type: "string",
              enum: ["impressions", "clicks", "costInUsd"],
              description: "Primary metric to sort by. Default: impressions",
            },
            limit: { type: "integer", description: "Top N results to return (max 100). Default: 25" },
          },
          required: ["accountId", "demographicType", "startDate"],
        },
      },
      async (args: unknown) => {
        const params = args as Record<string, any>;
        if (!params.accountId || !params.demographicType || !params.startDate) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: "accountId, demographicType, and startDate are required" }),
              },
            ],
            isError: true,
          };
        }

        try {
          const analytics = await this.apiClient.getAudienceDemographics({
            accountId: params.accountId,
            demographicType: params.demographicType,
            campaignIds: params.campaignIds,
            startDate: params.startDate,
            endDate: params.endDate,
          });

          const sortMetric = params.metric || "impressions";
          const limit = Math.min(params.limit || 25, 100);

          const totalRecord = analytics.reduce(
            (acc: any, r: any) => ({
              impressions: acc.impressions + (r.impressions || 0),
              clicks: acc.clicks + (r.clicks || 0),
              costInUsd: acc.costInUsd + (parseFloat(r.costInUsd) || 0),
              totalEngagements: acc.totalEngagements + (r.totalEngagements || 0),
              externalWebsiteConversions: acc.externalWebsiteConversions + (r.externalWebsiteConversions || 0),
              approximateUniqueImpressions: acc.approximateUniqueImpressions + (r.approximateUniqueImpressions || 0),
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

          let segments = analytics.map((record: any) => {
            const urn = record.pivotValues?.[0] || "";
            const name = urn.split(":").pop() || urn;
            return {
              name,
              urn,
              metrics: calculateStandardMetrics(record),
              percentOfTotal:
                totalRecord.impressions > 0
                  ? Number((((record.impressions || 0) / totalRecord.impressions) * 100).toFixed(2))
                  : 0,
            };
          });

          segments.sort((a: any, b: any) => (b.metrics[sortMetric] || 0) - (a.metrics[sortMetric] || 0));
          segments = segments.slice(0, limit);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    demographicType: params.demographicType,
                    demographicTypeName: DEMOGRAPHIC_TYPE_MAP[params.demographicType] || params.demographicType,
                    dateRange: {
                      start: params.startDate,
                      end: params.endDate || new Date().toISOString().split("T")[0],
                    },
                    segments,
                    totals: calculateStandardMetrics(totalRecord),
                    note: "Demographic data may have a 12-24 hour delay and shows only top 100 values per creative per day.",
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

    // 2. get_audience_reach
    registry.register(
      {
        name: "linkedin_ads_get_audience_reach",
        description:
          "Shows unique member reach and native audience penetration for campaigns. Returns LinkedIn's native audiencePenetration metric (approximate unique members reached / total target audience size). Helps understand what percentage of your target audience you've reached. Note: Date range must be 92 days or less.",
        inputSchema: {
          type: "object",
          properties: {
            accountId: { type: "string", description: "The LinkedIn Ad Account ID" },
            campaignIds: { type: "array", items: { type: "string" }, description: "Filter by specific campaigns" },
            campaignGroupIds: { type: "array", items: { type: "string" }, description: "Filter by campaign groups" },
            startDate: { type: "string", description: "Start date in YYYY-MM-DD format (max 92 days range)" },
            endDate: { type: "string", description: "End date in YYYY-MM-DD format. Default: today" },
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

        const startDate = new Date(params.startDate);
        const endDate = params.endDate ? new Date(params.endDate) : new Date();
        const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff > 92) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: `Date range exceeds maximum of 92 days. Current range: ${daysDiff} days.`,
                }),
              },
            ],
            isError: true,
          };
        }

        try {
          const analytics = await this.apiClient.getAudienceReach({
            accountId: params.accountId,
            campaignIds: params.campaignIds,
            campaignGroupIds: params.campaignGroupIds,
            startDate: params.startDate,
            endDate: params.endDate,
          });

          const results = analytics.map((record: any) => {
            const entityUrn = record.pivotValues?.[0] || "";
            const entityId = entityUrn.split(":").pop() || "";
            const entityType = entityUrn.includes("Campaign")
              ? "CAMPAIGN"
              : entityUrn.includes("CampaignGroup")
                ? "CAMPAIGN_GROUP"
                : "ACCOUNT";
            const reach = record.approximateMemberReach || 0;
            const impressions = record.impressions || 0;
            const audiencePenetration =
              record.audiencePenetration != null ? Number((Number(record.audiencePenetration) * 100).toFixed(2)) : null;

            return {
              entityType,
              entityId,
              metrics: {
                approximateMemberReach: reach,
                impressions,
                frequency: reach > 0 ? (impressions / reach).toFixed(2) : null,
                audiencePenetration,
              },
            };
          });

          const accountTotals = results.reduce(
            (acc: any, r: any) => ({
              totalReach: acc.totalReach + r.metrics.approximateMemberReach,
              totalImpressions: acc.totalImpressions + r.metrics.impressions,
            }),
            { totalReach: 0, totalImpressions: 0 }
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    dateRange: {
                      start: params.startDate,
                      end: params.endDate || new Date().toISOString().split("T")[0],
                    },
                    entities: results,
                    accountTotals: {
                      ...accountTotals,
                      averageFrequency:
                        accountTotals.totalReach > 0
                          ? (accountTotals.totalImpressions / accountTotals.totalReach).toFixed(2)
                          : null,
                    },
                    note: "Reach data requires a date range of 92 days or less.",
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

    // 3. list_saved_audiences
    registry.register(
      {
        name: "linkedin_ads_list_saved_audiences",
        description:
          "Lists saved/matched audiences available in the account for targeting. Shows audience names, sizes, and statuses to help plan campaign targeting.",
        inputSchema: {
          type: "object",
          properties: {
            accountId: { type: "string", description: "The LinkedIn Ad Account ID" },
            status: {
              type: "array",
              items: { type: "string", enum: ["ACTIVE", "EXPIRED", "PROCESSING"] },
              description: "Filter by status",
            },
            audienceType: {
              type: "string",
              enum: ["USER", "COMPANY", "USER_LIST_UPLOAD", "COMPANY_LIST_UPLOAD"],
              description: "Filter by DMP segment type",
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
          const audiences = await this.apiClient.listSavedAudiences(params.accountId, {
            status: params.status,
            type: params.audienceType,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    audiences: audiences.map((a) => ({
                      id: a.id,
                      name: a.name,
                      type: a.type,
                      sourcePlatform: a.sourcePlatform,
                      status: a.status,
                      inputCount: a.inputCount,
                      destinations: a.destinations,
                      memberCount: a.memberCount,
                      matchRate: a.matchRate,
                      createdAt:
                        a.created !== undefined || a.createdAt !== undefined
                          ? new Date(a.created ?? a.createdAt!).toISOString()
                          : undefined,
                      lastModified: new Date(a.lastModified).toISOString(),
                    })),
                    totalCount: audiences.length,
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

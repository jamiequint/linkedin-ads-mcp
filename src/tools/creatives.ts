import type { LinkedInApiClient } from "../linkedin-client.js";
import type { ToolRegistry } from "../tool-registry.js";
import { calculateStandardMetrics } from "../lib/metrics.js";

export class CreativeTools {
  private apiClient: LinkedInApiClient;

  constructor(apiClient: LinkedInApiClient) {
    this.apiClient = apiClient;
  }

  registerTools(registry: ToolRegistry): void {
    // 1. list_creatives
    registry.register(
      {
        name: "linkedin_ads_list_creatives",
        description: "List creatives/ads for a campaign or account",
        inputSchema: {
          type: "object",
          properties: {
            accountId: { type: "string" },
            campaignId: { type: "string" },
            start: { type: "integer", default: 0 },
            count: { type: "integer", default: 50 },
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

        const campaignIds = params.campaignId ? [params.campaignId] : undefined;
        try {
          const creatives = await this.apiClient.listCreatives(params.accountId, {
            campaignIds,
            pageSize: params.count ?? 50,
          });
          return { content: [{ type: "text", text: JSON.stringify(creatives, null, 2) }] };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
        }
      }
    );

    // 2. get_creative
    registry.register(
      {
        name: "linkedin_ads_get_creative",
        description: "Get a specific creative",
        inputSchema: {
          type: "object",
          properties: {
            accountId: { type: "string" },
            creativeId: { type: "string" },
          },
          required: ["accountId", "creativeId"],
        },
      },
      async (args: unknown) => {
        const params = args as Record<string, any>;
        if (!params.accountId || !params.creativeId) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "accountId and creativeId are required" }) }],
            isError: true,
          };
        }
        try {
          const result = await this.apiClient.getCreative(params.accountId, params.creativeId);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
        }
      }
    );

    // 3. create_creative
    registry.register(
      {
        name: "linkedin_ads_create_creative",
        description: "Create a new creative referencing an existing post/share",
        inputSchema: {
          type: "object",
          properties: {
            accountId: { type: "string" },
            campaignId: { type: "string" },
            contentReference: { type: "string", description: "URN of the content to sponsor (e.g., urn:li:share:123)" },
            intendedStatus: { type: "string", enum: ["ACTIVE", "DRAFT"], default: "DRAFT" },
            name: { type: "string" },
            leadgenFormId: { type: "string" },
            leadgenCallToActionLabel: {
              type: "string",
              enum: [
                "APPLY",
                "DOWNLOAD",
                "VIEW_QUOTE",
                "LEARN_MORE",
                "SIGN_UP",
                "SUBSCRIBE",
                "REGISTER",
                "REQUEST_DEMO",
                "JOIN",
                "ATTEND",
              ],
            },
          },
          required: ["accountId", "campaignId", "contentReference"],
        },
      },
      async (args: unknown) => {
        const params = args as Record<string, any>;
        if (!params.accountId || !params.campaignId || !params.contentReference) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: "accountId, campaignId, and contentReference are required" }),
              },
            ],
            isError: true,
          };
        }

        const data: Record<string, unknown> = {
          campaign: params.campaignId,
          content: { reference: params.contentReference },
          intendedStatus: params.intendedStatus || "DRAFT",
        };
        if (params.name) data.name = params.name;
        if (params.leadgenFormId) {
          data.leadgenCallToAction = {
            destination: params.leadgenFormId.startsWith("urn:")
              ? params.leadgenFormId
              : `urn:li:adForm:${params.leadgenFormId}`,
            label: params.leadgenCallToActionLabel || "LEARN_MORE",
          };
        }

        try {
          const result = await this.apiClient.createCreative(params.accountId, data);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ success: true, creativeId: result.id, campaignId: params.campaignId }),
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

    // 4. create_inline_ad
    registry.register(
      {
        name: "linkedin_ads_create_inline_ad",
        description:
          "Creates a new LinkedIn ad with inline content directly (without needing a pre-existing post). Creates the ad content (text, image/video, landing page, CTA) and the creative in a single call.",
        inputSchema: {
          type: "object",
          properties: {
            accountId: { type: "string" },
            campaignId: { type: "string" },
            organizationId: {
              type: "string",
              description: "Organization/company ID (numeric or urn:li:organization:123)",
            },
            commentary: { type: "string", description: "The ad text/copy" },
            mediaId: { type: "string", description: "URN of image/video (upload first via upload_image)" },
            mediaTitle: { type: "string" },
            landingPageUrl: { type: "string" },
            callToActionLabel: {
              type: "string",
              enum: [
                "APPLY",
                "DOWNLOAD",
                "VIEW_QUOTE",
                "LEARN_MORE",
                "SIGN_UP",
                "SUBSCRIBE",
                "REGISTER",
                "REQUEST_DEMO",
                "JOIN",
                "ATTEND",
              ],
            },
            intendedStatus: { type: "string", enum: ["ACTIVE", "DRAFT"], default: "DRAFT" },
            name: { type: "string" },
            leadgenFormId: { type: "string" },
            leadgenCallToActionLabel: {
              type: "string",
              enum: [
                "APPLY",
                "DOWNLOAD",
                "VIEW_QUOTE",
                "LEARN_MORE",
                "SIGN_UP",
                "SUBSCRIBE",
                "REGISTER",
                "REQUEST_DEMO",
                "JOIN",
                "ATTEND",
              ],
            },
          },
          required: ["accountId", "campaignId", "organizationId", "commentary"],
        },
      },
      async (args: unknown) => {
        const params = args as Record<string, any>;
        if (!params.accountId || !params.campaignId || !params.organizationId || !params.commentary) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: "accountId, campaignId, organizationId, and commentary are required" }),
              },
            ],
            isError: true,
          };
        }

        const data: Record<string, unknown> = {
          campaign: params.campaignId,
          intendedStatus: params.intendedStatus || "DRAFT",
          organizationId: params.organizationId,
          commentary: params.commentary,
        };
        if (params.mediaId) data.mediaId = params.mediaId;
        if (params.mediaTitle) data.mediaTitle = params.mediaTitle;
        if (params.landingPageUrl) data.landingPageUrl = params.landingPageUrl;
        if (params.callToActionLabel) data.callToActionLabel = params.callToActionLabel;
        if (params.name) data.name = params.name;
        if (params.leadgenFormId) {
          data.leadgenCallToAction = {
            destination: params.leadgenFormId.startsWith("urn:")
              ? params.leadgenFormId
              : `urn:li:adForm:${params.leadgenFormId}`,
            label: params.leadgenCallToActionLabel || "LEARN_MORE",
          };
        }

        try {
          const result = await this.apiClient.createInlineCreative(params.accountId, data);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ success: true, creativeId: result.id, campaignId: params.campaignId }),
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

    // 5. update_creative_status
    registry.register(
      {
        name: "linkedin_ads_update_creative_status",
        description: "Activate, pause, or archive a creative/ad",
        inputSchema: {
          type: "object",
          properties: {
            accountId: { type: "string" },
            creativeId: { type: "string" },
            intendedStatus: { type: "string", enum: ["ACTIVE", "PAUSED", "ARCHIVED"] },
          },
          required: ["accountId", "creativeId", "intendedStatus"],
        },
      },
      async (args: unknown) => {
        const params = args as Record<string, any>;
        if (!params.accountId || !params.creativeId || !params.intendedStatus) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: "accountId, creativeId, and intendedStatus are required" }),
              },
            ],
            isError: true,
          };
        }
        try {
          await this.apiClient.updateCreative(params.accountId, params.creativeId, {
            intendedStatus: params.intendedStatus,
          });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  creativeId: params.creativeId,
                  intendedStatus: params.intendedStatus,
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

    // 6. get_creative_performance
    registry.register(
      {
        name: "linkedin_ads_get_creative_performance",
        description:
          "Retrieves performance metrics for creatives with standard KPIs, engagement breakdown (likes, comments, shares), and video metrics. Resolves creative names automatically.",
        inputSchema: {
          type: "object",
          properties: {
            accountId: { type: "string" },
            campaignIds: { type: "array", items: { type: "string" } },
            creativeIds: { type: "array", items: { type: "string" } },
            startDate: { type: "string" },
            endDate: { type: "string" },
            timeGranularity: { type: "string", enum: ["ALL", "DAILY"] },
            includeVideoMetrics: { type: "boolean", default: true },
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
          const analytics = await this.apiClient.getCreativePerformance({
            accountId: params.accountId,
            campaignIds: params.campaignIds,
            startDate: params.startDate,
            endDate: params.endDate,
            timeGranularity: params.timeGranularity,
            includeVideoMetrics: params.includeVideoMetrics,
          });

          const creativeIds = analytics.map((record: any) => record.pivotValues?.[0]?.split(":").pop()).filter(Boolean);
          const creativeMap = await this.apiClient.getCreativesByIds(params.accountId, creativeIds);

          const results = analytics.map((record: any) => {
            const creativeUrn = record.pivotValues?.[0] || "";
            const creativeId = creativeUrn.split(":").pop() || "";
            const creative = creativeMap.get(creativeId);
            const creativeName =
              creative?.name || creative?.content?.textAd?.text?.substring(0, 50) || `Creative ${creativeId}`;

            return {
              creativeId,
              creativeName,
              status: creative?.status || "Unknown",
              metrics: {
                ...calculateStandardMetrics(record),
                landingPageClicks: record.landingPageClicks || 0,
                likes: record.likes || 0,
                comments: record.comments || 0,
                shares: record.shares || 0,
                reactions: record.reactions || 0,
                follows: record.follows || 0,
                videoViews: record.videoViews || 0,
                videoCompletions: record.videoCompletions || 0,
                videoCompletionRate:
                  record.videoViews > 0
                    ? Number((((record.videoCompletions || 0) / record.videoViews) * 100).toFixed(2))
                    : null,
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
              likes: acc.likes + r.metrics.likes,
              comments: acc.comments + r.metrics.comments,
              shares: acc.shares + r.metrics.shares,
              videoViews: acc.videoViews + r.metrics.videoViews,
              videoCompletions: acc.videoCompletions + r.metrics.videoCompletions,
            }),
            {
              impressions: 0,
              clicks: 0,
              costInUsd: 0,
              totalEngagements: 0,
              externalWebsiteConversions: 0,
              approximateUniqueImpressions: 0,
              likes: 0,
              comments: 0,
              shares: 0,
              videoViews: 0,
              videoCompletions: 0,
            }
          );

          const totals = {
            ...calculateStandardMetrics(totalRecord),
            likes: totalRecord.likes,
            comments: totalRecord.comments,
            shares: totalRecord.shares,
            videoViews: totalRecord.videoViews,
            videoCompletions: totalRecord.videoCompletions,
            videoCompletionRate:
              totalRecord.videoViews > 0
                ? Number(((totalRecord.videoCompletions / totalRecord.videoViews) * 100).toFixed(2))
                : null,
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    creatives: results,
                    totals,
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

    // 7. upload_image
    registry.register(
      {
        name: "linkedin_ads_upload_image",
        description:
          "Uploads an image file to LinkedIn for use in ads. Supports PNG, JPG, and GIF. Returns the image URN to use as mediaId when creating inline ads.",
        inputSchema: {
          type: "object",
          properties: {
            organizationId: {
              type: "string",
              description: "Owner of the image. Can be organization URN or numeric ID",
            },
            filePath: { type: "string", description: "Absolute path to the image file" },
            accountId: { type: "string", description: "Optional: Ad Account ID to register in media library" },
            assetName: {
              type: "string",
              description: "Optional: Name for asset in media library (required if accountId provided)",
            },
          },
          required: ["organizationId", "filePath"],
        },
      },
      async (args: unknown) => {
        const params = args as Record<string, any>;
        if (!params.organizationId || !params.filePath) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "organizationId and filePath are required" }) }],
            isError: true,
          };
        }
        try {
          const result = await this.apiClient.uploadImage({
            owner: params.organizationId,
            filePath: params.filePath,
            accountId: params.accountId,
            assetName: params.assetName,
          });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  imageUrn: result.imageUrn,
                  message: `Use "${result.imageUrn}" as mediaId when creating ads.`,
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
  }
}

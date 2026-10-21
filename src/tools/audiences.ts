import type { LinkedInApiClient } from "../linkedin-client.js";
import type { ToolRegistry } from "../tool-registry.js";

const errorResult = (message: string) => ({
  content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
  isError: true,
});

export class AudienceTools {
  constructor(private readonly apiClient: LinkedInApiClient) {}

  registerTools(registry: ToolRegistry): void {
    registry.register(
      {
        name: "linkedin_ads_get_custom_audience",
        description:
          "Get a LinkedIn Matched Audience (DMP segment) by segment ID, including destination processing status.",
        inputSchema: {
          type: "object",
          properties: {
            segmentId: { type: "string", description: "DMP segment ID" },
          },
          required: ["segmentId"],
        },
      },
      async (args: unknown) => {
        const { segmentId } = args as { segmentId?: string };
        if (!segmentId) return errorResult("segmentId is required");
        try {
          const audience = await this.apiClient.getSavedAudience(segmentId);
          return {
            content: [{ type: "text", text: JSON.stringify(audience, null, 2) }],
          };
        } catch (error) {
          return errorResult(error instanceof Error ? error.message : String(error));
        }
      }
    );

    registry.register(
      {
        name: "linkedin_ads_create_custom_audience",
        description:
          "Create an empty LinkedIn Matched Audience. Requires rw_dmp_segments and a non-VIEWER ad account role. Streaming USER/COMPANY segments can receive records with the audience member tools.",
        inputSchema: {
          type: "object",
          properties: {
            accountId: { type: "string", description: "LinkedIn sponsored account ID" },
            name: { type: "string" },
            description: { type: "string" },
            type: {
              type: "string",
              enum: ["USER", "COMPANY", "USER_LIST_UPLOAD", "COMPANY_LIST_UPLOAD"],
            },
            sourcePlatform: {
              type: "string",
              enum: ["DIRECT_API", "AGENCY_API", "PARTNER_API", "LIST_UPLOAD"],
              default: "DIRECT_API",
            },
            sourceSegmentId: { type: "string" },
          },
          required: ["accountId", "name", "type"],
        },
      },
      async (args: unknown) => {
        const params = args as Record<string, string | undefined>;
        if (!params.accountId || !params.name || !params.type) {
          return errorResult("accountId, name, and type are required");
        }
        const sourcePlatform = params.sourcePlatform ?? "DIRECT_API";
        const isListType = params.type.endsWith("_LIST_UPLOAD");
        if (isListType !== (sourcePlatform === "LIST_UPLOAD")) {
          return errorResult(
            "USER_LIST_UPLOAD and COMPANY_LIST_UPLOAD require sourcePlatform=LIST_UPLOAD; streaming USER and COMPANY segments require DIRECT_API, AGENCY_API, or PARTNER_API"
          );
        }
        try {
          const result = await this.apiClient.createSavedAudience({
            accountId: params.accountId,
            name: params.name,
            type: params.type as "USER" | "COMPANY" | "USER_LIST_UPLOAD" | "COMPANY_LIST_UPLOAD",
            sourcePlatform: sourcePlatform as "DIRECT_API" | "AGENCY_API" | "PARTNER_API" | "LIST_UPLOAD",
            description: params.description,
            sourceSegmentId: params.sourceSegmentId,
          });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ success: true, segmentId: result.id }),
              },
            ],
          };
        } catch (error) {
          return errorResult(error instanceof Error ? error.message : String(error));
        }
      },
      { mutating: true }
    );

    registry.register(
      {
        name: "linkedin_ads_update_custom_audience",
        description:
          "Update a Matched Audience name, description, or sourceSegmentId. LinkedIn does not allow changing its account, type, source platform, or destination.",
        inputSchema: {
          type: "object",
          properties: {
            segmentId: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            sourceSegmentId: { type: "string" },
          },
          required: ["segmentId"],
        },
      },
      async (args: unknown) => {
        const params = args as Record<string, unknown>;
        if (typeof params.segmentId !== "string") {
          return errorResult("segmentId is required");
        }
        const updates: { name?: string; description?: string; sourceSegmentId?: string } = {};
        for (const key of ["name", "description", "sourceSegmentId"] as const) {
          if (typeof params[key] === "string") updates[key] = params[key];
        }
        if (!Object.keys(updates).length) {
          return errorResult("At least one update field is required");
        }
        try {
          await this.apiClient.updateSavedAudience(params.segmentId, updates);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  segmentId: params.segmentId,
                  updatedFields: Object.keys(updates),
                }),
              },
            ],
          };
        } catch (error) {
          return errorResult(error instanceof Error ? error.message : String(error));
        }
      },
      { mutating: true }
    );

    registry.register(
      {
        name: "linkedin_ads_delete_custom_audience",
        description: "Permanently delete a LinkedIn Matched Audience (DMP segment).",
        inputSchema: {
          type: "object",
          properties: { segmentId: { type: "string" } },
          required: ["segmentId"],
        },
      },
      async (args: unknown) => {
        const { segmentId } = args as { segmentId?: string };
        if (!segmentId) return errorResult("segmentId is required");
        try {
          await this.apiClient.deleteSavedAudience(segmentId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ success: true, segmentId, deleted: true }),
              },
            ],
          };
        } catch (error) {
          return errorResult(error instanceof Error ? error.message : String(error));
        }
      },
      { mutating: true }
    );

    registry.register(
      {
        name: "linkedin_ads_mutate_custom_audience_users",
        description:
          "Add or remove up to 5,000 people from a streaming USER audience. Email identifiers must already be normalized and SHA-256/SHA-512 hashed; do not send plaintext email addresses.",
        inputSchema: {
          type: "object",
          properties: {
            segmentId: { type: "string" },
            users: {
              type: "array",
              minItems: 1,
              maxItems: 5000,
              items: {
                type: "object",
                properties: {
                  action: { type: "string", enum: ["ADD", "REMOVE"] },
                  userIds: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        idType: {
                          type: "string",
                          enum: ["SHA256_EMAIL", "SHA512_EMAIL", "GOOGLE_AID"],
                        },
                        idValue: { type: "string" },
                      },
                      required: ["idType", "idValue"],
                    },
                  },
                  firstName: { type: "string" },
                  lastName: { type: "string" },
                  title: { type: "string" },
                  company: { type: "string" },
                  country: { type: "string", description: "Two-letter ISO country code" },
                },
                required: ["action"],
              },
            },
          },
          required: ["segmentId", "users"],
        },
      },
      async (args: unknown) => {
        const { segmentId, users } = args as {
          segmentId?: string;
          users?: Array<Record<string, unknown>>;
        };
        if (!segmentId || !Array.isArray(users) || !users.length) {
          return errorResult("segmentId and at least one user are required");
        }
        if (users.length > 5000) return errorResult("A batch can contain at most 5,000 users");
        try {
          const result = await this.apiClient.mutateSavedAudienceUsers(segmentId, users);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          return errorResult(error instanceof Error ? error.message : String(error));
        }
      },
      { mutating: true }
    );

    registry.register(
      {
        name: "linkedin_ads_mutate_custom_audience_companies",
        description: "Add or remove up to 5,000 companies from a streaming COMPANY audience.",
        inputSchema: {
          type: "object",
          properties: {
            segmentId: { type: "string" },
            companies: {
              type: "array",
              minItems: 1,
              maxItems: 5000,
              items: {
                type: "object",
                properties: {
                  action: { type: "string", enum: ["ADD", "REMOVE"] },
                  companyName: { type: "string" },
                  companyWebsiteDomain: { type: "string" },
                  companyPageUrl: { type: "string" },
                  stockSymbol: { type: "string" },
                  industries: { type: "array", items: { type: "string" } },
                  city: { type: "string" },
                  state: { type: "string" },
                  country: { type: "string", description: "Two-letter ISO country code" },
                },
                required: ["action"],
              },
            },
          },
          required: ["segmentId", "companies"],
        },
      },
      async (args: unknown) => {
        const { segmentId, companies } = args as {
          segmentId?: string;
          companies?: Array<Record<string, unknown>>;
        };
        if (!segmentId || !Array.isArray(companies) || !companies.length) {
          return errorResult("segmentId and at least one company are required");
        }
        if (companies.length > 5000) {
          return errorResult("A batch can contain at most 5,000 companies");
        }
        try {
          const result = await this.apiClient.mutateSavedAudienceCompanies(segmentId, companies);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          return errorResult(error instanceof Error ? error.message : String(error));
        }
      },
      { mutating: true }
    );
  }
}

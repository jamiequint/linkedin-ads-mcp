import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "./config.js";
import { LinkedInApiClient } from "./linkedin-client.js";
import { ToolRegistry } from "./tool-registry.js";
import { AccountTools } from "./tools/accounts.js";
import { CampaignGroupTools } from "./tools/campaign-groups.js";
import { CampaignTools } from "./tools/campaigns.js";
import { CreativeTools } from "./tools/creatives.js";
import { ReportingTools } from "./tools/reporting.js";
import { DemographicsTools } from "./tools/demographics.js";
import { ConversionsTools } from "./tools/conversions.js";
import { AnalyticsTools } from "./tools/analytics.js";
import { AudienceTools } from "./tools/audiences.js";

export class LinkedInAdsMcpServer {
  private server: Server;
  private apiClient: LinkedInApiClient;
  private toolRegistry: ToolRegistry;

  constructor(config: Config) {
    this.server = new Server(
      {
        name: config.MCP_SERVER_NAME,
        version: config.MCP_SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    this.apiClient = new LinkedInApiClient(config);
    this.toolRegistry = new ToolRegistry(config.LINKEDIN_ENABLE_WRITES);

    // Register all tool modules
    new AccountTools(this.apiClient).registerTools(this.toolRegistry);
    new CampaignGroupTools(this.apiClient).registerTools(this.toolRegistry);
    new CampaignTools(this.apiClient).registerTools(this.toolRegistry);
    new CreativeTools(this.apiClient).registerTools(this.toolRegistry);
    new ReportingTools(this.apiClient).registerTools(this.toolRegistry);
    new DemographicsTools(this.apiClient).registerTools(this.toolRegistry);
    new ConversionsTools(this.apiClient).registerTools(this.toolRegistry);
    new AnalyticsTools(this.apiClient).registerTools(this.toolRegistry);
    new AudienceTools(this.apiClient).registerTools(this.toolRegistry);
  }

  async start(): Promise<void> {
    this.setupHandlers();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.toolRegistry.getToolList(),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const handler = this.toolRegistry.getHandler(name);

      if (!handler) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Tool "${name}" not found`,
            },
          ],
          isError: true,
        };
      }

      try {
        const result = await handler(args);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error executing tool "${name}": ${message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }
}

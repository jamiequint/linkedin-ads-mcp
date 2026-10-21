import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface McpTool extends Tool {}

export type ToolHandler = (args: unknown) => Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}>;

export interface ToolRegistrationOptions {
  mutating?: boolean;
}

export class ToolRegistry {
  private tools = new Map<string, McpTool>();
  private handlers = new Map<string, ToolHandler>();
  private mutatingTools = new Set<string>();

  constructor(private readonly writesEnabled = false) {}

  register(tool: McpTool, handler: ToolHandler, options: ToolRegistrationOptions = {}): void {
    this.tools.set(tool.name, tool);
    this.handlers.set(tool.name, handler);
    if (options.mutating) {
      this.mutatingTools.add(tool.name);
    }
  }

  getToolList(): McpTool[] {
    return Array.from(this.tools.values()).filter((tool) => this.writesEnabled || !this.mutatingTools.has(tool.name));
  }

  getHandler(name: string): ToolHandler | undefined {
    if (!this.writesEnabled && this.mutatingTools.has(name)) {
      return async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: `Tool "${name}" is disabled because this server is read-only. Set LINKEDIN_ENABLE_WRITES=true and restart the server to enable mutating tools.`,
              code: "WRITES_DISABLED",
            }),
          },
        ],
        isError: true,
      });
    }
    return this.handlers.get(name);
  }
}

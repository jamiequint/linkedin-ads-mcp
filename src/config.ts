export interface Config {
  LINKEDIN_ACCESS_TOKEN: string;
  LINKEDIN_API_VERSION: string;
  LINKEDIN_ENABLE_WRITES: boolean;
  MCP_SERVER_NAME: string;
  MCP_SERVER_VERSION: string;
}

function parseBoolean(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function loadConfig(): Config {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Missing required environment variable: LINKEDIN_ACCESS_TOKEN");
  }

  return {
    LINKEDIN_ACCESS_TOKEN: accessToken,
    LINKEDIN_API_VERSION: process.env.LINKEDIN_API_VERSION ?? "202610",
    LINKEDIN_ENABLE_WRITES: parseBoolean(process.env.LINKEDIN_ENABLE_WRITES),
    MCP_SERVER_NAME: process.env.MCP_SERVER_NAME ?? "linkedin-ads-mcp",
    MCP_SERVER_VERSION: process.env.MCP_SERVER_VERSION ?? "1.0.0",
  };
}

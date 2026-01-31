/**
 * Spond MCP Client - Fetches net session dates from Spond via MCP.
 *
 * Uses the GenKit MCP client to connect to the Spond MCP server which
 * provides tools for fetching Desperados cricket session data.
 */

import { createMcpClient, GenkitMcpClient } from "@genkit-ai/mcp";
import { Genkit, ToolAction } from "genkit";

const SPOND_MCP_URL =
  "https://us-central1-spond-mcp-server.cloudfunctions.net/mcp/mcp";

let spondClient: GenkitMcpClient | null = null;

/**
 * Get or create the Spond MCP client instance.
 * Uses lazy initialization - connection is established on first use.
 */
function getSpondClient(): GenkitMcpClient {
  if (!spondClient) {
    spondClient = createMcpClient({
      name: "spond",
      mcpServer: { url: SPOND_MCP_URL },
    });
  }
  return spondClient;
}

/**
 * Get all tools provided by the Spond MCP server.
 * Tools are namespaced as "spond/<tool_name>" (e.g., "spond/get_desperados_events").
 *
 * @param ai - The GenKit instance to register tools with
 * @returns Array of tool actions from the MCP server
 */
export async function defineSpondTools(ai: Genkit): Promise<ToolAction[]> {
  const client = getSpondClient();
  try {
    await client.ready();
    return await client.getActiveTools(ai);
  } catch (error) {
    console.error("Failed to get Spond tools:", error);
    return [];
  }
}

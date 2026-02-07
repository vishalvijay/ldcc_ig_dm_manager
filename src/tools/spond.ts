/**
 * Spond MCP Client - Fetches net session dates from Spond via MCP.
 *
 * Uses defineMcpClient to register a Dynamic Action Provider (DAP) in GenKit's
 * registry. Tools are referenced by the string "spond:tool/*" rather than
 * resolved ToolAction objects, avoiding the "already registered" errors that
 * occur when dynamic tools are re-registered on every LLM round-trip.
 */

import { defineMcpClient } from "@genkit-ai/mcp";
import { Genkit } from "genkit";

const SPOND_MCP_URL =
  "https://us-central1-spond-mcp-server.cloudfunctions.net/mcp/mcp";

/** String ref for all Spond tools — passed directly in the tools array. */
export const SPOND_TOOL_REF = "spond:tool/*";

let initialized = false;

/**
 * Register the Spond MCP client as a Dynamic Action Provider.
 * Must be called once before using SPOND_TOOL_REF in ai.generate().
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initSpondMcp(ai: Genkit): void {
  if (initialized) return;
  defineMcpClient(ai, {
    name: "spond",
    mcpServer: { url: SPOND_MCP_URL },
  });
  initialized = true;
}

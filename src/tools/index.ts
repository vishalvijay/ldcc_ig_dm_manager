/**
 * Tools Registry - Central registration of all GenKit tools.
 *
 * Combines MCP tools (Spond) with locally defined tools (Firestore, Instagram, WhatsApp).
 */

import { z } from "zod";
import { Genkit, ToolAction, ToolArgument } from "genkit";
import { initSpondMcp, SPOND_TOOL_REF } from "./spond";
import { defineFirestoreTools } from "./firestore";
import { defineInstagramTools } from "./instagram";
import { defineWhatsAppTools } from "./whatsapp";

// Cache the loading promise to avoid race conditions with concurrent requests
let toolsPromise: Promise<ToolArgument[]> | null = null;

/**
 * Get all available tools for the AI agent.
 * Combines MCP tools (Spond) with locally defined tools (Firestore, Instagram, WhatsApp).
 * Caches the loading promise so concurrent callers await the same registration,
 * preventing "already registered" errors from GenKit.
 *
 * @param ai - The GenKit instance to register tools with
 * @returns Array of all available tool arguments (ToolActions and string refs)
 */
export async function getAllTools(ai: Genkit): Promise<ToolArgument[]> {
  if (!toolsPromise) {
    toolsPromise = loadAllTools(ai);
  }
  return toolsPromise;
}

async function loadAllTools(ai: Genkit): Promise<ToolArgument[]> {
  // Register Spond MCP as a Dynamic Action Provider (sync, no await needed)
  initSpondMcp(ai);

  // Define local tools
  const firestoreTools = defineFirestoreTools(ai);
  const instagramTools = defineInstagramTools(ai);
  const whatsappTools = defineWhatsAppTools(ai);

  // No-op tool for when the LLM decides no response is needed
  const noAction = ai.defineTool(
    {
      name: "no_action",
      description:
        "Use when no response is needed — e.g. user just reacted to your message, duplicate/spam messages, or the conversation already ends with your message.",
      inputSchema: z.object({
        reason: z.string().optional().describe("Why no action is needed"),
      }),
      outputSchema: z.object({ success: z.literal(true) }),
    },
    async () => ({ success: true as const })
  );

  const localTools: ToolAction[] = [
    ...firestoreTools,
    ...instagramTools,
    ...whatsappTools,
    noAction,
  ];

  const allTools: ToolArgument[] = [SPOND_TOOL_REF, ...localTools];

  console.log(
    `Loaded ${localTools.length} local tools: ${localTools.map((t) => t.__action.name).join(", ")}; ` +
      `MCP refs: ${SPOND_TOOL_REF}`
  );

  return allTools;
}

// Re-export for convenience
export { initSpondMcp, SPOND_TOOL_REF } from "./spond";
export { defineFirestoreTools } from "./firestore";
export { defineInstagramTools } from "./instagram";
export { defineWhatsAppTools } from "./whatsapp";

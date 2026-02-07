/**
 * Tools Registry - Central registration of all GenKit tools.
 *
 * Combines MCP tools (Spond) with locally defined tools (Firestore, Instagram, WhatsApp).
 */

import { Genkit, ToolAction } from "genkit";
import { defineSpondTools } from "./spond";
import { defineFirestoreTools } from "./firestore";
import { defineInstagramTools } from "./instagram";
import { defineWhatsAppTools } from "./whatsapp";

// Cache tools to avoid re-registering on every invocation within the same process
let cachedTools: ToolAction[] | null = null;

/**
 * Get all available tools for the AI agent.
 * Combines MCP tools (Spond) with locally defined tools (Firestore, Instagram, WhatsApp).
 * Tools are cached after first registration to avoid GenKit registry conflicts.
 *
 * @param ai - The GenKit instance to register tools with
 * @returns Array of all available tool actions
 */
export async function getAllTools(ai: Genkit): Promise<ToolAction[]> {
  if (cachedTools) {
    return cachedTools;
  }

  // Get MCP tools (external servers)
  const spondTools = await defineSpondTools(ai);

  // Define local tools
  const firestoreTools = defineFirestoreTools(ai);
  const instagramTools = defineInstagramTools(ai);
  const whatsappTools = defineWhatsAppTools(ai);

  cachedTools = [
    ...spondTools,
    ...firestoreTools,
    ...instagramTools,
    ...whatsappTools,
  ];

  console.log(
    `Loaded ${cachedTools.length} tools: ${cachedTools.map((t) => t.__action.name).join(", ")}`
  );

  return cachedTools;
}

// Re-export for convenience
export { defineSpondTools } from "./spond";
export { defineFirestoreTools } from "./firestore";
export { defineInstagramTools } from "./instagram";
export { defineWhatsAppTools } from "./whatsapp";

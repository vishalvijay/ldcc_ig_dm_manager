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

/**
 * Get all available tools for the AI agent.
 * Combines MCP tools (Spond) with locally defined tools (Firestore, Instagram, WhatsApp).
 *
 * @param ai - The GenKit instance to register tools with
 * @returns Array of all available tool actions
 */
export async function getAllTools(ai: Genkit): Promise<ToolAction[]> {
  // Get MCP tools (external servers)
  const spondTools = await defineSpondTools(ai);

  // Define local tools
  const firestoreTools = defineFirestoreTools(ai);
  const instagramTools = defineInstagramTools(ai);
  const whatsappTools = defineWhatsAppTools(ai);

  const allTools = [
    ...spondTools,
    ...firestoreTools,
    ...instagramTools,
    ...whatsappTools,
  ];

  console.log(
    `Loaded ${allTools.length} tools: ${allTools.map((t) => t.__action.name).join(", ")}`
  );

  return allTools;
}

// Re-export for convenience
export { defineSpondTools } from "./spond";
export { defineFirestoreTools } from "./firestore";
export { defineInstagramTools } from "./instagram";
export { defineWhatsAppTools } from "./whatsapp";

/**
 * WhatsApp Tools - API interaction stubs.
 *
 * These tools will be implemented in Sprint 5.
 * Currently provides stub implementations that throw "Not implemented".
 */

import { z } from "zod";
import { Genkit, ToolAction } from "genkit";

// =============================================================================
// Schema Definitions
// =============================================================================

const SendManagerNotificationInputSchema = z.object({
  reason: z.string().describe("Brief reason for the notification"),
  summary: z.string().describe("Summary of the conversation for manager context"),
  userId: z.string().describe("Instagram user ID of the person being discussed"),
  threadId: z.string().optional().describe("Instagram thread ID for reference"),
  priority: z
    .enum(["low", "normal", "high"])
    .optional()
    .default("normal")
    .describe("Priority level of the notification"),
});

const SendManagerNotificationOutputSchema = z.object({
  success: z.boolean(),
  messageId: z.string().optional().describe("WhatsApp message ID if sent successfully"),
  error: z.string().optional().describe("Error message if failed"),
});

// =============================================================================
// Tool Definitions
// =============================================================================

/**
 * Define WhatsApp tools for the GenKit AI instance.
 * These are stubs for Sprint 5 implementation.
 */
export function defineWhatsAppTools(ai: Genkit): ToolAction[] {
  const sendManagerNotification = ai.defineTool(
    {
      name: "sendManagerNotification",
      description:
        "Send a WhatsApp notification to the manager (Vishal) about an inquiry that needs attention. Use this for non-joining inquiries, confirmed bookings, or unusual situations.",
      inputSchema: SendManagerNotificationInputSchema,
      outputSchema: SendManagerNotificationOutputSchema,
    },
    async (_input) => {
      // TODO: Implement in Sprint 5
      throw new Error(
        "sendManagerNotification is not yet implemented. Will be added in Sprint 5."
      );
    }
  );

  return [sendManagerNotification];
}

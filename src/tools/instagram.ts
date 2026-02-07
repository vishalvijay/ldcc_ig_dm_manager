/**
 * Instagram Tools - API interaction and action tools.
 *
 * Uses InstagramService for Graph API operations.
 * Provides tools for executing actions (send messages, react).
 */

import { z } from "zod";
import { Genkit, ToolAction } from "genkit";
import { getInstagramService } from "../services/instagram";

// =============================================================================
// Schema Definitions - Action Tools
// =============================================================================

const SendMessageInputSchema = z.object({
  recipientId: z.string().describe("The Instagram user ID to send the message to"),
  text: z.string().describe("The message text to send"),
});

const SendMessageOutputSchema = z.object({
  success: z.boolean(),
  messageId: z.string().optional().describe("The sent message ID if successful"),
  error: z.string().optional().describe("Error message if failed"),
});

const ReactToMessageInputSchema = z.object({
  messageId: z.string().describe("The message ID to react to"),
  reaction: z.enum(["love", "like", "laugh", "wow", "sad", "angry"]).describe("The reaction to send"),
});

const ReactToMessageOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional().describe("Error message if failed"),
});

// =============================================================================
// Tool Definitions
// =============================================================================

/**
 * Define Instagram tools for the GenKit AI instance.
 * Provides action tools for sending messages and reactions.
 */
export function defineInstagramTools(ai: Genkit): ToolAction[] {
  const sendMessage = ai.defineTool(
    {
      name: "send_instagram_message",
      description:
        "Send a message to the user on Instagram. Use this to reply to their inquiry. The message will be sent immediately.",
      inputSchema: SendMessageInputSchema,
      outputSchema: SendMessageOutputSchema,
    },
    async (input) => {
      try {
        const instagram = getInstagramService();
        const messageId = await instagram.sendMessage(input.recipientId, input.text);
        return { success: true, messageId };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: errorMessage };
      }
    }
  );

  const reactToMessage = ai.defineTool(
    {
      name: "react_to_instagram_message",
      description:
        "React to a specific Instagram message with an emoji reaction. Use this to acknowledge messages, show appreciation, or express sentiment.",
      inputSchema: ReactToMessageInputSchema,
      outputSchema: ReactToMessageOutputSchema,
    },
    async (input) => {
      try {
        const instagram = getInstagramService();
        await instagram.sendReaction(input.messageId, input.reaction);
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: errorMessage };
      }
    }
  );

  return [sendMessage, reactToMessage];
}

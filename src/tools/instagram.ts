/**
 * Instagram Tools - API interaction and action tools.
 *
 * Uses InstagramService for Graph API operations.
 * Provides tools for reading threads and executing actions.
 */

import { z } from "zod";
import { Genkit, ToolAction } from "genkit";
import { getInstagramService } from "../services/instagram";

// =============================================================================
// Schema Definitions - Read Tools
// =============================================================================

const GetThreadMessagesInputSchema = z.object({
  threadId: z.string().describe("The Instagram thread ID"),
  limit: z.number().optional().default(20).describe("Maximum number of messages to fetch"),
});

const GetThreadMessagesOutputSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      from: z.string(),
      timestamp: z.number(),
    })
  ),
});

const IsNewThreadInputSchema = z.object({
  threadId: z.string().describe("The Instagram thread ID to check"),
});

const IsNewThreadOutputSchema = z.object({
  isNew: z.boolean().describe("True if this is a new conversation with no prior messages"),
  messageCount: z.number().optional().describe("Number of messages in the thread"),
});

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
 * Includes both read tools and action tools.
 */
export function defineInstagramTools(ai: Genkit): ToolAction[] {
  // Read Tools
  const getThreadMessages = ai.defineTool(
    {
      name: "getThreadMessages",
      description:
        "Fetch messages from an Instagram thread using the Graph API. Use this to get the full conversation history directly from Instagram.",
      inputSchema: GetThreadMessagesInputSchema,
      outputSchema: GetThreadMessagesOutputSchema,
    },
    async (input) => {
      const instagram = getInstagramService();
      const messages = await instagram.getThreadMessages(input.threadId, input.limit);

      return {
        messages: messages.map((m) => ({
          id: m.id,
          text: m.text,
          from: m.senderId,
          timestamp: m.timestamp,
        })),
      };
    }
  );

  const isNewThread = ai.defineTool(
    {
      name: "isNewThread",
      description:
        "Check if this is a new Instagram thread (first message from user). Useful for determining if this is a first-time inquiry.",
      inputSchema: IsNewThreadInputSchema,
      outputSchema: IsNewThreadOutputSchema,
    },
    async (input) => {
      const instagram = getInstagramService();
      const messages = await instagram.getThreadMessages(input.threadId, 5);

      return {
        isNew: messages.length <= 1,
        messageCount: messages.length,
      };
    }
  );

  // Action Tools
  const sendMessage = ai.defineTool(
    {
      name: "sendInstagramMessage",
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
      name: "reactToInstagramMessage",
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

  return [getThreadMessages, isNewThread, sendMessage, reactToMessage];
}

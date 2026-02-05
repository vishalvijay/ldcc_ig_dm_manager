/**
 * DM Agent Flow - Core LLM-powered conversation handler.
 *
 * Uses GenKit with Gemini to process Instagram DM conversations.
 * The LLM directly calls tools to execute actions (send messages, react, notify).
 */

import { z } from "zod";
import * as logger from "firebase-functions/logger";
import { ai } from "../config/genkit";
import { SYSTEM_PROMPT } from "../prompts/system";
import { getAllTools } from "../tools";

/**
 * Input schema for the DM Agent flow.
 * Matches the ConversationContext interface but as a Zod schema for validation.
 */
export const DmAgentInputSchema = z.object({
  conversationId: z.string().describe("Unique identifier for this conversation"),
  sender: z.object({
    id: z.string().describe("Instagram user ID"),
    username: z.string().optional().describe("Instagram username"),
    name: z.string().optional().describe("User's display name"),
  }),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        timestamp: z.number(),
        messageId: z.string().optional(),
      })
    )
    .describe("Conversation history"),
  currentMessage: z.object({
    id: z.string(),
    senderId: z.string(),
    recipientId: z.string(),
    text: z.string(),
    timestamp: z.number(),
    messageType: z.enum([
      "text",
      "image",
      "video",
      "audio",
      "file",
      "share",
      "story_mention",
      "story_reply",
      "reel",
      "ig_reel",
      "other",
    ]),
    replyToMessageId: z.string().optional(),
  }),
});

export type DmAgentInput = z.infer<typeof DmAgentInputSchema>;

/**
 * Output schema for the DM Agent flow.
 * Simple result indicating what actions were taken.
 */
export const DmAgentOutputSchema = z.object({
  success: z.boolean().describe("Whether the agent completed successfully"),
  thinking: z.string().optional().describe("Agent's reasoning about the response"),
  actionsExecuted: z.array(z.string()).describe("List of action tool names that were called"),
  error: z.string().optional().describe("Error message if failed"),
});

export type DmAgentOutput = z.infer<typeof DmAgentOutputSchema>;

/**
 * Build context string with IDs the agent needs for tool calls.
 */
function buildContextInfo(context: DmAgentInput): string {
  const userInfo = context.sender.username
    ? `@${context.sender.username}`
    : context.sender.name || "Unknown";

  return `
## Current Context
- User Instagram ID (use for sendInstagramMessage recipientId): ${context.sender.id}
- User: ${userInfo}
- Current Message ID (use for reactToInstagramMessage): ${context.currentMessage.id}
- Conversation ID: ${context.conversationId}
`;
}

/**
 * Main DM Agent flow.
 *
 * Processes conversation context and executes actions via tool calls.
 * The LLM decides what actions to take and calls tools directly.
 */
export const dmAgentFlow = ai.defineFlow(
  {
    name: "dmAgent",
    inputSchema: DmAgentInputSchema,
    outputSchema: DmAgentOutputSchema,
  },
  async (context: DmAgentInput): Promise<DmAgentOutput> => {
    try {
      // Build message history for the LLM
      // Include the current message in the conversation
      const allMessages = [
        ...context.messages,
        {
          role: "user" as const,
          content: context.currentMessage.text,
          timestamp: context.currentMessage.timestamp,
          messageId: context.currentMessage.id,
        },
      ];

      // Format conversation for GenKit
      // GenKit uses "model" instead of "assistant" for AI messages
      const conversationHistory = allMessages.map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        content: [{ text: m.content }],
      }));

      // Add context about message type if not a simple text message
      let messageTypeContext = "";
      if (context.currentMessage.messageType === "story_mention") {
        messageTypeContext =
          "\n[Note: This message is a story mention - the user mentioned LDCC in their story]";
      } else if (context.currentMessage.messageType === "story_reply") {
        messageTypeContext =
          "\n[Note: This message is a reply to an LDCC story]";
      } else if (context.currentMessage.messageType === "image") {
        messageTypeContext =
          "\n[Note: This message contains an image - the text shown is any accompanying caption]";
      }

      // Build the full system prompt with context
      const contextInfo = buildContextInfo(context);
      const fullSystemPrompt = SYSTEM_PROMPT + contextInfo + messageTypeContext;

      // Get all available tools for the agent
      const tools = await getAllTools(ai);

      logger.info("Invoking LLM with tools", {
        conversationId: context.conversationId,
        toolCount: tools.length,
        messageCount: conversationHistory.length,
      });

      // Generate response - LLM will call tools directly
      const response = await ai.generate({
        system: fullSystemPrompt,
        messages: conversationHistory,
        tools,
      });

      // Track which tools were called
      const toolCalls = response.toolRequests || [];
      const actionsExecuted = toolCalls.map((tc) => tc.toolRequest.name);

      logger.info("Agent completed", {
        conversationId: context.conversationId,
        actionsExecuted,
        responseText: response.text?.substring(0, 100),
      });

      return {
        success: true,
        thinking: response.text || undefined,
        actionsExecuted,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Agent flow failed", {
        conversationId: context.conversationId,
        error: errorMessage,
      });

      return {
        success: false,
        actionsExecuted: [],
        error: errorMessage,
      };
    }
  }
);

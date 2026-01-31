/**
 * DM Agent Flow - Core LLM-powered conversation handler.
 *
 * Uses GenKit with Gemini to process Instagram DM conversations
 * and return structured actions.
 */

import { z } from "zod";
import { ai } from "../config/genkit";
import { SYSTEM_PROMPT } from "../prompts/system";
import {
  AgentResponseSchema,
  AgentResponse,
} from "../types";
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
    messageType: z.enum(["text", "image", "story_mention", "story_reply", "other"]),
    replyToMessageId: z.string().optional(),
  }),
});

export type DmAgentInput = z.infer<typeof DmAgentInputSchema>;

/**
 * Main DM Agent flow.
 *
 * Processes conversation context and generates structured responses
 * using the LLM with club knowledge from the system prompt.
 */
export const dmAgentFlow = ai.defineFlow(
  {
    name: "dmAgent",
    inputSchema: DmAgentInputSchema,
    outputSchema: AgentResponseSchema,
  },
  async (context: DmAgentInput): Promise<AgentResponse> => {
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
    let additionalContext = "";
    if (context.currentMessage.messageType === "story_mention") {
      additionalContext =
        "\n[Note: This message is a story mention - the user mentioned LDCC in their story]";
    } else if (context.currentMessage.messageType === "story_reply") {
      additionalContext =
        "\n[Note: This message is a reply to an LDCC story]";
    } else if (context.currentMessage.messageType === "image") {
      additionalContext =
        "\n[Note: This message contains an image - the text shown is any accompanying caption]";
    }

    // Get all available tools for the agent
    const tools = await getAllTools(ai);

    // Generate structured response
    const response = await ai.generate({
      system: SYSTEM_PROMPT + additionalContext,
      messages: conversationHistory,
      tools,
      output: { schema: AgentResponseSchema },
    });

    // Ensure we have a valid output
    if (!response.output) {
      // Fallback response if parsing fails
      return {
        thinking: "Failed to generate structured response",
        actions: [
          {
            type: "notifyManager",
            reason: "Agent failed to generate response",
            summary: `User ${context.sender.username || context.sender.id} sent: "${context.currentMessage.text}"`,
          },
        ],
      };
    }

    return response.output;
  }
);

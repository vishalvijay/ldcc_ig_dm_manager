/**
 * DM Agent Flow - Core LLM-powered conversation handler.
 *
 * Uses GenKit with a configurable LLM to process Instagram DM conversations.
 * The LLM directly calls tools to execute actions (send messages, react, notify).
 */

import { z } from "zod";
import * as logger from "firebase-functions/logger";
import { ai } from "../config/genkit";
import { getDb } from "../config/firebase";
import { SYSTEM_PROMPT } from "../prompts/system";
import { getAllTools } from "../tools";
import { resetMessageSentFlag } from "../tools/instagram";

/**
 * Input schema for the DM Agent flow.
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
  latestUserMessageId: z.string().describe("Message ID of the latest user message (for reactions)"),
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
async function buildContextInfo(context: DmAgentInput): Promise<string> {
  const userInfo = context.sender.username
    ? `@${context.sender.username}`
    : context.sender.name || "Unknown";

  let escalated = false;
  try {
    const threadDoc = await getDb().collection("threads").doc(context.conversationId).get();
    escalated = threadDoc.exists && threadDoc.data()?.escalated === true;
  } catch (error) {
    logger.warn("Failed to read thread escalation status", {
      conversationId: context.conversationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  return `
## Current Context
- User Instagram ID (use for recipientId in send_instagram_message and react_to_instagram_message): ${context.sender.id}
- User: ${userInfo}
- Latest User Message ID (use for react_to_instagram_message): ${context.latestUserMessageId}
- Conversation ID: ${context.conversationId}
- Escalated to manager: ${escalated} (if true, do not respond — use no_action)
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
      // Format conversation for GenKit
      // GenKit uses "model" instead of "assistant" for AI messages
      // Conversation already includes both user and assistant messages from Instagram API
      const conversationHistory = context.messages.map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        content: [{ text: m.content }],
      }));

      // Build the full system prompt with context
      const contextInfo = await buildContextInfo(context);
      const fullSystemPrompt = SYSTEM_PROMPT + contextInfo;

      // Get all available tools for the agent
      const tools = await getAllTools(ai);

      logger.info("Invoking LLM with tools", {
        conversationId: context.conversationId,
        toolCount: tools.length,
        messageCount: conversationHistory.length,
      });

      // Reset session guard before generating — allows exactly one send per invocation
      resetMessageSentFlag();

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

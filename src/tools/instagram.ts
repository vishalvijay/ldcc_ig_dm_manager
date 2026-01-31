/**
 * Instagram Tools - API interaction stubs.
 *
 * These tools will be implemented in Sprint 4.
 * Currently provides stub implementations that throw "Not implemented".
 */

import { z } from "zod";
import { Genkit, ToolAction } from "genkit";

// =============================================================================
// Schema Definitions
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
// Tool Definitions
// =============================================================================

/**
 * Define Instagram tools for the GenKit AI instance.
 * These are stubs for Sprint 4 implementation.
 */
export function defineInstagramTools(ai: Genkit): ToolAction[] {
  const getThreadMessages = ai.defineTool(
    {
      name: "getThreadMessages",
      description:
        "Fetch messages from an Instagram thread using the Graph API. Use this to get the full conversation history directly from Instagram.",
      inputSchema: GetThreadMessagesInputSchema,
      outputSchema: GetThreadMessagesOutputSchema,
    },
    async (_input) => {
      // TODO: Implement in Sprint 4
      throw new Error(
        "getThreadMessages is not yet implemented. Will be added in Sprint 4."
      );
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
    async (_input) => {
      // TODO: Implement in Sprint 4
      throw new Error(
        "isNewThread is not yet implemented. Will be added in Sprint 4."
      );
    }
  );

  return [getThreadMessages, isNewThread];
}

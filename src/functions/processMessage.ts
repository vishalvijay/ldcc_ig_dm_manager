/**
 * Message Processor - Cloud Task callback for processing Instagram messages.
 *
 * Uses Firebase onTaskDispatched which handles authentication automatically.
 * Acquires a thread lock, fetches conversation history from the Instagram API,
 * and invokes the dmAgentFlow which handles actions via tool calls.
 */

import * as logger from "firebase-functions/logger";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import {
  acquireThreadLock,
  releaseThreadLockAndCheck,
  scheduleProcessing,
} from "../services/messageStore";
import { REGION } from "../config";
import { getInstagramService } from "../services/instagram";
import { dmAgentFlow, DmAgentInput } from "../flows/dmAgent";
import { ConversationMessage } from "../types";

interface ProcessMessagePayload {
  threadId: string;
}

/**
 * Process Message Function - Cloud Task callback.
 *
 * This function is called by Cloud Tasks after the debounce delay.
 * It acquires a thread lock, fetches conversation history from the
 * Instagram API, and processes via the LLM agent.
 *
 * Concurrency: Only one task processes per thread at a time via the thread lock.
 */
export const processMessage = onTaskDispatched(
  {
    region: REGION,
    retryConfig: {
      maxAttempts: 3,
      minBackoffSeconds: 30,
    },
    rateLimits: {
      maxConcurrentDispatches: 10,
    },
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (req) => {
    const payload = req.data as ProcessMessagePayload;
    const { threadId } = payload;

    if (!threadId) {
      logger.error("Missing threadId in payload");
      return;
    }

    logger.info("Processing messages for thread", { threadId });

    // Acquire thread lock — exits if another task is processing or no pending messages
    const acquired = await acquireThreadLock(threadId);
    if (!acquired) {
      logger.info("Could not acquire thread lock (already processing or no pending)", { threadId });
      return;
    }

    try {
      const instagram = getInstagramService();
      const igAccountId = process.env.META_INSTAGRAM_ACCOUNT_ID || "";

      // Fetch conversation history from Instagram API
      const threadMessages = await instagram.getConversationMessages(threadId, 50);

      if (threadMessages.length === 0) {
        logger.warn("No messages found in Instagram conversation", { threadId });
        await releaseThreadLockAndCheck(threadId);
        return;
      }

      // Build conversation messages with roles assigned by sender
      const messages: ConversationMessage[] = threadMessages.map((m) => ({
        role: m.fromId === igAccountId ? "assistant" as const : "user" as const,
        content: m.text,
        timestamp: new Date(m.createdTime).getTime(),
        messageId: m.id,
      }));

      // Find the latest user message ID for reactions
      const latestUserMessageId = [...messages].reverse().find((m) => m.role === "user")?.messageId;

      // Get user profile
      const sender = await instagram.getUserProfile(threadId);

      // Build input for the agent
      const input: DmAgentInput = {
        conversationId: threadId,
        sender: {
          id: sender.id,
          username: sender.username,
          name: sender.name,
        },
        messages,
        latestUserMessageId: latestUserMessageId || threadMessages[threadMessages.length - 1].id,
      };

      // Call the agent flow — it handles all actions via tool calls
      const result = await dmAgentFlow(input);

      // Release lock and check for new pending messages
      const hasPending = await releaseThreadLockAndCheck(threadId);

      logger.info("Message processing complete", {
        threadId,
        actionsExecuted: result.actionsExecuted,
      });

      // Schedule follow-up if new messages arrived during processing
      if (hasPending) {
        try {
          logger.info("New messages arrived during processing, scheduling follow-up", {
            threadId,
          });
          await scheduleProcessing(threadId);
        } catch (scheduleError) {
          logger.error("Failed to schedule follow-up task", {
            threadId,
            error: scheduleError instanceof Error ? scheduleError.message : "Unknown error",
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Message processing failed", { threadId, error: errorMessage });

      // Release the lock so future tasks can process
      await releaseThreadLockAndCheck(threadId).catch((e) =>
        logger.error("Failed to release thread lock after error", { error: e })
      );

      // Throw to trigger Cloud Tasks retry
      throw error;
    }
  }
);

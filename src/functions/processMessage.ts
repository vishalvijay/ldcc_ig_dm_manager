/**
 * Message Processor - Cloud Task callback for processing Instagram messages.
 *
 * Fetches pending messages and invokes the dmAgentFlow which handles
 * actions via tool calls.
 *
 * Security: Validates OIDC token from Cloud Tasks to ensure only authorized
 * invocations are processed.
 */

import * as logger from "firebase-functions/logger";
import { onRequest } from "firebase-functions/v2/https";
import { OAuth2Client } from "google-auth-library";
import {
  claimPendingMessages,
  getConversationHistory,
  updateMessageStatus,
  markProcessedAndCheckPending,
  scheduleProcessing,
} from "../services/messageStore";
import { getInstagramService } from "../services/instagram";
import { dmAgentFlow, DmAgentInput } from "../flows/dmAgent";
import { ConversationMessage, StoredMessage, MessageStatus } from "../types";

// OIDC validation configuration
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "";
const PROCESS_MESSAGE_URL = process.env.PROCESS_MESSAGE_URL || "";
// Default Firebase service account: {PROJECT_ID}@appspot.gserviceaccount.com
const CLOUD_TASKS_SERVICE_ACCOUNT = PROJECT_ID ? `${PROJECT_ID}@appspot.gserviceaccount.com` : "";

// OAuth2 client for token verification
const authClient = new OAuth2Client();

interface ProcessMessagePayload {
  threadId: string;
  messageId: string;
}

/**
 * Validate OIDC token from Cloud Tasks.
 * Returns true if valid, false otherwise.
 */
async function validateOidcToken(authHeader: string | undefined): Promise<boolean> {
  // Skip validation in emulator mode (local development)
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    logger.debug("Skipping OIDC validation in emulator mode");
    return true;
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logger.warn("Missing or invalid Authorization header");
    return false;
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix

  try {
    const ticket = await authClient.verifyIdToken({
      idToken: token,
      audience: PROCESS_MESSAGE_URL,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      logger.warn("OIDC token has no payload");
      return false;
    }

    // Verify the token is from our Cloud Tasks service account
    if (CLOUD_TASKS_SERVICE_ACCOUNT && payload.email !== CLOUD_TASKS_SERVICE_ACCOUNT) {
      logger.warn("OIDC token from unexpected service account", {
        expected: CLOUD_TASKS_SERVICE_ACCOUNT,
        actual: payload.email,
      });
      return false;
    }

    logger.debug("OIDC token validated successfully", {
      email: payload.email,
      audience: payload.aud,
    });
    return true;
  } catch (error) {
    logger.error("OIDC token validation failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}

/**
 * Build conversation history from stored messages.
 */
function buildConversationHistory(
  messages: StoredMessage[],
  pageId: string
): ConversationMessage[] {
  return messages.map((m) => ({
    role: m.message.senderId === pageId ? "assistant" : "user",
    content: m.message.text,
    timestamp: m.message.timestamp,
    messageId: m.message.id,
  }));
}

/**
 * Process Message Function - Cloud Task callback.
 *
 * This function is called by Cloud Tasks after the debounce delay.
 * It atomically claims pending messages and processes them.
 * The dmAgentFlow handles all actions via tool calls.
 *
 * Concurrency: Only one task processes per thread at a time.
 * If another task is processing, this task exits and relies on
 * the active task to schedule a follow-up if needed.
 */
export const processMessage = onRequest(
  {
    region: "us-central1",
    cors: false,
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    // Validate OIDC token from Cloud Tasks
    const authHeader = req.headers.authorization as string | undefined;
    const isAuthenticated = await validateOidcToken(authHeader);
    if (!isAuthenticated) {
      res.status(401).send("Unauthorized");
      return;
    }

    let payload: ProcessMessagePayload;
    try {
      payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch (error) {
      logger.error("Failed to parse request payload", { error });
      res.status(400).send("Invalid JSON");
      return;
    }

    const { threadId } = payload;
    if (!threadId) {
      logger.error("Missing threadId in payload");
      res.status(400).send("Missing threadId");
      return;
    }

    logger.info("Processing messages for thread", { threadId });

    // Track claimed messages for potential rollback
    let claimedMessages: StoredMessage[] = [];

    try {
      // Atomically claim pending messages (prevents race conditions)
      // Returns empty if another task is already processing this thread
      claimedMessages = await claimPendingMessages(threadId);

      if (claimedMessages.length === 0) {
        logger.info("No messages to claim (none pending or another task processing)", { threadId });
        res.status(200).send("No messages to process");
        return;
      }

      // Get conversation history and user profile
      const instagram = getInstagramService();
      const pageId = process.env.INSTAGRAM_PAGE_ID || "";

      const history = await getConversationHistory(threadId, 50);
      const conversationHistory = buildConversationHistory(history, pageId);

      const latestMessage = claimedMessages[claimedMessages.length - 1];
      const sender = await instagram.getUserProfile(latestMessage.message.senderId);

      // Build input for the agent
      const claimedAsHistory = buildConversationHistory(claimedMessages, pageId);
      const allMessages = [...conversationHistory, ...claimedAsHistory.slice(0, -1)];

      const input: DmAgentInput = {
        conversationId: threadId,
        sender: {
          id: sender.id,
          username: sender.username,
          name: sender.name,
        },
        messages: allMessages,
        currentMessage: latestMessage.message,
      };

      // Call the agent flow - it handles all actions via tool calls
      const result = await dmAgentFlow(input);

      // Atomically: mark as processed + check for new pending
      const messageIds = claimedMessages.map((m) => m.id);
      const newPending = await markProcessedAndCheckPending(threadId, messageIds);

      logger.info("Message processing complete", {
        threadId,
        messagesProcessed: messageIds.length,
        actionsExecuted: result.actionsExecuted,
      });

      // Schedule follow-up if new messages arrived during processing
      // Separate try-catch to avoid resetting processed messages on scheduling failure
      if (newPending.length > 0) {
        try {
          logger.info("New messages arrived during processing, scheduling follow-up", {
            threadId,
            pendingCount: newPending.length,
          });
          await scheduleProcessing(threadId, newPending[0].id);
        } catch (scheduleError) {
          // Log but don't fail - the webhook will schedule a task when next message arrives
          logger.error("Failed to schedule follow-up task", {
            threadId,
            error: scheduleError instanceof Error ? scheduleError.message : "Unknown error",
          });
        }
      }

      res.status(200).send("OK");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Message processing failed", { threadId, error: errorMessage });

      // Reset claimed messages back to pending so they can be retried
      if (claimedMessages.length > 0) {
        const messageIds = claimedMessages.map((m) => m.id);
        await updateMessageStatus(threadId, messageIds, MessageStatus.PENDING).catch((e) =>
          logger.error("Failed to reset messages to pending", { error: e })
        );
      }

      // Return 500 to trigger Cloud Tasks retry
      res.status(500).send("Processing failed");
    }
  }
);

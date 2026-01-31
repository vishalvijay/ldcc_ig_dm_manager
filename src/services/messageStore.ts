/**
 * Message Store - Firestore storage and Cloud Tasks scheduling for Instagram messages.
 *
 * Handles:
 * - Storing incoming messages
 * - Scheduling processing tasks (with randomized delay for batching)
 * - Atomic message claiming for concurrent task safety
 * - Conversation history retrieval
 */

import * as logger from "firebase-functions/logger";
import { CloudTasksClient, protos } from "@google-cloud/tasks";
import { status as grpcStatus } from "@grpc/grpc-js";
import { getDb } from "../config/firebase";
import { InstagramMessage, StoredMessage, MessageStatus } from "../types";

// Collection path
const CONVERSATIONS_COLLECTION = "conversations";
const MESSAGES_SUBCOLLECTION = "messages";

// Debounce configuration
const MIN_DELAY_SECONDS = 5;
const MAX_DELAY_SECONDS = 15;

// Cloud Tasks configuration
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "";
const LOCATION = process.env.FUNCTION_REGION || "us-central1";
const QUEUE_NAME = process.env.CLOUD_TASKS_QUEUE || "dm-processing";
const PROCESS_MESSAGE_URL = process.env.PROCESS_MESSAGE_URL || "";
// Default Firebase service account: {PROJECT_ID}@appspot.gserviceaccount.com
const CLOUD_TASKS_SERVICE_ACCOUNT = PROJECT_ID ? `${PROJECT_ID}@appspot.gserviceaccount.com` : "";

/**
 * Check if Cloud Tasks mock mode is enabled.
 */
function isCloudTasksMockMode(): boolean {
  return (
    process.env.MOCK_CLOUD_TASKS === "true" ||
    !PROJECT_ID ||
    !PROCESS_MESSAGE_URL
  );
}

/**
 * Generate a random delay between MIN and MAX seconds.
 */
function getRandomDelay(): number {
  return (
    Math.floor(Math.random() * (MAX_DELAY_SECONDS - MIN_DELAY_SECONDS + 1)) +
    MIN_DELAY_SECONDS
  );
}

/**
 * Store a message in Firestore.
 *
 * @param message - The Instagram message to store
 * @param threadId - The conversation thread ID
 */
export async function storeMessage(
  message: InstagramMessage,
  threadId: string
): Promise<void> {
  const db = getDb();
  const now = Date.now();

  const storedMessage: StoredMessage = {
    id: message.id,
    conversationId: threadId,
    message,
    status: MessageStatus.PENDING,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = db
    .collection(CONVERSATIONS_COLLECTION)
    .doc(threadId)
    .collection(MESSAGES_SUBCOLLECTION)
    .doc(message.id);

  await docRef.set(storedMessage);

  logger.info("Stored message in Firestore", {
    messageId: message.id,
    threadId,
    status: MessageStatus.PENDING,
  });
}

/**
 * Schedule message processing via Cloud Tasks.
 *
 * Uses a deduplication key based on threadId to avoid scheduling
 * multiple tasks for rapid messages in the same conversation.
 *
 * @param threadId - The conversation thread ID
 * @param messageId - The triggering message ID
 */
export async function scheduleProcessing(
  threadId: string,
  messageId: string
): Promise<void> {
  const delaySeconds = getRandomDelay();

  if (isCloudTasksMockMode()) {
    logger.info("MOCK: Would schedule Cloud Task", {
      threadId,
      messageId,
      delaySeconds,
    });
    return;
  }

  const client = new CloudTasksClient();
  const parent = client.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);

  // Use threadId as deduplication key - only one task per thread at a time
  const taskName = `${parent}/tasks/process-${threadId.replace(/[^a-zA-Z0-9-_]/g, "_")}`;

  const scheduleTime = new Date(Date.now() + delaySeconds * 1000);

  const task: protos.google.cloud.tasks.v2.ITask = {
    name: taskName,
    httpRequest: {
      httpMethod: "POST",
      url: PROCESS_MESSAGE_URL,
      headers: {
        "Content-Type": "application/json",
      },
      body: Buffer.from(
        JSON.stringify({
          threadId,
          messageId,
        })
      ).toString("base64"),
      // OIDC authentication for secure Cloud Tasks invocation
      ...(CLOUD_TASKS_SERVICE_ACCOUNT && {
        oidcToken: {
          serviceAccountEmail: CLOUD_TASKS_SERVICE_ACCOUNT,
          audience: PROCESS_MESSAGE_URL,
        },
      }),
    },
    scheduleTime: {
      seconds: Math.floor(scheduleTime.getTime() / 1000),
    },
  };

  try {
    // Try to create the task - it will fail if one already exists with the same name
    await client.createTask({ parent, task });

    logger.info("Scheduled processing task", {
      threadId,
      messageId,
      delaySeconds,
      scheduledFor: scheduleTime.toISOString(),
    });
  } catch (error) {
    // If task already exists (ALREADY_EXISTS error), that's fine - debouncing is working
    const errorCode = (error as { code?: number }).code;
    if (errorCode === grpcStatus.ALREADY_EXISTS) {
      logger.info("Task already scheduled for thread (debouncing)", {
        threadId,
        messageId,
      });
    } else {
      logger.error("Failed to schedule processing task", {
        threadId,
        messageId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }
}

/**
 * Get all pending messages for a thread.
 *
 * @param threadId - The conversation thread ID
 * @returns Array of pending messages ordered by timestamp
 */
export async function getPendingMessages(
  threadId: string
): Promise<StoredMessage[]> {
  const db = getDb();

  const snapshot = await db
    .collection(CONVERSATIONS_COLLECTION)
    .doc(threadId)
    .collection(MESSAGES_SUBCOLLECTION)
    .where("status", "==", MessageStatus.PENDING)
    .orderBy("createdAt", "asc")
    .get();

  return snapshot.docs.map((doc) => doc.data() as StoredMessage);
}

/**
 * Atomically claim pending messages for processing.
 * Uses a transaction to prevent race conditions when multiple tasks
 * try to process the same thread concurrently.
 *
 * Ensures sequential processing: if any messages are already being
 * processed for this thread, returns empty to let the current task finish.
 *
 * @param threadId - The conversation thread ID
 * @returns Array of claimed messages, or empty if none available or another task is processing
 */
export async function claimPendingMessages(
  threadId: string
): Promise<StoredMessage[]> {
  const db = getDb();
  const now = Date.now();

  const messagesRef = db
    .collection(CONVERSATIONS_COLLECTION)
    .doc(threadId)
    .collection(MESSAGES_SUBCOLLECTION);

  // Use a transaction to atomically check and claim messages
  const claimedMessages = await db.runTransaction(async (transaction) => {
    // First, check if any messages are currently being processed
    const processingSnapshot = await transaction.get(
      messagesRef.where("status", "==", MessageStatus.PROCESSING).limit(1)
    );

    if (!processingSnapshot.empty) {
      // Another task is already processing - let it finish first
      logger.info("Skipping claim - another task is processing", { threadId });
      return [];
    }

    // No messages being processed, claim pending ones
    const pendingSnapshot = await transaction.get(
      messagesRef
        .where("status", "==", MessageStatus.PENDING)
        .orderBy("createdAt", "asc")
    );

    if (pendingSnapshot.empty) {
      return [];
    }

    const messages: StoredMessage[] = [];

    for (const doc of pendingSnapshot.docs) {
      const message = doc.data() as StoredMessage;
      messages.push(message);

      // Mark as processing within the transaction
      transaction.update(doc.ref, {
        status: MessageStatus.PROCESSING,
        updatedAt: now,
      });
    }

    return messages;
  });

  if (claimedMessages.length > 0) {
    logger.info("Claimed messages for processing", {
      threadId,
      messageCount: claimedMessages.length,
    });
  }

  return claimedMessages;
}

/**
 * Update message status in a batch.
 *
 * @param threadId - The conversation thread ID
 * @param messageIds - Array of message IDs to update
 * @param status - New status
 * @param error - Optional error message (for failed status)
 */
export async function updateMessageStatus(
  threadId: string,
  messageIds: string[],
  status: MessageStatus,
  error?: string
): Promise<void> {
  const db = getDb();
  const now = Date.now();

  const batch = db.batch();

  for (const messageId of messageIds) {
    const docRef = db
      .collection(CONVERSATIONS_COLLECTION)
      .doc(threadId)
      .collection(MESSAGES_SUBCOLLECTION)
      .doc(messageId);

    const updateData: Partial<StoredMessage> = {
      status,
      updatedAt: now,
    };

    if (status === MessageStatus.PROCESSED) {
      updateData.processedAt = now;
    }

    if (error) {
      updateData.error = error;
    }

    batch.update(docRef, updateData);
  }

  await batch.commit();

  logger.info("Updated message status", {
    threadId,
    messageCount: messageIds.length,
    newStatus: status,
  });
}

/**
 * Mark messages as processed and check for new pending messages atomically.
 * Uses a transaction to ensure consistent view.
 *
 * @param threadId - The conversation thread ID
 * @param messageIds - Array of message IDs to mark as processed
 * @returns Array of pending messages (if any arrived during processing)
 */
export async function markProcessedAndCheckPending(
  threadId: string,
  messageIds: string[]
): Promise<StoredMessage[]> {
  const db = getDb();
  const now = Date.now();

  const messagesRef = db
    .collection(CONVERSATIONS_COLLECTION)
    .doc(threadId)
    .collection(MESSAGES_SUBCOLLECTION);

  const pendingMessages = await db.runTransaction(async (transaction) => {
    // Mark all messages as processed
    for (const messageId of messageIds) {
      const docRef = messagesRef.doc(messageId);
      transaction.update(docRef, {
        status: MessageStatus.PROCESSED,
        updatedAt: now,
        processedAt: now,
      });
    }

    // Check for any new pending messages
    const pendingSnapshot = await transaction.get(
      messagesRef
        .where("status", "==", MessageStatus.PENDING)
        .orderBy("createdAt", "asc")
    );

    return pendingSnapshot.docs.map((doc) => doc.data() as StoredMessage);
  });

  logger.info("Marked messages processed and checked pending", {
    threadId,
    processedCount: messageIds.length,
    pendingCount: pendingMessages.length,
  });

  return pendingMessages;
}

/**
 * Get conversation history from Firestore.
 *
 * @param threadId - The conversation thread ID
 * @param limit - Maximum number of messages to fetch
 * @returns Array of messages ordered by timestamp
 */
export async function getConversationHistory(
  threadId: string,
  limit = 50
): Promise<StoredMessage[]> {
  const db = getDb();

  const snapshot = await db
    .collection(CONVERSATIONS_COLLECTION)
    .doc(threadId)
    .collection(MESSAGES_SUBCOLLECTION)
    .where("status", "==", MessageStatus.PROCESSED)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  // Return in chronological order (oldest first)
  return snapshot.docs.map((doc) => doc.data() as StoredMessage).reverse();
}

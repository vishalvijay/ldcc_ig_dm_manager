/**
 * Message Store - Firestore storage and Cloud Tasks scheduling for Instagram messages.
 *
 * Handles:
 * - Storing incoming messages
 * - Scheduling processing tasks via Firebase TaskQueue (with time-window deduplication)
 * - Atomic message claiming for concurrent task safety
 * - Conversation history retrieval
 */

import * as logger from "firebase-functions/logger";
import { getFunctions } from "firebase-admin/functions";
import { getDb } from "../config/firebase";
import { InstagramMessage, StoredMessage, MessageStatus } from "../types";
import { REGION } from "../config";

// Collection path
const CONVERSATIONS_COLLECTION = "conversations";
const MESSAGES_SUBCOLLECTION = "messages";

// Debounce configuration
const DELAY_SECONDS = parseInt(process.env.DEBOUNCE_DELAY_SECONDS || "60", 10);

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
 * Schedule message processing via Firebase TaskQueue.
 *
 * Uses a time-windowed task ID for native Cloud Tasks deduplication —
 * if a task for the same thread and time window already exists, the
 * enqueue is rejected (ALREADY_EXISTS), preventing duplicate processing.
 *
 * @param threadId - The conversation thread ID
 * @param messageId - The triggering message ID
 */
export async function scheduleProcessing(
  threadId: string,
  messageId: string
): Promise<void> {
  const timeWindow = Math.floor(Date.now() / (DELAY_SECONDS * 1000));
  const sanitizedThreadId = threadId.replace(/[^a-zA-Z0-9-_]/g, "_");
  const taskId = `process-${sanitizedThreadId}-${timeWindow}`;

  const queue = getFunctions().taskQueue(`locations/${REGION}/functions/processMessage`);

  try {
    await queue.enqueue(
      { threadId, messageId },
      {
        scheduleDelaySeconds: DELAY_SECONDS,
        id: taskId,
      }
    );

    logger.info("Scheduled processing task", {
      threadId,
      messageId,
      taskId,
      delaySeconds: DELAY_SECONDS,
    });
  } catch (error) {
    const errCode = (error as { code?: string }).code;
    if (errCode === "functions/already-exists") {
      logger.info("Task already scheduled for thread (debouncing)", {
        threadId,
        messageId,
        taskId,
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
 * Delete all conversation data for a thread and its associated user profile.
 *
 * Deletes all messages in the conversation subcollection, the conversation
 * document itself, and the user profile document. Used for testing resets.
 *
 * @param threadId - The conversation thread ID (also the sender/user ID)
 */
export async function deleteConversationData(threadId: string): Promise<void> {
  const db = getDb();

  // Delete all messages in the subcollection
  const messagesRef = db
    .collection(CONVERSATIONS_COLLECTION)
    .doc(threadId)
    .collection(MESSAGES_SUBCOLLECTION);

  const messagesSnapshot = await messagesRef.get();
  if (!messagesSnapshot.empty) {
    const batch = db.batch();
    for (const doc of messagesSnapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }

  // Delete the conversation document
  await db.collection(CONVERSATIONS_COLLECTION).doc(threadId).delete();

  // Delete the user profile
  await db.collection("users").doc(threadId).delete();

  logger.info("Deleted conversation data for reset", {
    threadId,
    messagesDeleted: messagesSnapshot.size,
  });
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

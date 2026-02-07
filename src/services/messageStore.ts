/**
 * Message Store - Thread-level Firestore state and Cloud Tasks scheduling.
 *
 * Handles:
 * - Thread pending flag (set by webhook)
 * - Thread lock acquisition/release (for concurrent task safety)
 * - Scheduling processing tasks via Firebase TaskQueue (with time-window deduplication)
 */

import * as logger from "firebase-functions/logger";
import { getFunctions } from "firebase-admin/functions";
import { getDb } from "../config/firebase";
import { ThreadState } from "../types";
import { REGION } from "../config";

// Collection path
const THREADS_COLLECTION = "threads";

// Debounce configuration
const DELAY_SECONDS = parseInt(process.env.DEBOUNCE_DELAY_SECONDS || "60", 10);

/**
 * Mark a thread as having pending messages.
 * Called by the webhook when a new message arrives.
 *
 * @param threadId - The conversation thread ID
 */
export async function markThreadPending(threadId: string): Promise<void> {
  const db = getDb();

  await db
    .collection(THREADS_COLLECTION)
    .doc(threadId)
    .set({ hasPendingMessages: true } as Partial<ThreadState>, { merge: true });

  logger.info("Marked thread as pending", { threadId });
}

/**
 * Acquire the processing lock for a thread.
 *
 * Uses a transaction to atomically check that:
 * 1. The thread is not already being processed
 * 2. There are pending messages to process
 *
 * If both conditions are met, sets processing=true and hasPendingMessages=false.
 *
 * @param threadId - The conversation thread ID
 * @returns Whether the lock was acquired
 */
export async function acquireThreadLock(threadId: string): Promise<boolean> {
  const db = getDb();
  const threadRef = db.collection(THREADS_COLLECTION).doc(threadId);

  const acquired = await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(threadRef);
    const data = doc.data() as ThreadState | undefined;

    // Can't acquire if already processing or no pending messages
    if (data?.processing || !data?.hasPendingMessages) {
      return false;
    }

    transaction.update(threadRef, {
      processing: true,
      hasPendingMessages: false,
    } as Partial<ThreadState>);

    return true;
  });

  logger.info("Thread lock acquisition", { threadId, acquired });
  return acquired;
}

/**
 * Release the processing lock and check for new pending messages.
 *
 * Uses a transaction to atomically:
 * 1. Set processing=false
 * 2. Store the lastProcessedMessageId
 * 3. Read whether hasPendingMessages was set during processing
 *
 * @param threadId - The conversation thread ID
 * @param lastProcessedMessageId - ID of the latest message processed
 * @returns Whether new messages arrived during processing (hasPendingMessages)
 */
export async function releaseThreadLockAndCheck(
  threadId: string,
  lastProcessedMessageId: string
): Promise<boolean> {
  const db = getDb();
  const threadRef = db.collection(THREADS_COLLECTION).doc(threadId);

  const hasPending = await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(threadRef);
    const data = doc.data() as ThreadState | undefined;

    transaction.update(threadRef, {
      processing: false,
      lastProcessedMessageId,
    } as Partial<ThreadState>);

    return data?.hasPendingMessages ?? false;
  });

  logger.info("Released thread lock", {
    threadId,
    lastProcessedMessageId,
    hasPendingMessages: hasPending,
  });

  return hasPending;
}

/**
 * Delete thread data and associated user profile.
 * Used for testing resets.
 *
 * @param threadId - The conversation thread ID (also the sender/user ID)
 */
export async function deleteThreadData(threadId: string): Promise<void> {
  const db = getDb();

  // Delete the thread document
  await db.collection(THREADS_COLLECTION).doc(threadId).delete();

  // Delete the user profile
  await db.collection("users").doc(threadId).delete();

  logger.info("Deleted thread data for reset", { threadId });
}

/**
 * Schedule message processing via Firebase TaskQueue.
 *
 * Uses a time-windowed task ID for native Cloud Tasks deduplication —
 * if a task for the same thread and time window already exists, the
 * enqueue is rejected (ALREADY_EXISTS), preventing duplicate processing.
 *
 * @param threadId - The conversation thread ID
 */
export async function scheduleProcessing(threadId: string): Promise<void> {
  const timeWindow = Math.floor(Date.now() / (DELAY_SECONDS * 1000));
  const sanitizedThreadId = threadId.replace(/[^a-zA-Z0-9-_]/g, "_");
  const taskId = `process-${sanitizedThreadId}-${timeWindow}`;

  const queue = getFunctions().taskQueue(
    `locations/${REGION}/functions/processMessage`
  );

  try {
    await queue.enqueue(
      { threadId },
      {
        scheduleDelaySeconds: DELAY_SECONDS,
        id: taskId,
      }
    );

    logger.info("Scheduled processing task", {
      threadId,
      taskId,
      delaySeconds: DELAY_SECONDS,
    });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    if (errMessage.includes("already exists")) {
      logger.info("Task already scheduled for thread (debouncing)", {
        threadId,
        taskId,
      });
    } else {
      logger.error("Failed to schedule processing task", {
        threadId,
        error,
      });
      throw error;
    }
  }
}

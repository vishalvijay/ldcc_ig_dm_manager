/**
 * Firestore Tools - CRUD operations for conversation and user data.
 *
 * Provides tools for the LLM to:
 * - Fetch conversation history
 * - Get/update user profiles
 * - Check notification cooldowns
 * - Record bookings
 */

import { z } from "zod";
import { Genkit, ToolAction } from "genkit";
import { getDb } from "../config/firebase";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

// =============================================================================
// Schema Definitions
// =============================================================================

const GetConversationHistoryInputSchema = z.object({
  threadId: z.string().describe("The Instagram thread/conversation ID"),
  limit: z
    .number()
    .optional()
    .default(20)
    .describe("Maximum number of messages to fetch (default: 20)"),
});

const GetConversationHistoryOutputSchema = z.object({
  messages: z.array(
    z.object({
      text: z.string(),
      sender: z.enum(["user", "agent"]),
      timestamp: z.number(),
      messageId: z.string().optional(),
    })
  ),
  userName: z.string().optional(),
  lastActivity: z.number().optional(),
});

const GetUserProfileInputSchema = z.object({
  userId: z.string().describe("The Instagram user ID"),
});

const GetUserProfileOutputSchema = z.object({
  userId: z.string(),
  firstContact: z.number().optional().describe("Timestamp of first message"),
  lastNotification: z
    .number()
    .optional()
    .describe("When manager was last notified about this user"),
  bookings: z
    .array(
      z.object({
        sessionDate: z.string(),
        bookedAt: z.number(),
        userName: z.string().optional(),
        phone: z.string().optional(),
      })
    )
    .optional(),
});

const CheckLastNotificationInputSchema = z.object({
  userId: z.string().describe("The Instagram user ID"),
});

const CheckLastNotificationOutputSchema = z.object({
  canNotify: z
    .boolean()
    .describe("Whether we can notify the manager (7-day cooldown)"),
  lastNotification: z
    .number()
    .optional()
    .describe("Timestamp of last notification"),
  daysSinceLastNotification: z.number().optional(),
});

const RecordBookingInputSchema = z.object({
  userId: z.string().describe("The Instagram user ID"),
  threadId: z.string().describe("The conversation thread ID"),
  sessionDate: z.string().describe("The date of the net session (e.g., '2024-03-15')"),
  userName: z.string().optional().describe("User's name if provided"),
  phone: z.string().optional().describe("User's phone number if provided"),
});

const RecordBookingOutputSchema = z.object({
  success: z.boolean(),
  bookingId: z.string().optional(),
  message: z.string(),
});

// =============================================================================
// Tool Definitions
// =============================================================================

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Define all Firestore tools for the GenKit AI instance.
 */
export function defineFirestoreTools(ai: Genkit): ToolAction[] {
  const getConversationHistory = ai.defineTool(
    {
      name: "get_conversation_history",
      description:
        "Fetch the conversation history for a thread. Use this to understand the full context of a conversation.",
      inputSchema: GetConversationHistoryInputSchema,
      outputSchema: GetConversationHistoryOutputSchema,
    },
    async (input) => {
      const db = getDb();
      const threadDoc = await db
        .collection("conversations")
        .doc(input.threadId)
        .get();

      const messagesSnapshot = await db
        .collection("conversations")
        .doc(input.threadId)
        .collection("messages")
        .orderBy("timestamp", "desc")
        .limit(input.limit ?? 20)
        .get();

      const messages = messagesSnapshot.docs
        .map((doc) => {
          const data = doc.data();
          return {
            text: data.text as string,
            sender: data.sender as "user" | "agent",
            timestamp: data.timestamp as number,
            messageId: doc.id,
          };
        })
        .reverse(); // Chronological order

      const threadData = threadDoc.data();
      return {
        messages,
        userName: threadData?.userName,
        lastActivity: threadData?.lastActivity,
      };
    }
  );

  const getUserProfile = ai.defineTool(
    {
      name: "get_user_profile",
      description:
        "Get a user's profile including their booking history and notification status. Use this to check if a user has booked sessions before.",
      inputSchema: GetUserProfileInputSchema,
      outputSchema: GetUserProfileOutputSchema,
    },
    async (input) => {
      const db = getDb();
      const userDoc = await db.collection("users").doc(input.userId).get();

      if (!userDoc.exists) {
        return {
          userId: input.userId,
          bookings: [],
        };
      }

      const data = userDoc.data();
      return {
        userId: input.userId,
        firstContact: data?.firstContact,
        lastNotification: data?.lastNotification,
        bookings: data?.bookings || [],
      };
    }
  );

  const checkLastNotification = ai.defineTool(
    {
      name: "check_last_notification",
      description:
        "Check if we can notify the manager about this user. There is a 7-day cooldown between notifications for the same user. ALWAYS call this before using the notifyManager action.",
      inputSchema: CheckLastNotificationInputSchema,
      outputSchema: CheckLastNotificationOutputSchema,
    },
    async (input) => {
      const db = getDb();
      const userDoc = await db.collection("users").doc(input.userId).get();

      if (!userDoc.exists || !userDoc.data()?.lastNotification) {
        return {
          canNotify: true,
        };
      }

      const lastNotification = userDoc.data()!.lastNotification as number;
      const now = Date.now();
      const daysSince = Math.floor((now - lastNotification) / (24 * 60 * 60 * 1000));

      return {
        canNotify: now - lastNotification > SEVEN_DAYS_MS,
        lastNotification,
        daysSinceLastNotification: daysSince,
      };
    }
  );

  const recordBooking = ai.defineTool(
    {
      name: "record_booking",
      description:
        "Record a booking when a user confirms they will attend a net session. Call this after the user confirms a session date.",
      inputSchema: RecordBookingInputSchema,
      outputSchema: RecordBookingOutputSchema,
    },
    async (input) => {
      const db = getDb();
      const now = Date.now();

      const booking = {
        sessionDate: input.sessionDate,
        bookedAt: now,
        userName: input.userName,
        phone: input.phone,
        threadId: input.threadId,
      };

      try {
        // Add booking to user's profile
        const userRef = db.collection("users").doc(input.userId);
        await userRef.set(
          {
            bookings: FieldValue.arrayUnion(booking),
            lastBooking: now,
          },
          { merge: true }
        );

        // Also store in a dedicated bookings collection for easy querying
        const bookingRef = await db.collection("bookings").add({
          ...booking,
          userId: input.userId,
          createdAt: Timestamp.now(),
        });

        return {
          success: true,
          bookingId: bookingRef.id,
          message: `Booking recorded for ${input.sessionDate}`,
        };
      } catch (error) {
        console.error("Failed to record booking:", error);
        return {
          success: false,
          message: `Failed to record booking: ${error}`,
        };
      }
    }
  );

  return [
    getConversationHistory,
    getUserProfile,
    checkLastNotification,
    recordBooking,
  ];
}

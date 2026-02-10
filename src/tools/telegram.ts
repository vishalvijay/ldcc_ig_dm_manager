/**
 * Telegram Tools - Manager notification via Telegram Bot API.
 *
 * Provides tools for sending notifications to the club manager.
 */

import * as logger from "firebase-functions/logger";
import { z } from "zod";
import { Genkit, ToolAction } from "genkit";
import { getDb } from "../config/firebase";

// Telegram configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const NET_SESSION_COORDINATOR = process.env.NET_SESSION_COORDINATOR || "Adarsh";

// Telegram API response type
interface TelegramResponse {
  ok: boolean;
  result?: {
    message_id: number;
  };
  description?: string;
}

/**
 * Escape special characters for Telegram MarkdownV2 format.
 */
function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

/**
 * Send a message via Telegram Bot API.
 */
async function sendTelegramMessage(
  text: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    logger.warn("Telegram credentials not configured");
    return {
      success: false,
      error: "Telegram credentials not configured",
    };
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "MarkdownV2",
      }),
    });

    const data = (await response.json()) as TelegramResponse;

    if (!data.ok) {
      logger.error("Failed to send Telegram message", {
        status: response.status,
        description: data.description,
      });
      return {
        success: false,
        error: data.description || response.statusText,
      };
    }

    logger.info("Sent Telegram message", {
      messageId: data.result?.message_id,
    });

    return { success: true, messageId: String(data.result?.message_id) };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("Telegram send failed", { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

// =============================================================================
// Schema Definitions
// =============================================================================

const NotifyBookingInputSchema = z.object({
  username: z.string().describe("Instagram username of the person who booked"),
  sessionDate: z.string().describe("The net session date they confirmed (e.g., 'Saturday 15th Feb 2pm')"),
  userPhone: z.string().optional().describe("User's phone number if provided"),
  userName: z.string().optional().describe("User's real name if provided"),
  additionalAttendees: z.string().optional().describe("Names of friends/additional people coming along"),
  kitStatus: z.string().optional().describe("Kit situation — e.g. 'has own kit', 'needs club kit', 'has bat but needs pads'"),
  notes: z.string().optional().describe("Any other relevant info — e.g. experience level, special requests"),
});

const EscalateToManagerInputSchema = z.object({
  userId: z.string().describe("The Instagram user ID"),
  conversationId: z.string().describe("The conversation/thread ID for tracking escalation status"),
  reason: z.string().describe("Brief reason for escalation (e.g., 'Sponsorship inquiry', 'Complaint', 'Media request')"),
  summary: z.string().describe("Summary of the conversation for manager context"),
  username: z.string().describe("Instagram username of the person"),
  priority: z
    .enum(["low", "normal", "high"])
    .optional()
    .default("normal")
    .describe("Priority level: high for urgent/complaints, normal for general inquiries, low for FYI"),
});

const TelegramOutputSchema = z.object({
  success: z.boolean(),
  messageId: z.string().optional().describe("Telegram message ID if sent successfully"),
  error: z.string().optional().describe("Error message if failed"),
});

// =============================================================================
// Tool Definitions
// =============================================================================

/**
 * Define Telegram tools for the GenKit AI instance.
 */
export function defineTelegramTools(ai: Genkit): ToolAction[] {
  /**
   * Notify manager about a confirmed booking.
   */
  const notifyBookingConfirmed = ai.defineTool(
    {
      name: "notify_booking_confirmed",
      description:
        "Send a Telegram notification to the manager when a user confirms attendance at a net session. Use this after recording the booking.",
      inputSchema: NotifyBookingInputSchema,
      outputSchema: TelegramOutputSchema,
    },
    async (input) => {
      const username = input.username.replace(/^@/, "");
      const displayName = input.userName || `@${username}`;
      const contact = input.userPhone || "Not provided";
      const esc = escapeMarkdownV2;

      const optionalLines: string[] = [];
      if (input.kitStatus) {
        optionalLines.push(`🧤 *Kit:* ${esc(input.kitStatus)}`);
      }
      if (input.additionalAttendees) {
        optionalLines.push(`👥 *Bringing:* ${esc(input.additionalAttendees)}`);
      }
      if (input.notes) {
        optionalLines.push(`📝 *Notes:* ${esc(input.notes)}`);
      }

      const message = [
        `📋 *Nets Booking Confirmed*`,
        ``,
        `👤 *Name:* ${esc(displayName)}`,
        `📸 *Instagram:* [@${esc(username)}](https://instagram\\.com/${esc(username)})`,
        `📅 *Session:* ${esc(input.sessionDate)}`,
        `📞 *Phone:* ${esc(contact)}`,
        ...optionalLines,
        `🏏 *Coordinator:* ${esc(NET_SESSION_COORDINATOR)}`,
      ].join("\n");

      return sendTelegramMessage(message);
    }
  );

  /**
   * Escalate to manager for non-joining inquiries or issues.
   */
  const escalateToManager = ai.defineTool(
    {
      name: "escalate_to_manager",
      description:
        "Escalate a conversation to the manager for non-joining inquiries (sponsorship, merchandise, complaints, media requests) or unusual situations that need human attention. Do NOT respond to the user - just escalate.",
      inputSchema: EscalateToManagerInputSchema,
      outputSchema: TelegramOutputSchema,
    },
    async (input) => {
      const username = input.username.replace(/^@/, "");
      const esc = escapeMarkdownV2;

      const message = [
        `🚨 *Escalation \\- ${esc(input.priority || "normal")}*`,
        ``,
        `📸 *Instagram:* [@${esc(username)}](https://instagram\\.com/${esc(username)})`,
        `📝 *Reason:* ${esc(input.reason)}`,
        ``,
        `💬 *Summary:*`,
        esc(input.summary),
      ].join("\n");

      const result = await sendTelegramMessage(message);

      if (result.success) {
        const db = getDb();
        try {
          await db.collection("users").doc(input.userId).set(
            { lastNotification: Date.now() },
            { merge: true }
          );
        } catch (error) {
          logger.error("Failed to record lastNotification", {
            userId: input.userId,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }

        try {
          await db.collection("threads").doc(input.conversationId).set(
            { escalated: true },
            { merge: true }
          );
        } catch (error) {
          logger.error("Failed to set escalated flag on thread", {
            conversationId: input.conversationId,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      return result;
    }
  );

  return [notifyBookingConfirmed, escalateToManager];
}

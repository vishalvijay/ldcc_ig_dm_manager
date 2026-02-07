/**
 * WhatsApp Tools - Manager notification via WhatsApp Business API.
 *
 * Provides tools for sending notifications to the club manager.
 */

import * as logger from "firebase-functions/logger";
import { z } from "zod";
import { Genkit, ToolAction } from "genkit";
import { getDb } from "../config/firebase";
import { GRAPH_API_VERSION } from "../config";

// WhatsApp configuration
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const MANAGER_WHATSAPP_NUMBER = process.env.MANAGER_WHATSAPP_NUMBER || "";
const NET_SESSION_COORDINATOR = process.env.NET_SESSION_COORDINATOR || "Adarsh";

// WhatsApp API response types
interface WhatsAppAPIError {
  error?: {
    message?: string;
    code?: number;
  };
}

interface WhatsAppSendResponse extends WhatsAppAPIError {
  messages?: Array<{
    id?: string;
  }>;
}

// Template name for manager notifications (must be approved in Meta Business Suite)
const WHATSAPP_BOOKING_TEMPLATE = process.env.WHATSAPP_BOOKING_TEMPLATE || "hello_world";
const WHATSAPP_ESCALATION_TEMPLATE = process.env.WHATSAPP_ESCALATION_TEMPLATE || "hello_world";

/**
 * Send a WhatsApp template message.
 * Templates are required to initiate conversations outside the 24-hour window.
 */
async function sendWhatsAppTemplateMessage(
  to: string,
  templateName: string,
  templateParams: string[]
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    logger.warn("WhatsApp credentials not configured");
    return {
      success: false,
      error: "WhatsApp credentials not configured",
    };
  }

  try {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

    // Build template components with parameters
    const components = templateParams.length > 0 ? [{
      type: "body",
      parameters: templateParams.map(text => ({ type: "text", text })),
    }] : [];

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: "en" },
          ...(components.length > 0 && { components }),
        },
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as WhatsAppAPIError;
      logger.error("Failed to send WhatsApp template message", {
        status: response.status,
        error: errorData,
      });
      return {
        success: false,
        error: errorData.error?.message || response.statusText,
      };
    }

    const data = (await response.json()) as WhatsAppSendResponse;
    logger.info("Sent WhatsApp template message", {
      to,
      templateName,
      messageId: data.messages?.[0]?.id,
    });

    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("WhatsApp send failed", { error: errorMessage });
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
});

const EscalateToManagerInputSchema = z.object({
  userId: z.string().describe("The Instagram user ID"),
  reason: z.string().describe("Brief reason for escalation (e.g., 'Sponsorship inquiry', 'Complaint', 'Media request')"),
  summary: z.string().describe("Summary of the conversation for manager context"),
  username: z.string().describe("Instagram username of the person"),
  priority: z
    .enum(["low", "normal", "high"])
    .optional()
    .default("normal")
    .describe("Priority level: high for urgent/complaints, normal for general inquiries, low for FYI"),
});

const WhatsAppOutputSchema = z.object({
  success: z.boolean(),
  messageId: z.string().optional().describe("WhatsApp message ID if sent successfully"),
  error: z.string().optional().describe("Error message if failed"),
});

// =============================================================================
// Tool Definitions
// =============================================================================

/**
 * Define WhatsApp tools for the GenKit AI instance.
 */
export function defineWhatsAppTools(ai: Genkit): ToolAction[] {
  /**
   * Notify manager about a confirmed booking.
   */
  const notifyBookingConfirmed = ai.defineTool(
    {
      name: "notify_booking_confirmed",
      description:
        "Send a WhatsApp notification to the manager when a user confirms attendance at a net session. Use this after recording the booking.",
      inputSchema: NotifyBookingInputSchema,
      outputSchema: WhatsAppOutputSchema,
    },
    async (input) => {
      if (!MANAGER_WHATSAPP_NUMBER) {
        logger.warn("Manager WhatsApp number not configured");
        return { success: false, error: "Manager WhatsApp number not configured" };
      }

      const displayName = input.userName || `@${input.username}`;
      const contact = input.userPhone || "Not provided";

      // Template params: name, session date, contact, coordinator
      return sendWhatsAppTemplateMessage(MANAGER_WHATSAPP_NUMBER, WHATSAPP_BOOKING_TEMPLATE, [
        displayName,
        input.sessionDate,
        contact,
        NET_SESSION_COORDINATOR,
      ]);
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
      outputSchema: WhatsAppOutputSchema,
    },
    async (input) => {
      if (!MANAGER_WHATSAPP_NUMBER) {
        logger.warn("Manager WhatsApp number not configured");
        return { success: false, error: "Manager WhatsApp number not configured" };
      }

      // Template params: username only (keeping it simple to avoid delivery failures)
      const result = await sendWhatsAppTemplateMessage(MANAGER_WHATSAPP_NUMBER, WHATSAPP_ESCALATION_TEMPLATE, [
        input.username,
      ]);

      if (result.success) {
        try {
          await getDb().collection("users").doc(input.userId).set(
            { lastNotification: Date.now() },
            { merge: true }
          );
        } catch (error) {
          logger.error("Failed to record lastNotification", {
            userId: input.userId,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      return result;
    }
  );

  return [notifyBookingConfirmed, escalateToManager];
}

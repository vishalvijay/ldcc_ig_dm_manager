/**
 * WhatsApp Tools - Manager notification via WhatsApp Business API.
 *
 * Provides tools for sending notifications to the club manager.
 */

import * as logger from "firebase-functions/logger";
import { z } from "zod";
import { Genkit, ToolAction } from "genkit";

// WhatsApp configuration
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const MANAGER_WHATSAPP_NUMBER = process.env.MANAGER_WHATSAPP_NUMBER || "";

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

/**
 * Check if WhatsApp mock mode is enabled.
 */
function isWhatsAppMockMode(): boolean {
  return (
    process.env.MOCK_WHATSAPP === "true" ||
    !WHATSAPP_ACCESS_TOKEN ||
    !WHATSAPP_PHONE_NUMBER_ID
  );
}

/**
 * Send a WhatsApp message.
 */
async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (isWhatsAppMockMode()) {
    const mockId = `mock_wa_${Date.now()}`;
    logger.info("MOCK: Sending WhatsApp message", {
      to,
      message: message.substring(0, 100),
      mockMessageId: mockId,
    });
    return { success: true, messageId: mockId };
  }

  try {
    const url = `https://graph.facebook.com/v22.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as WhatsAppAPIError;
      logger.error("Failed to send WhatsApp message", {
        status: response.status,
        error: errorData,
      });
      return {
        success: false,
        error: errorData.error?.message || response.statusText,
      };
    }

    const data = (await response.json()) as WhatsAppSendResponse;
    logger.info("Sent WhatsApp message", {
      to,
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

const SendManagerNotificationInputSchema = z.object({
  reason: z.string().describe("Brief reason for the notification"),
  summary: z.string().describe("Summary of the conversation for manager context"),
  userId: z.string().describe("Instagram user ID of the person being discussed"),
  username: z.string().optional().describe("Instagram username if known"),
  priority: z
    .enum(["low", "normal", "high"])
    .optional()
    .default("normal")
    .describe("Priority level of the notification"),
});

const SendManagerNotificationOutputSchema = z.object({
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
  const sendManagerNotification = ai.defineTool(
    {
      name: "sendManagerNotification",
      description:
        "Send a WhatsApp notification to the manager (Vishal) about an inquiry that needs attention. Use this for: non-joining inquiries, confirmed session bookings that need follow-up, unusual situations, or when you need human intervention.",
      inputSchema: SendManagerNotificationInputSchema,
      outputSchema: SendManagerNotificationOutputSchema,
    },
    async (input) => {
      if (!MANAGER_WHATSAPP_NUMBER) {
        logger.warn("Manager WhatsApp number not configured");
        return {
          success: false,
          error: "Manager WhatsApp number not configured",
        };
      }

      // Format the notification message
      const priorityEmoji = input.priority === "high" ? "🚨" : input.priority === "low" ? "📝" : "📩";
      const userInfo = input.username ? `@${input.username}` : `User ID: ${input.userId}`;

      const message = `${priorityEmoji} LDCC DM Alert

Reason: ${input.reason}

From: ${userInfo}

Summary: ${input.summary}`;

      return sendWhatsAppMessage(MANAGER_WHATSAPP_NUMBER, message);
    }
  );

  return [sendManagerNotification];
}

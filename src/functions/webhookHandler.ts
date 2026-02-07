/**
 * Instagram Webhook Handler.
 *
 * Single endpoint handling both GET (verification) and POST (messages).
 */

import * as crypto from "crypto";
import * as logger from "firebase-functions/logger";
import { onRequest } from "firebase-functions/v2/https";
import {
  MetaMessengerWebhookPayload,
  MetaMessengerWebhookAttachment,
  MetaMessengerWebhookMessage,
  MetaMessengerWebhookMessagingEvent,
  InstagramMessage,
} from "../types";
import { storeMessage, scheduleProcessing, deleteConversationData } from "../services/messageStore";
import { REGION, TEST_MODE_SENDER_ID, RESET_KEYWORD } from "../config";

// Environment variables
const META_MESSENGER_VERIFY_TOKEN = process.env.META_MESSENGER_VERIFY_TOKEN || "";
const META_MESSENGER_APP_SECRET = process.env.META_MESSENGER_APP_SECRET || "";
const META_MESSENGER_PAGE_ID = process.env.META_MESSENGER_PAGE_ID || "";

/**
 * Validate X-Hub-Signature-256 header.
 */
function validateSignature(
  payload: string,
  signature: string | undefined
): boolean {
  if (!signature || !META_MESSENGER_APP_SECRET) {
    logger.warn("Missing signature or app secret");
    return false;
  }

  const expectedSignature =
    "sha256=" +
    crypto
      .createHmac("sha256", META_MESSENGER_APP_SECRET)
      .update(payload)
      .digest("hex");

  // Ensure same length before timing-safe comparison to prevent length-based attacks
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * Determine message type from webhook message object.
 */
function getMessageType(
  message: MetaMessengerWebhookMessage | undefined
): InstagramMessage["messageType"] {
  if (!message) return "other";

  if (message.attachments && message.attachments.length > 0) {
    const firstAttachment = message.attachments[0];
    const attachmentType = firstAttachment?.type as MetaMessengerWebhookAttachment["type"];

    switch (attachmentType) {
      case "story_mention":
        return "story_mention";
      case "story_reply":
        return "story_reply";
      case "image":
        return "image";
      case "video":
        return "video";
      case "audio":
        return "audio";
      case "file":
        return "file";
      case "share":
        return "share";
      case "reel":
        return "reel";
      case "ig_reel":
        return "ig_reel";
      default:
        return "other";
    }
  }

  if (message.text) return "text";
  return "other";
}

/**
 * Transform webhook messaging event to InstagramMessage.
 */
function transformToInstagramMessage(
  event: MetaMessengerWebhookMessagingEvent
): InstagramMessage | null {
  if (!event.message) return null;

  return {
    id: event.message.mid,
    senderId: event.sender.id,
    recipientId: event.recipient.id,
    text: event.message.text || "",
    timestamp: event.timestamp,
    messageType: getMessageType(event.message),
    ...(event.message.reply_to ? { replyToMessageId: event.message.reply_to.mid } : {}),
  };
}

/**
 * Check if this event should be processed.
 * Filters out echoes, reactions, read receipts, and messages from our page.
 */
function shouldProcessEvent(event: MetaMessengerWebhookMessagingEvent): boolean {
  // Skip echo messages (sent by us)
  if (event.message?.is_echo) {
    logger.debug("Skipping echo message");
    return false;
  }

  // Skip reaction events
  if (event.reaction) {
    logger.debug("Skipping reaction event");
    return false;
  }

  // Skip read receipt events
  if (event.read) {
    logger.debug("Skipping read receipt event");
    return false;
  }

  // Skip postback events (button clicks) - log for now
  if (event.postback) {
    logger.info("Received postback event", {
      title: event.postback.title,
      payload: event.postback.payload,
    });
    return false;
  }

  // Log referral events but don't skip if there's also a message
  if (event.referral) {
    logger.info("Received referral event", {
      source: event.referral.source,
      type: event.referral.type,
      ref: event.referral.ref,
    });
    // Continue processing if there's a message attached
  }

  // Skip if no message content
  if (!event.message) {
    logger.debug("Skipping event with no message");
    return false;
  }

  // Skip messages from our own page
  if (event.sender.id === META_MESSENGER_PAGE_ID) {
    logger.debug("Skipping message from our page");
    return false;
  }

  return true;
}

/**
 * Check if sender is allowed in test mode.
 * Returns true if test mode is disabled or if the sender ID matches.
 */
function isAllowedInTestMode(senderId: string): boolean {
  if (!TEST_MODE_SENDER_ID) {
    return true;
  }

  const allowed = senderId === TEST_MODE_SENDER_ID;

  if (!allowed) {
    logger.info("Test mode: skipping message from non-allowed sender", {
      senderId,
      allowedSenderId: TEST_MODE_SENDER_ID,
    });
  }

  return allowed;
}

/**
 * Instagram Webhook Handler.
 *
 * Handles both:
 * - GET requests: Webhook verification (Facebook sends hub.challenge)
 * - POST requests: Incoming messages and events from Instagram
 */
export const instagramWebhook = onRequest(
  {
    region: REGION,
    cors: false,
  },
  async (req, res) => {
    // Handle GET requests for webhook verification
    if (req.method === "GET") {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      logger.info("Webhook verification request", {
        mode,
        tokenReceived: !!token,
        challenge: !!challenge,
      });

      if (mode === "subscribe" && token === META_MESSENGER_VERIFY_TOKEN) {
        logger.info("Webhook verified successfully");
        res.status(200).send(challenge);
      } else {
        logger.warn("Webhook verification failed", {
          modeMatch: mode === "subscribe",
          tokenMatch: token === META_MESSENGER_VERIFY_TOKEN,
        });
        res.status(403).send("Forbidden");
      }
      return;
    }

    // Validate request method for non-GET
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    // Get raw body for signature validation (must use original bytes, not re-serialized)
    const rawBody = req.rawBody?.toString();
    if (!rawBody) {
      logger.warn("No raw body available for signature validation");
      res.status(400).send("Bad request");
      return;
    }
    const signature = req.headers["x-hub-signature-256"] as string | undefined;

    // Log request headers and rawBody for debugging
    logger.debug("Webhook request details", {
      headers: JSON.stringify(req.headers),
      rawBody,
    });

    // Validate signature (skip in emulator/development)
    if (
      META_MESSENGER_APP_SECRET &&
      process.env.FUNCTIONS_EMULATOR !== "true"
    ) {
      if (!validateSignature(rawBody, signature)) {
        logger.warn("Invalid webhook signature");
        res.status(401).send("Invalid signature");
        return;
      }
    }

    // Parse payload
    let payload: MetaMessengerWebhookPayload;
    try {
      payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch (error) {
      logger.error("Failed to parse webhook payload", { error });
      res.status(400).send("Invalid JSON");
      return;
    }

    // Validate this is an Instagram webhook
    if (payload.object !== "instagram") {
      logger.info("Ignoring non-Instagram webhook", { object: payload.object });
      res.status(200).send("OK");
      return;
    }

    logger.info("Processing Instagram webhook", {
      entryCount: payload.entry?.length || 0,
    });

    // Process each entry
    for (const entry of payload.entry || []) {
      const events = entry.messaging || [];

      logger.debug("Processing webhook entry", {
        entryId: entry.id,
        time: entry.time,
        eventCount: events.length,
      });

      for (const event of events) {
        // Check if we should process this event
        if (!shouldProcessEvent(event)) {
          continue;
        }

        // Transform to our message format
        const message = transformToInstagramMessage(event);
        if (!message) {
          logger.warn("Failed to transform message", { event });
          continue;
        }

        // Use sender ID as thread ID for Instagram DMs
        const threadId = event.sender.id;

        // Check test mode filter
        if (!isAllowedInTestMode(threadId)) {
          continue;
        }

        // Handle conversation reset command
        if (RESET_KEYWORD && message.text.trim().toLowerCase() === RESET_KEYWORD.toLowerCase()) {
          logger.info("Reset command received, deleting conversation data", {
            threadId,
          });
          try {
            await deleteConversationData(threadId);
          } catch (error) {
            logger.error("Failed to delete conversation data", {
              threadId,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
          continue;
        }

        logger.info("Processing incoming message", {
          messageId: message.id,
          threadId,
          messageType: message.messageType,
          textPreview: message.text.substring(0, 50),
        });

        try {
          // Store message and schedule processing
          await storeMessage(message, threadId);
          await scheduleProcessing(threadId, message.id);
        } catch (error) {
          logger.error("Failed to store/schedule message", {
            messageId: message.id,
            threadId,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          // Continue processing other messages
        }
      }
    }

    // Always return 200 quickly to avoid Facebook retries
    res.status(200).send("OK");
  }
);

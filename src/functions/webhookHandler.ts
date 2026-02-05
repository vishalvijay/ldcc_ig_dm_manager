/**
 * Instagram Webhook Handler.
 *
 * Single endpoint handling both GET (verification) and POST (messages).
 */

import * as crypto from "crypto";
import * as logger from "firebase-functions/logger";
import { onRequest } from "firebase-functions/v2/https";
import {
  InstagramWebhookPayload,
  InstagramWebhookMessaging,
  InstagramWebhookAttachment,
  InstagramMessage,
} from "../types";
import { storeMessage, scheduleProcessing } from "../services/messageStore";
import { getInstagramService } from "../services/instagram";
import { REGION, TEST_MODE_USERNAME } from "../config";

// Environment variables
const INSTAGRAM_VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN || "";
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || "";
const INSTAGRAM_PAGE_ID = process.env.INSTAGRAM_PAGE_ID || "";

/**
 * Validate X-Hub-Signature-256 header.
 */
function validateSignature(
  payload: string,
  signature: string | undefined
): boolean {
  if (!signature || !INSTAGRAM_APP_SECRET) {
    logger.warn("Missing signature or app secret");
    return false;
  }

  const expectedSignature =
    "sha256=" +
    crypto
      .createHmac("sha256", INSTAGRAM_APP_SECRET)
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
  message: InstagramWebhookMessaging["message"]
): InstagramMessage["messageType"] {
  if (!message) return "other";

  if (message.attachments && message.attachments.length > 0) {
    const firstAttachment = message.attachments[0];
    const attachmentType = firstAttachment?.type as InstagramWebhookAttachment["type"];

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
 * Transform webhook messaging to InstagramMessage.
 */
function transformToInstagramMessage(
  messaging: InstagramWebhookMessaging
): InstagramMessage | null {
  if (!messaging.message) return null;

  return {
    id: messaging.message.mid,
    senderId: messaging.sender.id,
    recipientId: messaging.recipient.id,
    text: messaging.message.text || "",
    timestamp: messaging.timestamp,
    messageType: getMessageType(messaging.message),
    replyToMessageId: messaging.message.reply_to?.mid,
  };
}

/**
 * Check if this message should be processed.
 * Filters out echoes, reactions, read receipts, and messages from our page.
 */
function shouldProcessMessage(messaging: InstagramWebhookMessaging): boolean {
  // Skip echo messages (sent by us)
  if (messaging.message?.is_echo) {
    logger.debug("Skipping echo message");
    return false;
  }

  // Skip reaction events
  if (messaging.reaction) {
    logger.debug("Skipping reaction event");
    return false;
  }

  // Skip read receipt events
  if (messaging.read) {
    logger.debug("Skipping read receipt event");
    return false;
  }

  // Skip postback events (button clicks) - log for now
  if (messaging.postback) {
    logger.info("Received postback event", {
      title: messaging.postback.title,
      payload: messaging.postback.payload,
    });
    return false;
  }

  // Log referral events but don't skip if there's also a message
  if (messaging.referral) {
    logger.info("Received referral event", {
      source: messaging.referral.source,
      type: messaging.referral.type,
      ref: messaging.referral.ref,
    });
    // Continue processing if there's a message attached
  }

  // Skip if no message content
  if (!messaging.message) {
    logger.debug("Skipping event with no message");
    return false;
  }

  // Skip messages from our own page
  if (messaging.sender.id === INSTAGRAM_PAGE_ID) {
    logger.debug("Skipping message from our page");
    return false;
  }

  return true;
}

/**
 * Check if sender is allowed in test mode.
 * Returns true if test mode is disabled or if the sender's username matches.
 */
async function isAllowedInTestMode(senderId: string): Promise<boolean> {
  if (!TEST_MODE_USERNAME) {
    return true;
  }

  try {
    const instagram = getInstagramService();
    const profile = await instagram.getUserProfile(senderId);
    const allowed = profile.username === TEST_MODE_USERNAME;

    if (!allowed) {
      logger.info("Test mode: skipping message from non-allowed user", {
        senderId,
        username: profile.username,
        allowedUsername: TEST_MODE_USERNAME,
      });
    }

    return allowed;
  } catch (error) {
    logger.warn("Test mode: could not verify username, skipping message", {
      senderId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
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

      if (mode === "subscribe" && token === INSTAGRAM_VERIFY_TOKEN) {
        logger.info("Webhook verified successfully");
        res.status(200).send(challenge);
      } else {
        logger.warn("Webhook verification failed", {
          modeMatch: mode === "subscribe",
          tokenMatch: token === INSTAGRAM_VERIFY_TOKEN,
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
      INSTAGRAM_APP_SECRET &&
      process.env.FUNCTIONS_EMULATOR !== "true"
    ) {
      if (!validateSignature(rawBody, signature)) {
        logger.warn("Invalid webhook signature");
        res.status(401).send("Invalid signature");
        return;
      }
    }

    // Parse payload
    let payload: InstagramWebhookPayload;
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
      for (const messaging of entry.messaging || []) {
        // Check if we should process this message
        if (!shouldProcessMessage(messaging)) {
          continue;
        }

        // Transform to our message format
        const message = transformToInstagramMessage(messaging);
        if (!message) {
          logger.warn("Failed to transform message", { messaging });
          continue;
        }

        // Use sender ID as thread ID for Instagram DMs
        const threadId = messaging.sender.id;

        // Check test mode filter
        if (!(await isAllowedInTestMode(threadId))) {
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

/**
 * Instagram Webhook Handlers - GET (verification) and POST (messages).
 *
 * Handles webhook verification and incoming Instagram messages.
 */

import * as crypto from "crypto";
import * as logger from "firebase-functions/logger";
import { onRequest } from "firebase-functions/v2/https";
import {
  InstagramWebhookPayload,
  InstagramWebhookMessaging,
  InstagramMessage,
} from "../types";
import { storeMessage, scheduleProcessing } from "../services/messageStore";

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

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Determine message type from webhook message object.
 */
function getMessageType(
  message: InstagramWebhookMessaging["message"]
): InstagramMessage["messageType"] {
  if (!message) return "other";

  if (message.attachments) {
    const firstAttachment = message.attachments[0];
    if (firstAttachment?.type === "story_mention") return "story_mention";
    if (firstAttachment?.type === "story_reply") return "story_reply";
    if (firstAttachment?.type === "image") return "image";
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
 * Filters out echoes, reactions, and messages from our page.
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
 * Instagram Webhook Verification (GET request).
 *
 * Facebook/Instagram sends a GET request to verify the webhook URL.
 * Must return the hub.challenge value if verification token matches.
 */
export const instagramWebhookVerify = onRequest(
  {
    region: "us-central1",
    cors: false,
  },
  async (req, res) => {
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
  }
);

/**
 * Instagram Webhook Handler (POST request).
 *
 * Receives incoming messages and reactions from Instagram.
 * Stores messages in Firestore and schedules processing.
 */
export const instagramWebhook = onRequest(
  {
    region: "us-central1",
    cors: false,
  },
  async (req, res) => {
    // Validate request method
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    // Get raw body for signature validation
    const rawBody =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const signature = req.headers["x-hub-signature-256"] as string | undefined;

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

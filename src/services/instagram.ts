/**
 * Instagram Service - Graph API client for Instagram messaging.
 *
 * Handles sending messages, reactions, and fetching user profiles.
 */

import * as logger from "firebase-functions/logger";
import { InstagramSender, ReactToMessageAction } from "../types";
import { GRAPH_API_VERSION } from "../config";

// Graph API base URL
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

// API Response types
interface GraphAPIError {
  error?: {
    message?: string;
    code?: number;
  };
}

interface SendMessageResponse extends GraphAPIError {
  message_id?: string;
}

interface UserProfileResponse extends GraphAPIError {
  id?: string;
  username?: string;
  name?: string;
}

// Instagram Conversation API response types
interface ConversationsResponse extends GraphAPIError {
  data?: Array<{ id: string }>;
}

interface ConversationMessagesResponse extends GraphAPIError {
  data?: Array<{
    id: string;
    message: string;
    from: { id: string; name?: string };
    created_time: string;
  }>;
}

export interface InstagramThreadMessage {
  id: string;
  text: string;
  fromId: string;
  createdTime: string;
}

/**
 * Sleep utility for retry delays.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make a request with exponential backoff retry logic.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Check for rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);

        logger.warn("Rate limited by Instagram API", {
          attempt,
          retryAfterMs: delayMs,
        });

        if (attempt < retries - 1) {
          await sleep(delayMs);
          continue;
        }
      }

      // Check for server errors that warrant retry
      if (response.status >= 500 && attempt < retries - 1) {
        const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        logger.warn("Instagram API server error, retrying", {
          status: response.status,
          attempt,
          retryAfterMs: delayMs,
        });
        await sleep(delayMs);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < retries - 1) {
        const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        logger.warn("Instagram API request failed, retrying", {
          error: lastError.message,
          attempt,
          retryAfterMs: delayMs,
        });
        await sleep(delayMs);
      }
    }
  }

  throw lastError || new Error("Request failed after retries");
}

/**
 * Instagram Graph API client.
 */
// Map reaction names to emoji characters expected by the Graph API
const REACTION_EMOJI_MAP: Record<string, string> = {
  love: "\u2764\uFE0F",
  like: "\uD83D\uDC4D",
  laugh: "\uD83D\uDE02",
  wow: "\uD83D\uDE2E",
  sad: "\uD83D\uDE22",
  angry: "\uD83D\uDE21",
};

export class InstagramService {
  private accessToken: string;
  private pageId: string;

  constructor() {
    this.accessToken = process.env.META_MESSENGER_ACCESS_TOKEN || "";
    this.pageId = process.env.META_MESSENGER_PAGE_ID || "";

    if (!this.accessToken || !this.pageId) {
      logger.warn(
        "Instagram credentials not configured. Set META_MESSENGER_ACCESS_TOKEN and META_MESSENGER_PAGE_ID."
      );
    }
  }

  /**
   * Send a message to an Instagram thread.
   *
   * @param recipientId - The recipient's Instagram user ID
   * @param text - The message text to send
   * @returns The message ID of the sent message
   */
  async sendMessage(recipientId: string, text: string): Promise<string> {
    const url = `${GRAPH_API_BASE}/${this.pageId}/messages`;
    const response = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as GraphAPIError;
      logger.error("Failed to send Instagram message", {
        status: response.status,
        error: errorData,
      });
      throw new Error(
        `Failed to send message: ${errorData.error?.message || response.statusText}`
      );
    }

    const data = (await response.json()) as SendMessageResponse;
    logger.info("Sent Instagram message", {
      recipientId,
      messageId: data.message_id,
    });

    return data.message_id || "";
  }

  /**
   * Send a reaction to a message.
   *
   * @param messageId - The message ID to react to
   * @param reaction - The reaction type
   */
  async sendReaction(
    recipientId: string,
    messageId: string,
    reaction: ReactToMessageAction["reaction"]
  ): Promise<void> {
    const url = `${GRAPH_API_BASE}/${this.pageId}/messages`;
    const response = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        sender_action: "react",
        payload: {
          message_id: messageId,
          reaction: REACTION_EMOJI_MAP[reaction] || reaction,
        },
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as GraphAPIError;
      logger.error("Failed to send Instagram reaction", {
        status: response.status,
        error: errorData,
      });
      throw new Error(
        `Failed to send reaction: ${errorData.error?.message || response.statusText}`
      );
    }

    logger.info("Sent Instagram reaction", { messageId, reaction });
  }

  /**
   * Fetch conversation messages from the Instagram API.
   *
   * Step 1: Find the conversation ID for the given user.
   * Step 2: Fetch messages from that conversation.
   *
   * @param userIgsid - The Instagram-scoped user ID
   * @param limit - Maximum number of messages to fetch (default 50)
   * @returns Messages in chronological order (oldest first)
   */
  async getConversationMessages(
    userIgsid: string,
    limit = 50
  ): Promise<InstagramThreadMessage[]> {
    // Step 1: Find conversation ID
    const convUrl =
      `${GRAPH_API_BASE}/${this.pageId}/conversations` +
      `?platform=instagram&user_id=${userIgsid}&fields=id`;

    const convResponse = await fetchWithRetry(convUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!convResponse.ok) {
      const errorData = (await convResponse.json()) as GraphAPIError;
      throw new Error(
        `Failed to find conversation: ${errorData.error?.message || convResponse.statusText}`
      );
    }

    const convData = (await convResponse.json()) as ConversationsResponse;
    const conversationId = convData.data?.[0]?.id;

    if (!conversationId) {
      logger.info("No conversation found for user", { userIgsid });
      return [];
    }

    // Step 2: Fetch messages
    const msgsUrl =
      `${GRAPH_API_BASE}/${conversationId}/messages` +
      `?fields=id,message,from,created_time&limit=${limit}`;

    const msgsResponse = await fetchWithRetry(msgsUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!msgsResponse.ok) {
      const errorData = (await msgsResponse.json()) as GraphAPIError;
      throw new Error(
        `Failed to fetch messages: ${errorData.error?.message || msgsResponse.statusText}`
      );
    }

    const msgsData = (await msgsResponse.json()) as ConversationMessagesResponse;
    const messages = msgsData.data || [];

    // API returns newest first — reverse to chronological order
    return messages
      .map((m) => ({
        id: m.id,
        text: m.message || "",
        fromId: m.from.id,
        createdTime: m.created_time,
      }))
      .reverse();
  }

  /**
   * Get user profile information.
   *
   * @param userId - The Instagram user ID
   * @returns User profile data
   */
  async getUserProfile(userId: string): Promise<InstagramSender> {
    const url = `${GRAPH_API_BASE}/${userId}?fields=id,username,name`;
    const response = await fetchWithRetry(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      // User profiles may not be accessible - return minimal info
      logger.warn("Could not fetch user profile", { userId });
      return { id: userId };
    }

    const data = (await response.json()) as UserProfileResponse;
    return {
      id: data.id || userId,
      username: data.username,
      name: data.name,
    };
  }
}

// Singleton instance
let instagramService: InstagramService | null = null;

/**
 * Get the Instagram service singleton.
 */
export function getInstagramService(): InstagramService {
  if (!instagramService) {
    instagramService = new InstagramService();
  }
  return instagramService;
}

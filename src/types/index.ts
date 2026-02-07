import { z } from "zod";

// =============================================================================
// Instagram Message Types
// =============================================================================

export interface InstagramMessage {
  id: string;
  senderId: string;
  recipientId: string;
  text: string;
  timestamp: number;
  messageType:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "file"
    | "share"
    | "story_mention"
    | "story_reply"
    | "reel"
    | "ig_reel"
    | "other";
  /** Reference to the message being replied to, if any */
  replyToMessageId?: string;
}

export interface InstagramSender {
  id: string;
  username?: string;
  name?: string;
}

// =============================================================================
// Conversation Context (for LLM)
// =============================================================================

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  messageId?: string;
}

// =============================================================================
// Agent Response Actions
// =============================================================================

export const SendMessageActionSchema = z.object({
  type: z.literal("send_instagram_message"),
  text: z.string().describe("The message text to send to the user"),
});

export const ReactToMessageActionSchema = z.object({
  type: z.literal("react_to_instagram_message"),
  messageId: z.string().describe("The ID of the message to react to"),
  reaction: z.enum(["love", "like", "laugh", "wow", "sad", "angry"]).describe("The reaction to send"),
});

export const NotifyManagerActionSchema = z.object({
  type: z.literal("escalate_to_manager"),
  reason: z.string().describe("Brief reason for notifying the manager"),
  summary: z.string().describe("Summary of the conversation for manager context"),
});

export const NoActionResponseSchema = z.object({
  type: z.literal("no_action"),
  reason: z.string().describe("Why no action is needed"),
});

export const AgentActionSchema = z.discriminatedUnion("type", [
  SendMessageActionSchema,
  ReactToMessageActionSchema,
  NotifyManagerActionSchema,
  NoActionResponseSchema,
]);

export const AgentResponseSchema = z.object({
  thinking: z.string().describe("Agent's reasoning about how to respond"),
  actions: z.array(AgentActionSchema).describe("List of actions to take (can be multiple)"),
});

// =============================================================================
// Type Exports from Schemas
// =============================================================================

export type SendMessageAction = z.infer<typeof SendMessageActionSchema>;
export type ReactToMessageAction = z.infer<typeof ReactToMessageActionSchema>;
export type NotifyManagerAction = z.infer<typeof NotifyManagerActionSchema>;
export type NoActionResponse = z.infer<typeof NoActionResponseSchema>;
export type AgentAction = z.infer<typeof AgentActionSchema>;
export type AgentResponse = z.infer<typeof AgentResponseSchema>;

// =============================================================================
// Firestore Thread State
// =============================================================================

export interface ThreadState {
  processing: boolean;
  hasPendingMessages: boolean;
  lastProcessedMessageId?: string;
}

// =============================================================================
// Instagram Webhook Types (Messenger Platform format)
// =============================================================================

export interface MetaMessengerWebhookAttachment {
  type:
    | "image"
    | "video"
    | "audio"
    | "file"
    | "share"
    | "story_mention"
    | "story_reply"
    | "reel"
    | "ig_reel";
  payload: {
    url?: string;
    sticker_id?: number;
    reel_video_id?: string;
    title?: string;
  };
}

export interface MetaMessengerWebhookMessage {
  mid: string;
  text?: string;
  attachments?: MetaMessengerWebhookAttachment[];
  is_echo?: boolean;
  reply_to?: {
    mid: string;
  };
  quick_reply?: {
    payload: string;
  };
}

export interface MetaMessengerWebhookReaction {
  mid: string;
  action: "react" | "unreact";
  reaction?: string;
  emoji?: string;
}

export interface MetaMessengerWebhookPostback {
  mid: string;
  title: string;
  payload: string;
}

export interface MetaMessengerWebhookReferral {
  ref?: string;
  source?: string;
  type?: string;
  ad_id?: string;
}

/**
 * Messenger Platform messaging event object.
 * Used in entry.messaging[] array.
 */
export interface MetaMessengerWebhookMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: MetaMessengerWebhookMessage;
  reaction?: MetaMessengerWebhookReaction;
  read?: { mid: string };
  postback?: MetaMessengerWebhookPostback;
  referral?: MetaMessengerWebhookReferral;
}

export interface MetaMessengerWebhookEntry {
  id: string;
  time: number;
  messaging?: MetaMessengerWebhookMessagingEvent[];
}

export interface MetaMessengerWebhookPayload {
  object: "instagram";
  entry: MetaMessengerWebhookEntry[];
}

// =============================================================================
// Execution Result Types
// =============================================================================

export interface ExecutionResult {
  action: AgentAction;
  success: boolean;
  messageId?: string;
  error?: string;
}

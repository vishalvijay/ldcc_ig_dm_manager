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

export interface ConversationContext {
  conversationId: string;
  sender: InstagramSender;
  messages: ConversationMessage[];
  /** Current pending message that triggered this flow */
  currentMessage: InstagramMessage;
}

// =============================================================================
// Agent Response Actions
// =============================================================================

export const SendMessageActionSchema = z.object({
  type: z.literal("sendMessage"),
  text: z.string().describe("The message text to send to the user"),
});

export const ReactToMessageActionSchema = z.object({
  type: z.literal("reactToMessage"),
  messageId: z.string().describe("The ID of the message to react to"),
  reaction: z.enum(["love", "like", "laugh", "wow", "sad", "angry"]).describe("The reaction to send"),
});

export const NotifyManagerActionSchema = z.object({
  type: z.literal("notifyManager"),
  reason: z.string().describe("Brief reason for notifying the manager"),
  summary: z.string().describe("Summary of the conversation for manager context"),
});

export const NoActionResponseSchema = z.object({
  type: z.literal("noAction"),
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
// Firestore Message State
// =============================================================================

export enum MessageStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  PROCESSED = "processed",
  FAILED = "failed",
}

export interface StoredMessage {
  id: string;
  conversationId: string;
  message: InstagramMessage;
  status: MessageStatus;
  createdAt: number;
  updatedAt: number;
  processedAt?: number;
  error?: string;
}

// =============================================================================
// Instagram Webhook Types
// =============================================================================

export interface InstagramWebhookAttachment {
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

export interface InstagramWebhookMessage {
  mid: string;
  text?: string;
  attachments?: InstagramWebhookAttachment[];
  is_echo?: boolean;
  reply_to?: {
    mid: string;
  };
  quick_reply?: {
    payload: string;
  };
}

export interface InstagramWebhookReaction {
  mid: string;
  action: "react" | "unreact";
  reaction?: string;
  emoji?: string;
}

export interface InstagramWebhookRead {
  watermark: number;
}

export interface InstagramWebhookPostback {
  mid: string;
  title: string;
  payload: string;
}

export interface InstagramWebhookReferral {
  ref?: string;
  source?: string;
  type?: string;
  ad_id?: string;
}

export interface InstagramWebhookMessaging {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: InstagramWebhookMessage;
  reaction?: InstagramWebhookReaction;
  read?: InstagramWebhookRead;
  postback?: InstagramWebhookPostback;
  referral?: InstagramWebhookReferral;
}

export interface InstagramWebhookEntry {
  id: string;
  time: number;
  messaging: InstagramWebhookMessaging[];
}

export interface InstagramWebhookPayload {
  object: "instagram";
  entry: InstagramWebhookEntry[];
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

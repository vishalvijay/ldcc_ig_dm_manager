# Sprint 4: Instagram Integration

## Status: Complete

## Goals
- Build Instagram service for API calls
- Create webhook handler for incoming DMs
- Implement Cloud Tasks scheduling with message batching
- Ensure sequential processing per user (concurrency = 1)

## Completed Tasks

### 4.1 Instagram Service
- [x] Create `src/services/instagram.ts`
- [x] Implement sendMessage(recipientId, text)
- [x] Implement sendReaction(messageId, reaction)
- [x] Implement getThreadMessages(threadId, limit)
- [x] Implement getUserProfile(userId)
- [x] Handle rate limiting with exponential backoff
- [x] Retry logic (3 attempts)

### 4.2 Instagram Tools (Action-based)
- [x] Update `src/tools/instagram.ts` with action tools
- [x] `sendInstagramMessage` - LLM can send messages directly
- [x] `reactToInstagramMessage` - LLM can react to messages
- [x] `getThreadMessages` - fetch conversation history
- [x] `isNewThread` - check if first-time user

### 4.3 WhatsApp Tools
- [x] Update `src/tools/whatsapp.ts` with implementation
- [x] `sendManagerNotification` - notify manager via WhatsApp

### 4.4 Webhook Handler
- [x] Create `src/functions/webhookHandler.ts`
- [x] GET handler for webhook verification
- [x] POST handler for incoming messages
- [x] X-Hub-Signature-256 validation
- [x] Parse Instagram webhook payload
- [x] Filter for messaging events (ignore echoes, reactions)

### 4.5 Message Store
- [x] Create `src/services/messageStore.ts`
- [x] Store message in Firestore with `MessageStatus.PENDING`
- [x] Create Cloud Task with randomized delay (5-15s)
- [x] Atomic message claiming with transaction
- [x] Sequential processing check (skip if another task processing)
- [x] Atomic mark-processed + check-pending

### 4.6 Message Processor
- [x] Create `src/functions/processMessage.ts`
- [x] Cloud Task callback function
- [x] Atomic claim of pending messages
- [x] Concurrency control (1 task per thread)
- [x] Call dmAgent flow with context
- [x] Schedule follow-up if new messages arrived
- [x] Reset to pending on failure for retry

### 4.7 Type Updates
- [x] Add `MessageStatus` enum
- [x] Add webhook payload types
- [x] Add `ExecutionResult` type

## Architecture

### Tool-Based Actions
The LLM directly calls tools to execute actions (no separate action executor):
```
LLM → Tool Calls → Instagram/WhatsApp APIs
```

Tools available to the agent:
- `sendInstagramMessage` - reply to user
- `reactToInstagramMessage` - react with emoji
- `sendManagerNotification` - alert manager via WhatsApp
- `getNetSessionDates` - fetch Spond session dates
- `getThreadMessages` - fetch conversation history

### Message Flow
```
Instagram Webhook
       ↓
   Validate signature
       ↓
   Store message (status: PENDING)
       ↓
   Schedule Cloud Task (5-15s delay, dedup by threadId)
       ↓
   [Task executes]
       ↓
   Atomic claim (skip if another task PROCESSING)
       ↓
   Build context + call dmAgentFlow
       ↓
   LLM calls tools directly (sendMessage, react, notify)
       ↓
   Atomic: mark PROCESSED + check for new PENDING
       ↓
   Schedule follow-up if needed
```

### Concurrency Control
```
Task A starts → claims [m1, m2] → PROCESSING
Task B starts → sees PROCESSING → exits early (200 OK)
Task A finishes → marks PROCESSED → checks pending
  → finds m3 → schedules Task C
Task C processes m3
```

### Failure Handling
```
Task claims messages → PROCESSING
Task fails
  → Reset messages to PENDING (in separate try-catch)
  → Return 500 (Cloud Tasks retries)
Next task can claim and retry
```

## Message Status Enum
```typescript
export enum MessageStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  PROCESSED = "processed",
  FAILED = "failed",
}
```

## Firestore Structure
```
conversations/{threadId}/messages/{mid}
  - id: string
  - conversationId: string
  - message: InstagramMessage
  - status: MessageStatus
  - createdAt: number
  - updatedAt: number
  - processedAt?: number
  - error?: string
```

## File Structure
```
src/
├── config/
│   ├── firebase.ts
│   └── genkit.ts
├── flows/
│   └── dmAgent.ts
├── functions/
│   ├── webhookHandler.ts
│   └── processMessage.ts
├── prompts/
│   └── system.ts
├── services/
│   ├── instagram.ts
│   └── messageStore.ts
├── tools/
│   ├── index.ts
│   ├── instagram.ts
│   ├── whatsapp.ts
│   ├── firestore.ts
│   └── spond.ts
├── types/
│   └── index.ts
└── index.ts
```

## Environment Variables
| Variable | Purpose |
|----------|---------|
| `INSTAGRAM_ACCESS_TOKEN` | Graph API token |
| `INSTAGRAM_PAGE_ID` | Business page ID |
| `INSTAGRAM_VERIFY_TOKEN` | Webhook verification |
| `INSTAGRAM_APP_SECRET` | Signature validation |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp API token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp phone ID |
| `MANAGER_WHATSAPP_NUMBER` | Manager's WhatsApp |
| `PROCESS_MESSAGE_URL` | Cloud Tasks callback URL |
| `CLOUD_TASKS_QUEUE` | Queue name (default: dm-processing) |

## Verification
```bash
# Build
npm run build

# Lint
npm run lint

# Start emulators
npm run serve

# Test webhook verification
curl "http://localhost:5001/{project}/us-central1/instagramWebhookVerify?hub.mode=subscribe&hub.verify_token=test&hub.challenge=123"

# Test GenKit dev UI
npm run genkit:dev
```

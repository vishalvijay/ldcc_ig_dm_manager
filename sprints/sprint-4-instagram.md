# Sprint 4: Instagram Integration

## Goals
- Build Instagram service for API calls
- Create webhook handler for incoming DMs
- Implement Cloud Tasks debouncing with idempotency
- Use mock services for local testing

## Tasks

### 4.1 Instagram Service
- [ ] Create `src/services/instagram.ts`
- [ ] Implement sendMessage(threadId, text)
- [ ] Implement sendReaction(messageId, reaction)
- [ ] Implement getThreadMessages(threadId)
- [ ] Implement getUserProfile(userId)
- [ ] Handle rate limiting and retries

### 4.2 Webhook Handler
- [ ] Create `src/functions/webhookHandler.ts`
- [ ] Implement GET handler for webhook verification
- [ ] Implement POST handler for incoming messages
- [ ] Parse Instagram webhook payload
- [ ] Filter for messaging events only

### 4.3 Message Debouncer
- [ ] Create `src/services/debouncer.ts`
- [ ] Store message in Firestore with status 'pending'
- [ ] Create Cloud Task with randomized delay (5-15s)
- [ ] Use messageId as idempotency key
- [ ] Prevent duplicate task creation

### 4.4 Message Processor
- [ ] Create `src/functions/processMessage.ts`
- [ ] Cloud Task callback function
- [ ] Fetch all pending messages for thread
- [ ] Use Firestore transaction for status update
- [ ] Call dmAgent flow with context
- [ ] Mark messages as 'processed'

### 4.5 Mock Services
- [ ] Create mock Instagram service for emulator
- [ ] Log API calls instead of making real requests
- [ ] Enable via environment variable

## Instagram Webhook Payload
```typescript
interface InstagramWebhookPayload {
  object: 'instagram';
  entry: [{
    id: string;  // Page ID
    time: number;
    messaging: [{
      sender: { id: string };
      recipient: { id: string };
      timestamp: number;
      message?: {
        mid: string;
        text: string;
      };
    }];
  }];
}
```

## Debouncing Flow
```
1. Webhook receives message
2. Store in Firestore: conversations/{threadId}/messages/{mid}
   - status: 'pending'
   - timestamp: now
3. Create Cloud Task (if not exists for thread)
   - delay: random 5-15 seconds
   - idempotency key: threadId + window
4. Task executes processMessage
5. Fetch all 'pending' messages for thread
6. Transaction: mark all as 'processing'
7. Call dmAgent with combined context
8. Transaction: mark all as 'processed'
```

## File Structure After Sprint
```
src/
├── config/
├── flows/
├── functions/
│   ├── webhookHandler.ts
│   └── processMessage.ts
├── prompts/
├── schemas/
├── services/
│   ├── debouncer.ts
│   └── instagram.ts
├── tools/
├── types/
└── index.ts
```

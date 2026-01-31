# Sprint 5: WhatsApp & Message Processing

## Goals
- Build WhatsApp notification service
- Create action executor for agent responses
- Complete end-to-end message processing pipeline
- Test with Firebase emulator

## Tasks

### 5.1 WhatsApp Service
- [ ] Create `src/services/whatsapp.ts`
- [ ] Implement sendMessage(phoneNumber, text)
- [ ] Implement sendTemplateMessage for notifications
- [ ] Handle rate limiting
- [ ] Mock service for local testing

### 5.2 Action Executor
- [ ] Create `src/services/actionExecutor.ts`
- [ ] Process AgentResponse actions array
- [ ] Execute actions in order:
  - sendMessage → Instagram service
  - reactToMessage → Instagram service
  - notifyManager → WhatsApp service
  - noAction → Log only
- [ ] Handle action failures gracefully
- [ ] Record actions in Firestore for audit

### 5.3 Complete Pipeline
- [ ] Wire up processMessage → dmAgent → actionExecutor
- [ ] Add error handling and retry logic
- [ ] Implement dead letter queue for failures
- [ ] Add logging throughout pipeline

### 5.4 End-to-End Testing
- [ ] Test with Firebase emulator
- [ ] Mock Instagram webhook calls
- [ ] Verify message debouncing works
- [ ] Verify agent responds correctly
- [ ] Verify WhatsApp notifications sent

## Action Executor Logic
```typescript
async function executeActions(
  response: AgentResponse,
  context: ConversationContext
): Promise<void> {
  for (const action of response.actions) {
    switch (action.type) {
      case 'sendMessage':
        await instagram.sendMessage(context.threadId, action.content);
        break;
      case 'reactToMessage':
        await instagram.sendReaction(action.messageId, action.reaction);
        break;
      case 'notifyManager':
        const lastNotif = await getLastNotification(context.userId);
        if (!lastNotif || daysSince(lastNotif) >= 7) {
          await whatsapp.sendMessage(MANAGER_NUMBER, formatNotification(action));
          await recordNotification(context.userId);
        }
        break;
      case 'noAction':
        logger.info('No action taken', { reason: action.reason });
        break;
    }
  }
}
```

## WhatsApp Notification Format
```
🔔 LDCC Instagram DM Alert

User: @username
Thread: instagram.com/direct/t/xxx

Reason: {reason}

Context: {context}

---
Reply on Instagram to respond.
```

## File Structure After Sprint
```
src/
├── config/
├── flows/
├── functions/
├── prompts/
├── schemas/
├── services/
│   ├── actionExecutor.ts
│   ├── debouncer.ts
│   ├── instagram.ts
│   └── whatsapp.ts
├── tools/
├── types/
├── utils/
└── index.ts
```

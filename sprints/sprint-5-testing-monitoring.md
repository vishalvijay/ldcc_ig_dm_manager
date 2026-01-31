# Sprint 5: Testing, Monitoring & Observability

## Status: Pending

## Overview
Sprint 4 implemented a tool-based architecture where the LLM directly calls tools to execute actions (Instagram messages, reactions, WhatsApp notifications). This eliminated the need for a separate action executor. Sprint 5 focuses on testing, monitoring, and production readiness.

## Goals
- End-to-end testing with Firebase emulator
- Add observability and audit logging
- Implement dead letter queue for failed messages
- Performance optimization

## Completed Tasks (from Sprint 4)

### WhatsApp Integration
- [x] `src/tools/whatsapp.ts` - `sendManagerNotification` tool
- [x] WhatsApp Business API integration with mock mode
- [x] Priority-based notification formatting (🚨 high / 📩 normal / 📝 low)

### Action Execution (Tool-Based)
- [x] LLM directly calls tools for actions (no separate executor needed)
- [x] `sendInstagramMessage` - reply to user
- [x] `reactToInstagramMessage` - react with emoji
- [x] `sendManagerNotification` - WhatsApp alerts
- [x] Error handling with message status reset

### Pipeline
- [x] Complete flow: Webhook → Store → Cloud Tasks → Agent → Tools → APIs
- [x] Error handling with automatic retry (return 500)
- [x] Message status reset on failure

## Remaining Tasks

### 5.1 Audit & Observability
- [ ] Create `src/services/auditLog.ts`
- [ ] Log all tool executions to Firestore `auditLogs/{id}`
- [ ] Track: action type, input, output, latency, errors
- [ ] Add structured logging with correlation IDs

### 5.2 Dead Letter Queue
- [ ] Create Firestore collection `failedMessages/{id}`
- [ ] Move messages to DLQ after 3 Cloud Tasks retries
- [ ] Store: original message, error details, retry count
- [ ] Admin function to replay DLQ messages

### 5.3 End-to-End Testing
- [ ] Test with Firebase emulator (`npm run serve`)
- [ ] Mock Instagram webhook calls
- [ ] Verify message debouncing (5-15s delay)
- [ ] Verify agent responds correctly
- [ ] Verify WhatsApp notifications sent

### 5.4 Performance Monitoring
- [ ] Add latency tracking to dmAgentFlow
- [ ] Track token usage per conversation
- [ ] Create Cloud Monitoring dashboard
- [ ] Set up alerts for error rate > 1%

## File Structure After Sprint
```
src/
├── config/
├── flows/
├── functions/
├── prompts/
├── services/
│   ├── auditLog.ts      # NEW: Action audit logging
│   ├── instagram.ts
│   └── messageStore.ts
├── tools/
├── types/
└── index.ts
```

## Architecture Note
Sprint 4 adopted a tool-based approach where the LLM orchestrates all actions:
```
Webhook → Store → Cloud Tasks → dmAgentFlow → LLM → Tool Calls → APIs
```

This is simpler than the originally planned action executor pattern and gives the LLM full control over action sequencing.

# Sprint 3: GenKit Tools & MCP Integration

## Goals
- Integrate Spond MCP for session data
- Create Firestore tools for state management
- Connect tools to dmAgent flow
- LLM can fetch real session dates

## Tasks

### 3.1 Spond MCP Integration
- [ ] Create `src/tools/spond.ts`
- [ ] Configure MCP client with `@genkit-ai/mcp`
- [ ] Connect to Spond MCP server URL
- [ ] Expose tools: getUpcomingSessions, getSessionDetails
- [ ] Handle MCP unavailability gracefully

### 3.2 Firestore Tools
- [ ] Create `src/tools/firestore.ts`
- [ ] Tool: getConversationHistory
- [ ] Tool: getUserProfile (previous interactions)
- [ ] Tool: checkLastNotification (prevent duplicate notifications)
- [ ] Tool: recordBooking

### 3.3 Instagram Tools (Stubs)
- [ ] Create `src/tools/instagram.ts`
- [ ] Tool: getThreadMessages
- [ ] Tool: isNewThread
- [ ] Implementation will be in Sprint 4

### 3.4 WhatsApp Tools (Stubs)
- [ ] Create `src/tools/whatsapp.ts`
- [ ] Tool: sendManagerNotification
- [ ] Implementation will be in Sprint 5

### 3.5 Tool Registry
- [ ] Create `src/tools/index.ts`
- [ ] Export all tools for dmAgent flow
- [ ] Update dmAgent to use tools

## Spond MCP Configuration
```typescript
import { mcpClient } from '@genkit-ai/mcp';

const spondClient = mcpClient({
  name: 'spond',
  serverUrl: 'https://us-central1-spond-mcp-server.cloudfunctions.net/mcp/mcp'
});
```

## Firestore Collections
```
conversations/
  {threadId}/
    messages/
      {messageId}: { text, timestamp, sender, status }
    metadata: { userId, userName, lastActivity }

users/
  {igUserId}/
    lastNotification: timestamp
    bookings: []

sessions/
  {sessionId}: { date, time, location, capacity, attendees }
```

## File Structure After Sprint
```
src/
├── config/
├── flows/
├── prompts/
├── schemas/
├── tools/
│   ├── index.ts
│   ├── firestore.ts
│   ├── instagram.ts
│   ├── spond.ts
│   └── whatsapp.ts
├── types/
└── index.ts
```

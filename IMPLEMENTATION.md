# LDCC Instagram DM Agent - Sprint Implementation Plan

## Overview
Build an Instagram DM agent for London Desperados Cricket Club using Firebase GenKit with an LLM-first approach. The LLM orchestrates all conversations, with tools providing data access.

## Technical Stack
- **Runtime**: Firebase Functions v2
- **AI Framework**: Firebase GenKit
- **LLM**: Google AI - Gemini
- **Language**: TypeScript with ESLint
- **MCP**: @genkit-ai/mcp (Spond integration)
- **Database**: Firestore (state management)
- **Task Queue**: Cloud Tasks (debouncing with idempotency)
- **APIs**: Instagram Graph API, WhatsApp Business API

---

## Sprint Overview

| Sprint | Focus | Detailed Plan |
|--------|-------|---------------|
| 1 | Foundation & Infrastructure | [sprint-1-foundation.md](sprints/sprint-1-foundation.md) |
| 2 | Core DM Agent Flow | [sprint-2-dm-agent-flow.md](sprints/sprint-2-dm-agent-flow.md) |
| 3 | GenKit Tools & MCP Integration | [sprint-3-tools-mcp.md](sprints/sprint-3-tools-mcp.md) |
| 4 | Instagram Integration | [sprint-4-instagram.md](sprints/sprint-4-instagram.md) |
| 5 | WhatsApp & Message Processing | [sprint-5-whatsapp-processing.md](sprints/sprint-5-whatsapp-processing.md) |
| 6 | Account Setup, Testing & Deployment | [sprint-6-deployment.md](sprints/sprint-6-deployment.md) |
| 7 | Web UI for Chat Testing | [sprint-7-web-test-ui.md](sprints/sprint-7-web-test-ui.md) |

---

## Project Structure

```
src/
├── config/
│   ├── firebase.ts      # Firebase Admin init
│   └── genkit.ts        # GenKit configuration
├── flows/
│   └── dmAgent.ts       # Main DM agent flow
├── functions/
│   ├── webhookHandler.ts  # Instagram webhook
│   ├── processMessage.ts  # Debounced message processor
│   ├── testChat.ts        # Test chat API endpoint
│   └── testConversations.ts # Conversation management API
├── prompts/
│   └── system.ts        # System prompt with club context
├── schemas/
│   └── agentResponse.ts # Zod schemas for structured output
├── services/
│   ├── actionExecutor.ts  # Execute agent actions
│   ├── debouncer.ts     # Message debouncing
│   ├── instagram.ts     # Instagram API client
│   ├── whatsapp.ts      # WhatsApp API client
│   └── testRunner.ts    # Test mode agent runner
├── tools/
│   ├── index.ts         # Tool registry
│   ├── firestore.ts     # Firestore tools
│   ├── instagram.ts     # Instagram GenKit tools
│   ├── spond.ts         # Spond MCP client
│   └── whatsapp.ts      # WhatsApp GenKit tools
├── types/
│   └── index.ts         # TypeScript types
├── utils/
│   ├── errorHandler.ts  # Error handling
│   └── rateLimiter.ts   # Rate limiting
└── index.ts             # Main entry point

public/
├── index.html           # Chat test UI
├── styles.css           # Chat styling
└── app.js               # Frontend JavaScript
```

---

## Key Design Decisions

### LLM-First Approach
- The LLM is the "brain" - it decides what to do based on conversation context
- No hardcoded intent classification or state machines
- Intent emerges naturally from conversation history through multiple exchanges
- Tools provide data; LLM decides how to use it
- Progressive information reveal is guided by system prompt, not code logic

### Action-Based Responses
- LLM returns structured actions (send, react, notify)
- Executor processes actions after LLM response
- Allows multiple actions per response (e.g., send message + react)

### Debouncing Strategy (with Idempotency)
- Store messages in Firestore with unique `messageId` and `threadId`
- Cloud Tasks schedules processing after randomized delay (5-15s)
- Firestore transactions prevent race conditions and duplicate processing
- Messages tracked as: `pending` → `processing` → `processed`

---

## Environment Variables Required

```env
# Firebase
FIREBASE_PROJECT_ID=

# Google AI (Gemini)
GOOGLE_API_KEY=

# Meta Messenger API
META_MESSENGER_ACCESS_TOKEN=
META_MESSENGER_PAGE_ID=
META_MESSENGER_VERIFY_TOKEN=
META_MESSENGER_APP_SECRET=

# WhatsApp
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
MANAGER_WHATSAPP_NUMBER=+919995533909

# Cloud Tasks
PROCESS_MESSAGE_URL=
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Instagram API rate limits | Implement backoff, queue messages |
| LLM hallucination | Strong system prompt, tool-grounded responses |
| Webhook failures | Retry logic, dead letter queue |
| Spond MCP unavailable | Graceful fallback, notify manager |
| Duplicate message processing | Idempotency with Firestore transactions |

---

## Verification Checklist

- [ ] GenKit dev UI accessible and flow testable
- [ ] Firebase emulator runs all functions
- [ ] Test webhook triggers full flow
- [ ] Spond MCP returns session data
- [ ] Production deployment successful
- [ ] Instagram webhook connected
- [ ] WhatsApp notifications working
- [ ] End-to-end booking flow complete
- [ ] Web test UI accessible and functional
- [ ] Test conversations work without Instagram

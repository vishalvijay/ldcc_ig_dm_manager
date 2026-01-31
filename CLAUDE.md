# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run build           # Compile TypeScript to lib/
npm run build:watch     # Watch mode compilation
npm run lint            # Run ESLint on src/
npm run lint:fix        # Auto-fix lint issues
npm run serve           # Build and start Firebase emulators
npm run deploy          # Deploy to Firebase Functions
npm run genkit:dev      # Start GenKit dev UI with hot reload
```

## Architecture

This is an Instagram DM agent for London Desperados Cricket Club built on:
- **Firebase Functions v2** - Serverless runtime
- **Firebase GenKit** - AI orchestration framework
- **Google AI (Gemini)** - LLM provider
- **Firestore** - State management and message tracking
- **Cloud Tasks** - Message debouncing with idempotency

### LLM-First Design

The LLM orchestrates all conversations. No hardcoded intent classification or state machines. The agent:
1. Receives Instagram DMs via webhook
2. Debounces rapid messages (5-15s randomized delay)
3. LLM decides response based on conversation context
4. Returns structured actions (sendMessage, reactToMessage, notifyManager, noAction)
5. Action executor processes the response

### External Integrations

- **Spond MCP** (`@genkit-ai/mcp`) - Fetches net session dates from `https://us-central1-spond-mcp-server.cloudfunctions.net/mcp/mcp`
- **Instagram Graph API** - Send messages, reactions
- **WhatsApp Business API** - Manager notifications

### Message Flow

```
Instagram Webhook → Firestore (store message) → Cloud Tasks (debounce)
→ dmAgent Flow (LLM + tools) → Action Executor → Instagram/WhatsApp APIs
```

### Message States

Messages tracked in Firestore: `pending` → `processing` → `processed`

## Environment Variables

Required in `.env` or Firebase config:
- `GOOGLE_API_KEY` - Gemini API key
- `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_PAGE_ID`, `INSTAGRAM_VERIFY_TOKEN`, `INSTAGRAM_APP_SECRET`
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
- `MANAGER_WHATSAPP_NUMBER` - For notifications (+919995533909)
- `PROCESS_MESSAGE_URL` - Cloud Tasks callback URL

## Domain Context

See PROJECT.md for club information, agent behavior requirements, and conversation flow guidelines. Key points:
- Agent acts as Vishal (social media manager)
- Progressive information reveal (don't share all details upfront)
- Only respond to joining inquiries; notify manager for other intents

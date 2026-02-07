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
npm run logs            # View Firebase Functions logs
npm run genkit:dev      # Start GenKit dev UI with hot reload
npm run genkit:flow:run # Run a specific GenKit flow
```

## Testing Flows

Use GenKit dev UI (`npm run genkit:dev`) to test the dmAgent flow interactively. The UI provides a visual interface to invoke flows with test inputs and inspect outputs.

## Architecture

This is an Instagram DM agent for London Desperados Cricket Club built on:
- **Firebase Functions v2** - Serverless runtime
- **Firebase GenKit** - AI orchestration framework
- **Google AI (Gemini)** - LLM provider
- **Firestore** - State management and message tracking
- **Cloud Tasks** - Message debouncing with idempotency

### Tool-Based Architecture

The LLM orchestrates all conversations via tool calls. No hardcoded intent classification or state machines. The agent:
1. Receives Instagram DMs via webhook (`webhookHandler.ts`)
2. Stores message in Firestore, schedules Cloud Task with debounce delay (5-15s)
3. Cloud Task triggers `processMessage.ts` which claims pending messages atomically
4. LLM in `dmAgentFlow` decides actions and executes them directly via tool calls
5. Tools handle Instagram/WhatsApp API calls and Firestore updates

### Tool Categories

- **MCP Tools** (`src/tools/spond.ts`) - Fetches net session dates from Spond via `@genkit-ai/mcp`
- **Instagram Tools** (`src/tools/instagram.ts`) - sendInstagramMessage, reactToInstagramMessage
- **WhatsApp Tools** (`src/tools/whatsapp.ts`) - notifyManager via WhatsApp Business API
- **Firestore Tools** (`src/tools/firestore.ts`) - Conversation state management

### Message Flow

```
Instagram Webhook → Firestore (store message) → Cloud Tasks (debounce)
→ processMessage (claim pending) → dmAgent Flow (LLM + tools) → APIs
```

### Message States

Messages tracked in Firestore: `pending` → `processing` → `processed` (or `failed`)

### Firestore Collections

- `threads/{threadId}/messages/{messageId}` - Individual messages with status
- Uses composite indexes for querying by status (see `firestore.indexes.json`)

## Key Files

- `src/flows/dmAgent.ts` - Main GenKit flow with LLM and tool orchestration
- `src/prompts/system.ts` - System prompt with club knowledge and behavioral guidelines
- `src/config.ts` - Environment variable configuration and validation
- `src/tools/index.ts` - Tool registry combining MCP and local tools
- `src/tools/*.ts` - Individual tool definitions (instagram, whatsapp, firestore, spond)
- `src/types/index.ts` - Zod schemas for messages, actions, and webhook payloads
- `src/functions/webhookHandler.ts` - Instagram webhook with signature validation
- `src/functions/processMessage.ts` - Cloud Task callback with OIDC auth
- `src/services/messageStore.ts` - Firestore operations with atomic claims
- `src/services/instagram.ts` - Instagram Graph API client

## Environment Variables

Required in `.env` or Firebase config:
- `GOOGLE_API_KEY` - Gemini API key
- `META_MESSENGER_ACCESS_TOKEN`, `META_MESSENGER_PAGE_ID`, `META_MESSENGER_VERIFY_TOKEN`, `META_MESSENGER_APP_SECRET`
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BOOKING_TEMPLATE`, `WHATSAPP_ESCALATION_TEMPLATE` - WhatsApp message template names
- `MANAGER_WHATSAPP_NUMBER` - For notifications
- `NET_SESSION_COORDINATOR` - Contact info for net session queries
- `PROCESS_MESSAGE_URL` - Cloud Tasks callback URL (for OIDC audience validation)
- `CLOUD_TASKS_QUEUE` - Cloud Tasks queue name

Optional:
- `TEST_MODE_SENDER_ID` - When set, only accept messages from this sender ID (for testing)

## Deployment

Functions deploy to `europe-west2` region by default (configurable via `CLOUD_FUNCTIONS_REGION` env var).

```bash
npm run deploy                              # Deploy functions
firebase deploy --only firestore:indexes   # Deploy Firestore indexes (required for queries)
```

CI/CD: Pushing to `main` branch triggers automatic deployment via GitHub Actions (`.github/workflows/deploy-firebase.yml`).

## Domain Context

See PROJECT.md for club information, agent behavior requirements, and conversation flow guidelines. Key points:
- Agent acts as Vishal (social media manager)
- Progressive information reveal (don't share all details upfront)
- Only respond to joining inquiries; notify manager for other intents

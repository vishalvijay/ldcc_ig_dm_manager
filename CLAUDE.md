# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run build           # Compile TypeScript to lib/
npm run build:watch     # Watch mode compilation
npm run lint            # Run ESLint on src/
npm run lint:fix        # Auto-fix lint issues
npm run serve           # Build and start Firebase emulators (functions + Firestore on ports 5001/8080)
npm run deploy          # Deploy to Firebase Functions
npm run logs            # View Firebase Functions logs
npm run genkit:dev      # Start GenKit dev UI with hot reload (test dmAgent flow interactively)
npm run genkit:flow:run # Run a specific GenKit flow
```

No automated test suite exists. Test flows manually via GenKit dev UI (`npm run genkit:dev`).

## Architecture

Instagram DM agent for London Desperados Cricket Club built on Firebase Functions v2, Firebase GenKit (AI orchestration), configurable LLM provider (Anthropic Claude or Google Gemini), Firestore (state management), and Cloud Tasks (message debouncing).

### Tool-Based Architecture

The LLM orchestrates all conversations via tool calls — no hardcoded intent classification or state machines. The agent:
1. Receives Instagram DMs via webhook (`webhookHandler.ts`) with HMAC-SHA256 signature validation
2. Stores message in Firestore as `pending`, schedules Cloud Task with 60s debounce delay
3. Cloud Task triggers `processMessage.ts` which claims pending messages atomically via Firestore transaction
4. LLM in `dmAgentFlow` decides actions and calls tools directly (auto tool execution by GenKit)
5. After processing, atomically checks for new pending messages and schedules follow-up task if needed

### Message Flow

```
Instagram Webhook → Firestore (store as pending) → Cloud Tasks (60s debounce)
→ processMessage (atomic claim via transaction) → dmAgent Flow (LLM + tools) → APIs
→ markProcessedAndCheckPending → schedule follow-up if new messages arrived
```

### Tool Categories

- **MCP Tools** (`src/tools/spond.ts`) — Net session dates from Spond via `@genkit-ai/mcp`
- **Instagram Tools** (`src/tools/instagram.ts`) — sendInstagramMessage, reactToInstagramMessage, getThreadMessages, isNewThread
- **Telegram Tools** (`src/tools/telegram.ts`) — notifyBookingConfirmed, escalateToManager (via Telegram Bot API)
- **Firestore Tools** (`src/tools/firestore.ts`) — getConversationHistory, getUserProfile, checkLastNotification, recordBooking
- **No-op Tool** (`src/tools/` via tool registry) — `no_action` for when the LLM decides no response is needed (e.g., reactions, duplicate messages, conversation already ended)

### Firestore Collections

- `conversations/{threadId}/messages/{messageId}` — Individual messages with status tracking
- `users/{userId}` — User profiles, booking history, last notification timestamp
- `bookings/{bookingId}` — Standalone booking records
- Composite indexes required for status queries (see `firestore.indexes.json`, deploy with `firebase deploy --only firestore:indexes`)

### Message States

`pending` → `processing` → `processed` (or `failed`)

### Concurrency Control

- **Debouncing**: Cloud Tasks with time-window-based naming (60s buckets) prevents duplicate tasks per thread
- **Atomic claiming**: Firestore transaction checks no messages are already `processing` before claiming `pending` ones
- **Follow-up scheduling**: After processing, atomically marks messages processed and checks for new pending ones

## Key Files

- `src/flows/dmAgent.ts` — Main GenKit flow with LLM and tool orchestration
- `src/prompts/system.ts` — System prompt with club knowledge and behavioral guidelines
- `src/config/genkit.ts` — GenKit + model provider configuration (Anthropic or Google AI)
- `src/tools/index.ts` — Tool registry combining MCP and local tools
- `src/types/index.ts` — Zod schemas and TypeScript interfaces for messages, actions, webhooks
- `src/functions/webhookHandler.ts` — Instagram webhook with HMAC signature validation
- `src/functions/processMessage.ts` — Cloud Task callback with OIDC auth validation
- `src/services/messageStore.ts` — Firestore operations, atomic claims, Cloud Tasks scheduling
- `src/services/instagram.ts` — Instagram Graph API client with retry/rate-limit handling

## Environment Variables

Required in `.env` (see `.env.example` for template):
- `AI_MODEL` — Model name, e.g. `claude-sonnet-4` or `gemini-2.0-flash` (provider auto-detected from name)
- `ANTHROPIC_API_KEY` — Required for `claude-*` models
- `GOOGLE_API_KEY` — Required for `gemini-*` models
- `META_MESSENGER_ACCESS_TOKEN`, `META_MESSENGER_PAGE_ID`, `META_MESSENGER_VERIFY_TOKEN`, `META_MESSENGER_APP_SECRET`
- `TELEGRAM_BOT_TOKEN` — Telegram bot token from @BotFather
- `TELEGRAM_CHAT_ID` — Telegram chat ID for manager notifications
- `NET_SESSION_COORDINATOR` — Contact info for net session queries

Optional:
- `TEST_MODE_SENDER_ID` — When set, only accept messages from this sender ID (for testing)
- `CLOUD_FUNCTIONS_REGION` — Defaults to `europe-west2`
- `DEBOUNCE_DELAY_SECONDS` — Debounce window for Cloud Tasks (default 60)
- `RESET_KEYWORD` — Keyword that triggers conversation reset
- `ENABLE_FIREBASE_MONITORING` — Enable Firebase telemetry

## Deployment

CI/CD: Pushing to `main` triggers automatic deployment via GitHub Actions (`.github/workflows/deploy-firebase.yml`).

```bash
npm run deploy                              # Deploy functions + Firestore indexes
```

## Domain Context

- Agent acts as Vishal (social media manager) for London Desperados Cricket Club
- Progressive information reveal (don't share all details upfront) — controlled by system prompt in `src/prompts/system.ts`
- Only respond to joining inquiries; notify manager via Telegram for other intents
- Booking flow: interest → session dates (from Spond) → location → name/phone → confirmation
- All club knowledge (leagues, achievements, net session details, tone guidelines) lives in the system prompt

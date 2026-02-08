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
2. Marks thread as pending in Firestore, schedules Cloud Task with 60s debounce delay
3. Cloud Task triggers `processMessage.ts` which acquires thread lock atomically via Firestore transaction
4. Fetches full conversation from Instagram Graph API, then invokes `dmAgentFlow` (LLM + tools, auto tool execution by GenKit)
5. After processing, releases lock and checks for new pending messages; schedules follow-up task if needed

### Message Flow

```
Instagram Webhook → markThreadPending (Firestore) → scheduleProcessing (Cloud Task, 60s debounce)
→ processMessage (acquireThreadLock via transaction) → dmAgent Flow (LLM + tools) → APIs
→ releaseThreadLockAndCheck → schedule follow-up if new messages arrived
```

### Tool Categories

- **MCP Tools** (`src/tools/spond.ts`) — Net session dates from Spond via `@genkit-ai/mcp` (registered as Dynamic Action Provider, referenced as `spond:tool/*`)
- **Instagram Tools** (`src/tools/instagram.ts`) — `send_instagram_message`, `react_to_instagram_message`
- **Telegram Tools** (`src/tools/telegram.ts`) — `notify_booking_confirmed`, `escalate_to_manager` (via Telegram Bot API)
- **Firestore Tools** (`src/tools/firestore.ts`) — `get_user_profile`, `check_last_notification`, `record_booking`
- **No-op Tool** (`src/tools/index.ts`) — `no_action` for when the LLM decides no response is needed (e.g., reactions, duplicate messages, conversation already ended)

### Firestore Collections

- `threads/{threadId}` — Thread-level lock state (`processing`, `hasPendingMessages` booleans)
- `users/{userId}` — User profiles, booking history, last notification timestamp
- `bookings/{bookingId}` — Standalone booking records
- Composite indexes defined in `firestore.indexes.json` (deploy with `firebase deploy --only firestore:indexes`)

### Thread States

Thread-level state managed via `threads/{threadId}` document with two booleans:
- `hasPendingMessages` — Set `true` by webhook when new message arrives
- `processing` — Set `true` when a Cloud Task acquires the lock, `false` when released

### Concurrency Control

- **Debouncing**: Cloud Tasks with time-window-based naming (`process-{threadId}-{timeWindow}`) prevents duplicate tasks per thread
- **Atomic locking**: Firestore transaction checks thread is not already `processing` and has pending messages before acquiring lock
- **Follow-up scheduling**: After processing, atomically releases lock and checks if new messages arrived; schedules follow-up task if so

## Key Files

- `src/index.ts` — Main entry point, exports functions and flows
- `src/config.ts` — Shared constants (region, Graph API version, test mode, reset keyword)
- `src/config/genkit.ts` — GenKit + model provider configuration (Anthropic or Google AI, lazy plugin init)
- `src/config/firebase.ts` — Firebase Admin SDK initialization (singleton pattern)
- `src/flows/dmAgent.ts` — Main GenKit flow with LLM and tool orchestration
- `src/prompts/system.ts` — System prompt with club knowledge and behavioral guidelines
- `src/tools/index.ts` — Tool registry combining MCP and local tools (with promise cache to prevent re-registration)
- `src/tools/spond.ts` — Spond MCP client for net session dates
- `src/tools/instagram.ts` — Instagram messaging and reaction tools
- `src/tools/firestore.ts` — User profile, notification cooldown, and booking tools
- `src/tools/telegram.ts` — Manager notification tools (booking confirmed, escalation)
- `src/types/index.ts` — Zod schemas and TypeScript interfaces for messages, actions, webhooks
- `src/functions/webhookHandler.ts` — Instagram webhook with HMAC signature validation
- `src/functions/processMessage.ts` — Cloud Task callback with thread lock acquisition
- `src/services/messageStore.ts` — Thread state management, atomic locking, Cloud Tasks scheduling
- `src/services/instagram.ts` — Instagram Graph API client with retry/rate-limit handling

## Environment Variables

Required in `.env` (see `.env.example` for template):
- `AI_MODEL` — Model name, e.g. `claude-sonnet-4` or `gemini-2.0-flash` (provider auto-detected from name)
- `ANTHROPIC_API_KEY` — Required for `claude-*` models
- `GOOGLE_API_KEY` — Required for `gemini-*` models
- `META_MESSENGER_ACCESS_TOKEN`, `META_MESSENGER_PAGE_ID`, `META_MESSENGER_VERIFY_TOKEN`, `META_MESSENGER_APP_SECRET`
- `META_INSTAGRAM_ACCOUNT_ID` — Instagram-scoped User ID (IGSID) for the page, used for role assignment in conversations
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

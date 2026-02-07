# LDCC DM Manager

Instagram DM agent for **London Desperados Cricket Club** that automatically handles incoming messages from potential new members. Built on Firebase Functions, Firebase GenKit, and Google AI (Gemini).

## What It Does

- Responds to Instagram DMs about joining the club
- Guides users through a booking flow for trial net sessions
- Fetches live session dates from Spond via MCP
- Notifies the club manager via WhatsApp for confirmed bookings or non-joining inquiries
- Debounces rapid messages and handles concurrency safely

The agent acts as Vishal (social media manager), using progressive information reveal — sharing club details first, then session dates, location, and booking confirmation only as the conversation progresses.

## Tech Stack

- **Firebase Functions v2** — Serverless runtime
- **Firebase GenKit** — AI orchestration with tool calling
- **Google AI (Gemini)** — LLM provider
- **Firestore** — Message state tracking and user data
- **Cloud Tasks** — Message debouncing with idempotency
- **Instagram Graph API** — Receiving and sending DMs
- **WhatsApp Business API** — Manager notifications via templates
- **Spond MCP** — Live net session schedule

## Setup

### Prerequisites

- Node.js 22
- Firebase CLI (`npm install -g firebase-tools`)
- A Firebase project with Firestore and Cloud Tasks enabled
- Meta App with Instagram Messaging and WhatsApp Business API access

### Installation

```bash
npm install
cp .env.example .env
# Fill in your API keys and configuration in .env
```

### Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Description |
|----------|-------------|
| `GOOGLE_API_KEY` | Gemini API key |
| `META_MESSENGER_ACCESS_TOKEN` | Instagram/Messenger page access token |
| `META_MESSENGER_PAGE_ID` | Instagram page ID |
| `META_MESSENGER_VERIFY_TOKEN` | Webhook verification token |
| `META_MESSENGER_APP_SECRET` | For webhook signature validation |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp Business API token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp sender phone number ID |
| `MANAGER_WHATSAPP_NUMBER` | Manager's WhatsApp number for notifications |
| `PROCESS_MESSAGE_URL` | Cloud Tasks callback URL |
| `CLOUD_TASKS_QUEUE` | Cloud Tasks queue name |

Optional: `TEST_MODE_SENDER_ID` (filter messages to a single sender for testing), `CLOUD_FUNCTIONS_REGION` (defaults to `europe-west2`).

## Development

```bash
npm run build           # Compile TypeScript
npm run build:watch     # Watch mode
npm run lint            # Run ESLint
npm run serve           # Build + Firebase emulators (functions:5001, Firestore:8080, UI:4000)
npm run genkit:dev      # GenKit dev UI with hot reload — test the dmAgent flow interactively
```

### Firestore Indexes

Composite indexes are required for message status queries:

```bash
firebase deploy --only firestore:indexes
```

## Deployment

Pushing to `main` triggers automatic deployment via GitHub Actions.

Manual deploy:

```bash
npm run deploy
```

The workflow (`.github/workflows/deploy-firebase.yml`) runs lint, build, and deploys functions to Firebase. Environment variables are sourced from GitHub Secrets and Variables.

## Architecture

### Message Flow

```
Instagram DM → Webhook (signature validation) → Firestore (store as pending)
→ Cloud Tasks (60s debounce) → processMessage (atomic claim via transaction)
→ dmAgent Flow (LLM + tools) → Instagram/WhatsApp APIs
→ Mark processed + check for new pending messages
```

### LLM Tool-Based Design

No hardcoded intent classification or state machines. The LLM decides all actions via tool calls:

- **Spond MCP** — Fetch net session dates
- **Instagram tools** — Send messages, react to messages, check thread status
- **WhatsApp tools** — Notify manager of bookings or escalations
- **Firestore tools** — Conversation history, user profiles, booking records

### Concurrency Control

- **Debouncing**: Cloud Tasks with time-window-based naming (60s buckets) prevents duplicate processing
- **Atomic claiming**: Firestore transactions ensure only one task processes a thread at a time
- **Follow-up scheduling**: After processing, atomically checks for new messages that arrived during processing

## Club Context

**London Desperados Cricket Club** — London-based cricket club playing in Middlesex (Div 5) and Essex leagues with 3 teams. Middlesex and Essex League Champions 2023 & 2024. Currently recruiting players of any experience level through an Instagram ad campaign, with indoor net sessions at Leyton Sports Ground on weekends.

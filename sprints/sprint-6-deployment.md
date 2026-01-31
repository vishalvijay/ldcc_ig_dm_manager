# Sprint 6: Account Setup & Deployment

## Status: Pending

## Overview
Security hardening is complete (Sprint 4). This sprint focuses on Meta Developer App setup, Firebase configuration, and production deployment.

## Goals
- Set up Meta Developer App (Instagram + WhatsApp)
- Configure Firebase project for production
- Deploy and verify production environment

## Completed Tasks (from Sprint 4)

### Security Hardening
- [x] X-Hub-Signature-256 validation for Instagram webhooks
- [x] OIDC token validation for Cloud Tasks callbacks
- [x] Service account verification in production mode
- [x] Skip validation in emulator/development mode

### Rate Limiting & Retry
- [x] Exponential backoff in Instagram service (3 retries)
- [x] Rate limit handling (429 response)
- [x] Server error retries (500+ responses)

### Firestore Security
- [x] Create `firestore.indexes.json` for required indexes
- [x] `conversations/{threadId}/messages` - status + createdAt composite index

## Remaining Tasks

### 6.1 Meta Developer App Setup
- [ ] Create Meta Developer App
- [ ] Add Instagram Graph API product
- [ ] Add WhatsApp Business API product
- [ ] Configure Instagram webhook subscription
- [ ] Get long-lived access tokens
- [ ] Set up Instagram Business Account connection

### 6.2 Firebase Project Setup
- [ ] Create Firebase project (if not exists)
- [ ] Enable Firestore
- [ ] Enable Cloud Tasks API
- [ ] Enable GCP APIs for GenKit monitoring:
  ```bash
  gcloud services enable logging.googleapis.com cloudtrace.googleapis.com monitoring.googleapis.com
  ```
- [ ] Deploy Firestore indexes (`firebase deploy --only firestore:indexes`)
- [ ] Configure environment variables via Firebase Functions config
- [ ] Set up service account permissions for Cloud Tasks

### 6.3 Production Deployment
- [ ] Deploy functions: `npm run deploy`
- [ ] Configure webhook URL in Meta Developer Console
- [ ] Verify webhook subscription
- [ ] Test end-to-end flow with real Instagram DM
- [ ] Monitor initial production traffic

### 6.4 Verification Checklist
- [ ] GenKit dev UI accessible locally
- [ ] Firebase emulator runs all functions
- [ ] Instagram webhook verification endpoint works
- [ ] Instagram message webhook receives events
- [ ] WhatsApp notifications delivered to manager
- [ ] Cloud Functions logs accessible in console

## Meta Developer App Configuration

### Instagram Webhook
- Callback URL: `https://{region}-{project}.cloudfunctions.net/instagramWebhook`
- Verify Token: `{INSTAGRAM_VERIFY_TOKEN}`
- Subscribe to: `messages` field

### Required Permissions
- `instagram_basic`
- `instagram_manage_messages`
- `pages_messaging`
- `pages_read_engagement`

### WhatsApp Configuration
- Phone Number ID: From WhatsApp Business API
- Access Token: System user token with messaging permission

## Environment Variables (Production)
```bash
# Firebase (auto-configured)
FIREBASE_PROJECT_ID=your-project-id

# Google AI
GOOGLE_API_KEY=your-gemini-api-key

# Instagram
INSTAGRAM_ACCESS_TOKEN=long-lived-token
INSTAGRAM_PAGE_ID=your-page-id
INSTAGRAM_VERIFY_TOKEN=random-string
INSTAGRAM_APP_SECRET=your-app-secret

# WhatsApp
WHATSAPP_ACCESS_TOKEN=system-user-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-id
MANAGER_WHATSAPP_NUMBER=+919995533909

# Cloud Tasks
PROCESS_MESSAGE_URL=https://{region}-{project}.cloudfunctions.net/processMessage
```

## Monitoring Checklist
- [ ] Cloud Functions logs accessible
- [ ] Error rate < 1%
- [ ] Average response time < 5s
- [ ] Webhook delivery success > 99%
- [ ] No duplicate message processing

## Rollback Plan
1. Disable Instagram webhook subscription
2. Revert to previous function version
3. Investigate and fix issues
4. Re-enable webhook

## File Structure (Current)
```
src/
├── config/
│   ├── firebase.ts
│   └── genkit.ts
├── flows/
│   └── dmAgent.ts
├── functions/
│   ├── webhookHandler.ts    # Instagram webhook + signature validation
│   └── processMessage.ts    # Cloud Tasks callback + OIDC validation
├── prompts/
│   └── system.ts
├── services/
│   ├── instagram.ts         # Graph API client with retry/rate limiting
│   └── messageStore.ts      # Firestore CRUD + Cloud Tasks scheduling
├── tools/
│   ├── index.ts             # Tool registry
│   ├── firestore.ts         # Conversation/user data tools
│   ├── instagram.ts         # LLM action tools (send, react)
│   ├── spond.ts             # MCP client for session dates
│   └── whatsapp.ts          # Manager notification tool
├── types/
│   └── index.ts
└── index.ts                  # Function exports
```

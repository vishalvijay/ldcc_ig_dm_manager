# Sprint 6: Account Setup, Testing & Deployment

## Goals
- Set up Meta Developer App (Instagram + WhatsApp)
- Configure Firebase project and Cloud Tasks
- Implement error handling and rate limiting
- Deploy to production

## Tasks

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
- [ ] Configure environment variables
- [ ] Set up service account permissions

### 6.3 Error Handling
- [ ] Create `src/utils/errorHandler.ts`
- [ ] Centralized error logging
- [ ] Error categorization (retryable vs fatal)
- [ ] Alert on critical errors
- [ ] Dead letter queue for failed messages

### 6.4 Rate Limiting
- [ ] Create `src/utils/rateLimiter.ts`
- [ ] Instagram API rate limits (200/hour)
- [ ] WhatsApp API rate limits
- [ ] Implement token bucket algorithm
- [ ] Queue overflow handling

### 6.5 Production Deployment
- [ ] Deploy functions to Firebase
- [ ] Configure webhook URL in Meta Developer
- [ ] Verify webhook subscription
- [ ] Test end-to-end flow
- [ ] Monitor initial production traffic

### 6.6 Verification & Monitoring
- [ ] Verify GenKit dev UI accessible
- [ ] Verify Firebase emulator runs all functions
- [ ] Verify Instagram webhook connected
- [ ] Verify WhatsApp notifications working
- [ ] Set up monitoring dashboards

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

## File Structure (Final)
```
src/
├── config/
│   ├── firebase.ts
│   └── genkit.ts
├── flows/
│   └── dmAgent.ts
├── functions/
│   ├── webhookHandler.ts
│   └── processMessage.ts
├── prompts/
│   └── system.ts
├── schemas/
│   └── agentResponse.ts
├── services/
│   ├── actionExecutor.ts
│   ├── debouncer.ts
│   ├── instagram.ts
│   └── whatsapp.ts
├── tools/
│   ├── index.ts
│   ├── firestore.ts
│   ├── instagram.ts
│   ├── spond.ts
│   └── whatsapp.ts
├── types/
│   └── index.ts
├── utils/
│   ├── errorHandler.ts
│   └── rateLimiter.ts
└── index.ts
```

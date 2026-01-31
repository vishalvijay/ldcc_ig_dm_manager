# Sprint 7: Web UI for Chat Testing

## Status: Pending

## Overview
Build a web-based chat interface to test the DM agent without requiring Instagram integration. This enables rapid iteration during development and provides debugging visibility into agent reasoning.

## Goals
- Build a web-based chat interface to test the DM agent
- Enable rapid iteration without Instagram integration
- Display agent reasoning and tool calls for debugging
- Support conversation reset and history viewing

## Tasks

### 7.1 Backend API Endpoints
- [ ] Create `src/functions/testChat.ts` - POST /api/chat endpoint
- [ ] Create `src/functions/testConversations.ts` - Conversation management API
- [ ] Add test mode flag to bypass Instagram webhook logic
- [ ] Return agent's thinking, tool calls, and actions in response

### 7.2 Static File Serving
- [ ] Configure Firebase Hosting for static files
- [ ] Set up `public/` directory for web assets
- [ ] Configure rewrites in `firebase.json`

### 7.3 Chat UI Components
- [ ] Create main chat interface (`public/index.html`)
- [ ] Build message input and send functionality
- [ ] Display conversation thread with user/agent messages
- [ ] Show agent's tool calls in collapsible panel
- [ ] Display executed actions (send, react, notify)
- [ ] Add typing indicator during agent processing

### 7.4 Conversation Management
- [ ] Implement conversation selector/switcher
- [ ] Add "New Conversation" button
- [ ] Add "Reset Conversation" functionality
- [ ] Auto-scroll to latest message

### 7.5 Debug Features
- [ ] Toggle to show/hide tool call details
- [ ] Display raw agent response JSON
- [ ] Show tool inputs and outputs
- [ ] Add latency/timing information
- [ ] Error display with retry option

### 7.6 Styling & UX
- [ ] Mobile-responsive design
- [ ] Instagram-like message bubbles
- [ ] Distinct styling for agent vs user messages
- [ ] Loading states and animations
- [ ] Keyboard shortcuts (Enter to send)

## Deliverables
- Functional chat UI accessible at `/test-chat`
- Real-time conversation with the DM agent
- Debug panel showing agent internals
- Conversation management (create, reset, switch)
- Works with Firebase emulator and production

## API Specifications

### POST /api/chat
Request:
```json
{
  "conversationId": "test-conv-123",
  "message": "Hi, I want to join the club",
  "senderName": "Test User"
}
```

Response:
```json
{
  "conversationId": "test-conv-123",
  "response": "Welcome! London Desperados...",
  "toolCalls": [
    {
      "tool": "spond/get_desperados_events",
      "input": {},
      "output": [{ "date": "2024-02-15", "name": "Net Session" }]
    },
    {
      "tool": "sendInstagramMessage",
      "input": { "recipientId": "test-user", "text": "Welcome..." },
      "output": { "success": true, "messageId": "mock_123" }
    }
  ],
  "processingTimeMs": 1234
}
```

### GET /api/conversations
Response:
```json
{
  "conversations": [
    {
      "id": "test-conv-123",
      "lastMessage": "Hi, I want to join",
      "messageCount": 5,
      "updatedAt": 1234567890
    }
  ]
}
```

### POST /api/conversations/:id/reset
Response:
```json
{
  "success": true,
  "conversationId": "test-conv-123"
}
```

## File Structure After Sprint
```
src/
├── functions/
│   ├── testChat.ts        # Test chat API endpoint
│   └── testConversations.ts # Conversation management API
├── services/
│   └── testRunner.ts      # Test mode agent runner
└── index.ts               # Export new functions

public/
├── index.html             # Main chat UI
├── styles.css             # Chat styling
└── app.js                 # Frontend JavaScript
```

## Configuration

### firebase.json additions
```json
{
  "hosting": {
    "public": "public",
    "rewrites": [
      {
        "source": "/api/**",
        "function": "api"
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

## Technical Notes

### Test Mode vs Production
- Test mode uses mock sender ID (`test-user-{id}`) and simplified context
- Same dmAgentFlow processes messages
- Tools still work (Spond MCP, Firestore)
- Instagram/WhatsApp tools operate in mock mode (`MOCK_INSTAGRAM=true`, `MOCK_WHATSAPP=true`)
- All tool calls are logged and returned in response for debugging

### Frontend Stack
- Vanilla HTML/CSS/JavaScript (no build step)
- Fetch API for backend communication
- LocalStorage for UI preferences
- CSS Grid/Flexbox for layout

## Dependencies
- No additional npm packages required
- Uses existing Firebase Functions infrastructure
- Leverages dmAgentFlow from Sprint 2
- Mock mode for Instagram/WhatsApp services

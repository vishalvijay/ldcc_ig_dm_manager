# Sprint 7: Web UI for Chat Testing

## Goals
- Build a web-based chat interface to test the DM agent
- Enable rapid iteration without Instagram integration
- Display agent reasoning and actions for debugging
- Support conversation reset and history viewing

## Tasks

### 7.1 Backend API Endpoints
- [ ] Create `/api/chat` endpoint for sending test messages
- [ ] Create `/api/conversations` endpoint to list/manage conversations
- [ ] Create `/api/conversations/:id/reset` endpoint to clear conversation
- [ ] Add test mode flag to bypass Instagram-specific logic
- [ ] Return agent's thinking and actions in response

### 7.2 Static File Serving
- [ ] Configure Firebase Functions to serve static files
- [ ] Set up `public/` directory for web assets
- [ ] Add route handler for serving the UI

### 7.3 Chat UI Components
- [ ] Create main chat interface (`public/index.html`)
- [ ] Build message input and send functionality
- [ ] Display conversation thread with user/agent messages
- [ ] Show agent's thinking/reasoning in collapsible panel
- [ ] Display executed actions (send, react, notify)
- [ ] Add typing indicator during agent processing

### 7.4 Conversation Management
- [ ] Implement conversation selector/switcher
- [ ] Add "New Conversation" button
- [ ] Add "Reset Conversation" functionality
- [ ] Persist conversation list in UI
- [ ] Auto-scroll to latest message

### 7.5 Debug Features
- [ ] Toggle to show/hide agent reasoning
- [ ] Display raw agent response JSON
- [ ] Show tool calls and their results
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
  "thinking": "New user interested in joining...",
  "actions": [
    {
      "type": "sendMessage",
      "message": "Welcome! London Desperados..."
    }
  ],
  "toolCalls": [
    {
      "tool": "getUpcomingSessions",
      "input": {},
      "output": [...]
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
- Test mode uses mock sender ID and simplified context
- Same dmAgent flow processes messages
- Tools still work (Spond MCP, Firestore)
- No Instagram/WhatsApp API calls in test mode
- Actions logged but not executed externally

### Frontend Stack
- Vanilla HTML/CSS/JavaScript (no build step)
- Fetch API for backend communication
- LocalStorage for UI preferences
- CSS Grid/Flexbox for layout

## Dependencies
- No additional npm packages required
- Uses existing Firebase Functions infrastructure
- Leverages dmAgent flow from Sprint 2

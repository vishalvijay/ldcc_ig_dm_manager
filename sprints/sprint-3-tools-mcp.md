# Sprint 3: GenKit Tools & MCP Integration

## Goals
- Integrate Spond MCP for session data
- Create Firestore tools for state management
- Connect tools to dmAgent flow
- LLM can fetch real session dates

## Tasks

### 3.1 Spond MCP Integration
- [x] Create `src/tools/spond.ts`
- [x] Configure MCP client with `@genkit-ai/mcp`
- [x] Connect to Spond MCP server URL
- [x] Expose tools via `defineSpondTools()` - tools are namespaced as `spond/<tool_name>`
- [x] Handle MCP unavailability gracefully (returns empty array on error)

### 3.2 Firestore Tools
- [x] Create `src/tools/firestore.ts`
- [x] Tool: `getConversationHistory` - fetch messages for a thread
- [x] Tool: `getUserProfile` - previous interactions and bookings
- [x] Tool: `checkLastNotification` - 7-day cooldown to prevent duplicate notifications
- [x] Tool: `recordBooking` - save booking when user confirms attendance

### 3.3 Instagram Tools (Stubs)
- [x] Create `src/tools/instagram.ts`
- [x] Tool: `getThreadMessages` - stub, throws "Not implemented"
- [x] Tool: `isNewThread` - stub, throws "Not implemented"
- [x] Implementation will be in Sprint 4

### 3.4 WhatsApp Tools (Stubs)
- [x] Create `src/tools/whatsapp.ts`
- [x] Tool: `sendManagerNotification` - stub, throws "Not implemented"
- [x] Implementation will be in Sprint 5

### 3.5 Tool Registry
- [x] Create `src/tools/index.ts`
- [x] `getAllTools(ai)` - returns all available tools for dmAgent (lazy initialization)

### 3.6 Flow & Prompt Updates
- [x] Update `src/flows/dmAgent.ts` - add `tools` parameter to `ai.generate()`
- [x] Update `src/prompts/system.ts` - add Tool Usage section

## Spond MCP Configuration
```typescript
import { createMcpClient, GenkitMcpClient } from "@genkit-ai/mcp";

const SPOND_MCP_URL = "https://us-central1-spond-mcp-server.cloudfunctions.net/mcp/mcp";

let spondClient: GenkitMcpClient | null = null;

// Lazy initialization - connection established on first use
function getSpondClient(): GenkitMcpClient {
  if (!spondClient) {
    spondClient = createMcpClient({
      name: "spond",
      mcpServer: { url: SPOND_MCP_URL },
    });
  }
  return spondClient;
}

export async function defineSpondTools(ai: Genkit): Promise<ToolAction[]> {
  const client = getSpondClient();
  await client.ready();
  return await client.getActiveTools(ai);
}
```

## Firestore Collections
```
conversations/{threadId}/
  messages/{messageId}: { text, timestamp, sender, messageId? }
  (metadata on threadId doc): { userId, userName, lastActivity }

users/{igUserId}: {
  firstContact: timestamp,
  lastNotification: timestamp,
  lastBooking: timestamp,
  bookings: [{
    sessionDate: string,
    bookedAt: timestamp,
    userName?: string,
    phone?: string,
    threadId: string
  }]
}

bookings/{bookingId}: {
  userId, threadId, sessionDate, bookedAt,
  userName?, phone?, createdAt
}
```

## Tool Usage in System Prompt
Added to `src/prompts/system.ts`:
- `spond/get_desperados_events` - ALWAYS call before sharing session dates
- `checkLastNotification` - call before notifyManager action (7-day cooldown)
- `recordBooking` - call when user confirms a session date
- `getConversationHistory` / `getUserProfile` - for additional context

## File Structure After Sprint
```
src/
├── config/
│   ├── firebase.ts
│   └── genkit.ts
├── flows/
│   └── dmAgent.ts        # Updated: uses tools
├── prompts/
│   └── system.ts         # Updated: Tool Usage section
├── tools/
│   ├── index.ts          # Tool registry
│   ├── spond.ts          # Spond MCP client
│   ├── firestore.ts      # Firestore CRUD tools
│   ├── instagram.ts      # Stubs for Sprint 4
│   └── whatsapp.ts       # Stubs for Sprint 5
├── types/
│   └── index.ts
└── index.ts
```

## Verification
```bash
npm run build    # Should compile without errors
npm run lint     # Should pass linting
npm run genkit:dev   # Open http://localhost:4000, verify tools appear
```

## Testing
1. Start GenKit Dev UI: `npm run genkit:dev`
2. Open http://localhost:4000
3. Navigate to the dmAgent flow
4. Send: "What sessions are available?"
5. Verify: Agent calls `spond/get_desperados_events` before responding with dates

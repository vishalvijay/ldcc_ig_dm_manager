# Sprint 2: Core DM Agent Flow

## Goals
- Create comprehensive system prompt with all club knowledge
- Build main GenKit flow (dmAgent) with LLM-first approach
- Define action types and Zod schemas for structured output
- Test conversation flows in GenKit dev UI

## Tasks

### 2.1 System Prompt
- [ ] Create `src/prompts/system.ts`
- [ ] Include all club information from PROJECT.md
- [ ] Define progressive information reveal rules
- [ ] Include booking flow instructions
- [ ] Define tone and style guidelines

### 2.2 Agent Response Schema
- [ ] Create `src/schemas/agentResponse.ts`
- [ ] Define Zod schema for structured LLM output
- [ ] Action types: sendMessage, reactToMessage, notifyManager, noAction
- [ ] Support multiple actions per response

### 2.3 DM Agent Flow
- [ ] Create `src/flows/dmAgent.ts`
- [ ] Implement main GenKit flow with:
  - Conversation context input
  - System prompt injection
  - Structured output parsing
  - Tool bindings (placeholder for now)
- [ ] Return AgentResponse with actions

### 2.4 Testing
- [ ] Test in GenKit dev UI
- [ ] Verify LLM understands progressive reveal
- [ ] Test various conversation scenarios
- [ ] Verify structured output parsing

## System Prompt Structure
```
1. Agent identity (acting as Vishal)
2. Club information (leagues, achievements)
3. Net session details (location, cost, kit)
4. Progressive reveal rules (table format)
5. Booking flow steps
6. Tone guidelines
7. Available tools description
```

## Agent Response Schema
```typescript
{
  actions: [
    { type: 'sendMessage', content: string },
    { type: 'reactToMessage', messageId: string, reaction: string },
    { type: 'notifyManager', reason: string, context: string },
    { type: 'noAction', reason: string }
  ],
  reasoning: string  // Internal reasoning for debugging
}
```

## File Structure After Sprint
```
src/
├── config/
├── flows/
│   └── dmAgent.ts
├── prompts/
│   └── system.ts
├── schemas/
│   └── agentResponse.ts
├── types/
└── index.ts
```

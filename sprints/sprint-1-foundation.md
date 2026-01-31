# Sprint 1: Foundation & Infrastructure

## Goals
- Initialize TypeScript project with ESLint
- Set up Firebase Functions v2 and Firestore
- Configure GenKit with Gemini model
- Define core types

## Tasks

### 1.1 Project Initialization
- [x] Create package.json with dependencies
- [ ] Create tsconfig.json
- [ ] Create .eslintrc.js
- [ ] Create .gitignore
- [ ] Create firebase.json

### 1.2 Firebase Configuration
- [ ] Initialize Firebase Admin SDK (`src/config/firebase.ts`)
- [ ] Set up Firestore collections structure
- [ ] Create Firebase emulator configuration

### 1.3 GenKit Configuration
- [ ] Configure GenKit with Google AI plugin (`src/config/genkit.ts`)
- [ ] Set up Gemini model configuration
- [ ] Verify GenKit dev UI works

### 1.4 Core Types
- [ ] Define `InstagramMessage` type
- [ ] Define `ConversationContext` type
- [ ] Define `AgentResponse` type
- [ ] Define action types (sendMessage, reactToMessage, notifyManager, noAction)

## Deliverables
- Working TypeScript compilation
- ESLint passing
- Firebase emulator running
- GenKit dev UI accessible
- Core type definitions complete

## Dependencies
```json
{
  "@genkit-ai/mcp": "^1.0.0",
  "firebase-admin": "^12.0.0",
  "firebase-functions": "^6.0.0",
  "genkit": "^1.0.0",
  "@genkit-ai/googleai": "^1.0.0",
  "zod": "^3.23.8"
}
```

## File Structure After Sprint
```
src/
├── config/
│   ├── firebase.ts
│   └── genkit.ts
├── types/
│   └── index.ts
└── index.ts
```

/**
 * LDCC DM Manager - Instagram DM Agent for London Desperados Cricket Club
 *
 * Main entry point for Firebase Functions.
 */

import { enableFirebaseTelemetry } from "@genkit-ai/firebase";

// Enable Firebase monitoring for GenKit (must be called before GenKit is initialized)
enableFirebaseTelemetry();

import { initializeFirebase } from "./config/firebase";

// Initialize Firebase Admin SDK
initializeFirebase();

// Export types for use in other modules
export * from "./types";

// Export GenKit flows
export { dmAgentFlow, DmAgentInputSchema } from "./flows/dmAgent";

// Export Instagram webhook function
export { instagramWebhook } from "./functions/webhookHandler";

// Export message processing function
export { processMessage } from "./functions/processMessage";

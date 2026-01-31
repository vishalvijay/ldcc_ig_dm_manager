/**
 * LDCC DM Manager - Instagram DM Agent for London Desperados Cricket Club
 *
 * Main entry point for Firebase Functions.
 */

import { initializeFirebase } from "./config/firebase";

// Initialize Firebase Admin SDK
initializeFirebase();

// Export types for use in other modules
export * from "./types";

// Export GenKit flows
export { dmAgentFlow, DmAgentInputSchema } from "./flows/dmAgent";

// Placeholder exports - functions will be added in future sprints
// export { instagramWebhook } from "./functions/webhook";
// export { processMessage } from "./functions/processMessage";

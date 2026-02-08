import { genkit } from "genkit";
import { anthropic } from "@genkit-ai/anthropic";
import { googleAI } from "@genkit-ai/google-genai";

/**
 * GenKit AI instance with configurable model.
 *
 * Set AI_MODEL to switch models. The provider is detected from the model name:
 *   - "claude-*" or "anthropic/*" → Anthropic
 *   - "gemini-*" or "google/*"   → Google AI
 *
 * Defaults to claude-sonnet-4.
 */

const modelName = process.env.AI_MODEL || "claude-sonnet-4";
const isGoogle = modelName.startsWith("gemini") || modelName.startsWith("google/");

// Only initialise the provider plugin when the API key is available.
// During `firebase deploy` source analysis the key isn't in process.env,
// but the exported functions still need to be discoverable.
const plugins = [];
if (isGoogle && process.env.GOOGLE_API_KEY) {
  plugins.push(googleAI());
} else if (!isGoogle && process.env.ANTHROPIC_API_KEY) {
  plugins.push(anthropic());
}

const model = isGoogle ? googleAI.model(modelName) : anthropic.model(modelName);

export const ai = genkit({
  plugins,
  model,
});

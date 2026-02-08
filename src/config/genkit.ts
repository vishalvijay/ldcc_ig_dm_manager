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

const plugin = isGoogle ? googleAI() : anthropic();
const model = isGoogle ? googleAI.model(modelName) : anthropic.model(modelName);

export const ai = genkit({
  plugins: [plugin],
  model,
});

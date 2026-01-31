import { genkit } from "genkit";
import { googleAI } from "@genkit-ai/google-genai";

/**
 * GenKit AI instance configured with Google AI (Gemini).
 * Uses gemini-3-flash-preview as the default model.
 */
export const ai = genkit({
  plugins: [googleAI()],
  model: googleAI.model("gemini-3-flash-preview"),
});

export const GEMINI_MODEL = googleAI.model("gemini-3-flash-preview");

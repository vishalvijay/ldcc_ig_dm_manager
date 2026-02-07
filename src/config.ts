/**
 * Shared configuration constants.
 */

export const REGION = process.env.CLOUD_FUNCTIONS_REGION || "europe-west2";

/**
 * Test mode: when set, only accept messages from this sender ID.
 * Leave empty/unset to accept messages from all users.
 */
export const TEST_MODE_SENDER_ID = process.env.TEST_MODE_SENDER_ID || "";

/**
 * Reset keyword: when a user sends this exact text, their conversation data is wiped.
 * Leave empty/unset to disable the reset feature.
 */
export const RESET_KEYWORD = process.env.RESET_KEYWORD || "";

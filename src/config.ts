/**
 * Shared configuration constants.
 */

export const REGION = process.env.CLOUD_FUNCTIONS_REGION || "europe-west2";

/**
 * Test mode: when set, only accept messages from this Instagram username.
 * Leave empty/unset to accept messages from all users.
 */
export const TEST_MODE_USERNAME = process.env.TEST_MODE_USERNAME || "";

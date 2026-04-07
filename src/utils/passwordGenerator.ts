/**
 * Utility functions for generating default passwords
 */

/**
 * Generates a default password in the format: CalyCompta{year}-{month}-{unique}
 * Example: CalyCompta2026-02-5678
 *
 * The last 4 digits of the timestamp ensure each activation gets a unique password.
 * This must match the format used in api/lib/auth-config.js
 */
export function generateDefaultPassword(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const unique = String(Date.now()).slice(-4); // Last 4 digits of timestamp

  return `CalyCompta${year}-${month}-${unique}`;
}

/**
 * Gets the current default password
 * Alias for generateDefaultPassword for clarity
 */
export const getDefaultPassword = generateDefaultPassword;

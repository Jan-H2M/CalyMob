/**
 * Utility functions for generating default passwords
 */

/**
 * Generates a default password in the format: CalyCompta{year}-{month}
 * Example: CalyCompta2025-01
 */
export function generateDefaultPassword(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  return `CalyCompta${year}-${month}`;
}

/**
 * Gets the current default password
 * Alias for generateDefaultPassword for clarity
 */
export const getDefaultPassword = generateDefaultPassword;

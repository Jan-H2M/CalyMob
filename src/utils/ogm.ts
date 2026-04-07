/**
 * Belgian OGM (Gestructureerde Mededeling / Structured Communication) Utilities
 *
 * OGM is a 12-digit payment reference used in Belgium, displayed as +++xxx/xxxx/xxxxx+++.
 * The last 2 digits are a modulo 97 check:
 *   - Take the first 10 digits as a number
 *   - Calculate remainder of division by 97
 *   - If remainder is 0, use 97 instead
 *   - Pad to 2 digits
 *
 * Example: base 1234567890 → 1234567890 % 97 = 72 → OGM = 123456789072
 * Example: base 0000000097 → 97 % 97 = 0 → use 97 → OGM = 000000009797
 *
 * @see https://nl.wikipedia.org/wiki/Gestructureerde_mededeling
 */

/**
 * Calculate modulo 97 check digits for a 10-digit OGM base.
 *
 * @param base10 - String of exactly 10 digits
 * @returns String of 2 check digits (01-97)
 * @throws Error if input is not exactly 10 digits
 */
export function calculateOgmCheckDigit(base10: string): string {
  if (!/^\d{10}$/.test(base10)) {
    throw new Error(`OGM base must be exactly 10 digits, got: "${base10}"`);
  }

  // Use BigInt for precision (10-digit numbers can exceed safe integer range)
  const remainder = Number(BigInt(base10) % 97n);
  const check = remainder === 0 ? 97 : remainder;
  return String(check).padStart(2, '0');
}

/**
 * Generate a valid 12-digit OGM from a 10-digit base number.
 *
 * @param base10 - String of exactly 10 digits
 * @returns 12-digit OGM string
 */
export function generateOgmFromBase(base10: string): string {
  const check = calculateOgmCheckDigit(base10);
  return base10 + check;
}

/**
 * Validate a 12-digit OGM by checking the modulo 97 control digits.
 *
 * @param ogm12 - String of exactly 12 digits
 * @returns true if the OGM is valid
 */
export function validateOgm(ogm12: string): boolean {
  if (!/^\d{12}$/.test(ogm12)) {
    return false;
  }

  const base10 = ogm12.substring(0, 10);
  const providedCheck = ogm12.substring(10, 12);
  const expectedCheck = calculateOgmCheckDigit(base10);

  return providedCheck === expectedCheck;
}

/**
 * Format a 12-digit OGM for display: +++xxx/xxxx/xxxxx+++
 *
 * @param ogm12 - 12-digit OGM string
 * @returns Formatted OGM string, e.g. "+++123/4567/89072+++"
 */
export function formatOgmDisplay(ogm12: string): string {
  if (!/^\d{12}$/.test(ogm12)) {
    return ogm12; // Return as-is if not valid format
  }
  return `+++${ogm12.substring(0, 3)}/${ogm12.substring(3, 7)}/${ogm12.substring(7, 12)}+++`;
}

/**
 * Parse an OGM from either display format (+++xxx/xxxx/xxxxx+++) or plain 12 digits.
 * Also handles partial formatting and common variations.
 *
 * @param input - OGM in any format
 * @returns 12-digit OGM string, or null if not a valid OGM
 */
export function parseOgm(input: string): string | null {
  if (!input) return null;

  // Strip all non-digit characters
  const digits = input.replace(/\D/g, '');

  // Must be exactly 12 digits
  if (digits.length !== 12) {
    return null;
  }

  // Validate check digit
  if (!validateOgm(digits)) {
    return null;
  }

  return digits;
}

/**
 * Extract an OGM from a Ponto bank communication/remittanceInformation field.
 *
 * Belgian banks transmit OGM in various formats:
 * - "+++123/4567/89072+++"
 * - "***123/4567/89072***"
 * - "123456789072"
 * - "+++123/4567/89072+++ Vrije tekst erna"
 *
 * @param remittanceInfo - Raw text from bank communication field
 * @returns Object with extracted OGM (or null) and remaining free text
 */
export function extractOgmFromRemittance(remittanceInfo: string): {
  ogm: string | null;
  freeText: string;
} {
  if (!remittanceInfo || remittanceInfo.trim().length === 0) {
    return { ogm: null, freeText: '' };
  }

  const trimmed = remittanceInfo.trim();

  // Pattern 1: +++xxx/xxxx/xxxxx+++ or ***xxx/xxxx/xxxxx***
  const structuredPattern = /[+*]{3}(\d{3})[/](\d{4})[/](\d{5})[+*]{3}/;
  const structuredMatch = trimmed.match(structuredPattern);

  if (structuredMatch) {
    const digits = structuredMatch[1] + structuredMatch[2] + structuredMatch[3];
    if (validateOgm(digits)) {
      // Remove the OGM part from the text to get free text
      const freeText = trimmed
        .replace(structuredPattern, '')
        .trim();
      return { ogm: digits, freeText };
    }
  }

  // Pattern 2: 12 consecutive digits at the start of the string
  const leadingDigitsMatch = trimmed.match(/^(\d{12})\b/);
  if (leadingDigitsMatch) {
    const digits = leadingDigitsMatch[1];
    if (validateOgm(digits)) {
      const freeText = trimmed.substring(12).trim();
      return { ogm: digits, freeText };
    }
  }

  // No OGM found — entire text is free text
  return { ogm: null, freeText: trimmed };
}

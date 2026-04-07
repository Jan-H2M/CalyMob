/**
 * EPC QR Code Generator Utility
 *
 * Generates EPC (European Payments Council) QR code payloads for SEPA Credit Transfers.
 * This standard allows bank apps to scan and auto-fill payment details.
 *
 * EPC QR Code Structure (12 lines):
 * 1. BCD (Service Tag - fixed)
 * 2. 002 (Version - using 002 for EEA without BIC requirement)
 * 3. 1 (Character encoding - 1=UTF-8)
 * 4. SCT (Identification Code - SEPA Credit Transfer)
 * 5. [BIC] (optional in version 002 for EEA)
 * 6. [Beneficiary Name] (max 70 chars)
 * 7. [IBAN] (max 34 chars)
 * 8. [EUR Amount] (format: EURX.XX)
 * 9. [Purpose Code] (4 chars, optional)
 * 10. [Structured Reference] (optional, ISO 11649)
 * 11. [Unstructured Text] (max 140 chars, payment description)
 * 12. [Beneficiary Info] (max 70 chars, optional)
 *
 * @see https://en.wikipedia.org/wiki/EPC_QR_code
 * @see https://www.europeanpaymentscouncil.eu/document-library/guidance-documents/quick-response-code-guidelines-enable-data-capture-initiation
 */

import { logger } from '@/utils/logger';

/**
 * Sanitize text for EPC QR code compatibility
 * EPC specification allows: a-zA-Z0-9 and /-?:().,'+ plus space
 * French/Belgian accented characters are converted to ASCII equivalents
 *
 */
function sanitizeEpcText(text: string): string {
  if (!text) return '';

  // Map of accented characters to ASCII equivalents
  const accentMap: Record<string, string> = {
    'à': 'a', 'â': 'a', 'ä': 'a', 'á': 'a', 'ã': 'a',
    'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
    'ì': 'i', 'î': 'i', 'ï': 'i', 'í': 'i',
    'ò': 'o', 'ô': 'o', 'ö': 'o', 'ó': 'o', 'õ': 'o',
    'ù': 'u', 'û': 'u', 'ü': 'u', 'ú': 'u',
    'ç': 'c', 'ñ': 'n', 'ÿ': 'y',
    'À': 'A', 'Â': 'A', 'Ä': 'A', 'Á': 'A', 'Ã': 'A',
    'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E',
    'Ì': 'I', 'Î': 'I', 'Ï': 'I', 'Í': 'I',
    'Ò': 'O', 'Ô': 'O', 'Ö': 'O', 'Ó': 'O', 'Õ': 'O',
    'Ù': 'U', 'Û': 'U', 'Ü': 'U', 'Ú': 'U',
    'Ç': 'C', 'Ñ': 'N', 'Ÿ': 'Y',
    '€': 'EUR', '&': '+', '@': 'at',
  };

  // Replace accented characters
  let sanitized = text;
  for (const [accent, replacement] of Object.entries(accentMap)) {
    sanitized = sanitized.replace(new RegExp(accent, 'g'), replacement);
  }

  // Remove any remaining non-allowed characters
  // Allowed: a-zA-Z0-9, space, and /-?:().,'+
  sanitized = sanitized.replace(/[^a-zA-Z0-9 /\-?:().,'+]/g, '');

  // Collapse multiple spaces
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

export interface EpcQrCodeData {
  beneficiaryName: string;  // Naam van de begunstigde (max 70 chars)
  iban: string;             // IBAN van de begunstigde (max 34 chars)
  amount: number;           // Bedrag in EUR (0.01 - 999999999.99)
  bic?: string;             // BIC/SWIFT code (optional in EEA with version 002)
  reference?: string;       // Gestructureerde mededeling / Communication structurée (line 10, max 35 chars)
  description?: string;     // Vrije mededeling / Texte non structuré (line 11, max 140 chars)
  purposeCode?: string;     // Purpose code (4 chars, e.g., "CHAR")
  beneficiaryInfo?: string; // Extra info (max 70 chars, optional)
}

/**
 * Detect if a text is a Belgian structured communication (gestructureerde mededeling)
 *
 * Belgian OGM format: +++XXX/XXXX/XXXXX+++ or ***XXX/XXXX/XXXXX***
 * Also accepts without delimiters: XXX/XXXX/XXXXX or XXXXXXXXXXXX (12 digits)
 *
 * The check digit (last 2 digits) = remainder of first 10 digits / 97
 * If remainder is 0, check digit = 97
 */
export function isStructuredCommunication(text: string): boolean {
  if (!text) return false;

  // Remove +++ or *** delimiters and spaces
  const cleaned = text.replace(/[+*\s]/g, '');

  // Remove slashes for pure digit check
  const digits = cleaned.replace(/\//g, '');

  // Must be exactly 12 digits
  if (!/^\d{12}$/.test(digits)) return false;

  // Validate check digit (modulo 97)
  const base = parseInt(digits.substring(0, 10), 10);
  const checkDigit = parseInt(digits.substring(10, 12), 10);
  const expectedCheck = base % 97 === 0 ? 97 : base % 97;

  return checkDigit === expectedCheck;
}

/**
 * Format a structured communication for EPC QR code line 10
 * Strips +++ delimiters but keeps the /XX/XXXX/XXXXX/ format
 * Returns empty string if not a valid structured communication
 */
export function formatStructuredReference(text: string): string {
  if (!isStructuredCommunication(text)) return '';

  // Extract pure 12 digits
  const digits = text.replace(/[^0-9]/g, '');

  // Format as XXX/XXXX/XXXXX (standard Belgian format without +++ delimiters)
  return `${digits.substring(0, 3)}/${digits.substring(3, 7)}/${digits.substring(7, 12)}`;
}

export interface EpcValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates EPC QR code data
 */
export function validateEpcData(data: EpcQrCodeData): EpcValidationResult {
  const errors: string[] = [];

  // Validate beneficiary name
  if (!data.beneficiaryName || data.beneficiaryName.trim().length === 0) {
    errors.push('Nom du bénéficiaire requis');
  } else if (data.beneficiaryName.length > 70) {
    errors.push('Nom du bénéficiaire trop long (max 70 caractères)');
  }

  // Validate IBAN
  if (!data.iban || data.iban.trim().length === 0) {
    errors.push('IBAN requis');
  } else {
    const cleanIban = data.iban.replace(/\s/g, '').toUpperCase();
    if (cleanIban.length < 15 || cleanIban.length > 34) {
      errors.push('IBAN invalide (15-34 caractères)');
    }
  }

  // Validate amount
  if (data.amount === undefined || data.amount === null) {
    errors.push('Montant requis');
  } else if (data.amount < 0.01) {
    errors.push('Montant minimum: 0.01 EUR');
  } else if (data.amount > 999999999.99) {
    errors.push('Montant maximum: 999,999,999.99 EUR');
  }

  // Validate description length
  if (data.description && data.description.length > 140) {
    errors.push('Description trop longue (max 140 caractères)');
  }

  // Validate BIC format if provided
  if (data.bic && !/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(data.bic.toUpperCase())) {
    errors.push('Format BIC invalide');
  }

  // Validate purpose code format
  if (data.purposeCode && !/^[A-Z]{4}$/.test(data.purposeCode.toUpperCase())) {
    errors.push('Purpose code doit être 4 lettres');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generates EPC QR code payload string
 *
 * @param data EPC QR code data
 * @returns The payload string for the QR code, or null if invalid
 */
export function generateEpcPayload(data: EpcQrCodeData): string | null {
  const validation = validateEpcData(data);
  if (!validation.valid) {
    logger.error('EPC data validation failed:', validation.errors);
    return null;
  }

  // Clean and format data - sanitize text fields for EPC compliance
  const cleanIban = data.iban.replace(/\s/g, '').toUpperCase();
  const cleanBic = data.bic?.replace(/\s/g, '').toUpperCase() || '';
  const beneficiaryName = sanitizeEpcText(data.beneficiaryName).substring(0, 70);
  const amount = `EUR${data.amount.toFixed(2)}`;
  const purposeCode = data.purposeCode?.toUpperCase().substring(0, 4) || '';
  const beneficiaryInfo = sanitizeEpcText(data.beneficiaryInfo || '').substring(0, 70);

  // EPC spec: line 10 (structured reference) and line 11 (unstructured text)
  // are mutually exclusive - only one should be filled.
  // If a structured reference is provided, it goes on line 10 and line 11 stays empty.
  // Otherwise, description goes on line 11.
  const reference = data.reference?.substring(0, 35) || '';
  const description = reference
    ? ''  // EPC spec: cannot use both structured ref AND unstructured text
    : sanitizeEpcText(data.description || '').substring(0, 140);

  // Build the 12-line payload
  // Note: According to EPC spec, trailing empty lines can be omitted.
  const lines = [
    'BCD',                    // 1. Service Tag
    '002',                    // 2. Version (002 = BIC optional in EEA)
    '1',                      // 3. Character encoding (1 = UTF-8)
    'SCT',                    // 4. Identification code
    cleanBic,                 // 5. BIC (optional)
    beneficiaryName,          // 6. Beneficiary name
    cleanIban,                // 7. IBAN
    amount,                   // 8. Amount
    purposeCode,              // 9. Purpose code (optional)
    reference,                // 10. Structured reference (Belgian OGM / ISO 11649)
    description,              // 11. Unstructured text (only if no structured ref)
    beneficiaryInfo,          // 12. Beneficiary info (optional)
  ];

  // Remove trailing empty lines (some bank apps have issues with them)
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
}

/**
 * Check if EPC QR code can be generated for a payment
 *
 * @returns Object with canGenerate boolean and reason if not possible
 */
export function canGenerateEpcQr(
  status: string,
  hasIban: boolean,
  isAlreadyPaid: boolean
): { canGenerate: boolean; reason?: string } {
  if (isAlreadyPaid) {
    return { canGenerate: false, reason: 'Déjà remboursé' };
  }

  // Check for payment already done status
  if (status === 'paiement_effectue') {
    return { canGenerate: false, reason: 'Paiement effectué' };
  }

  if (status !== 'approuve') {
    return { canGenerate: false, reason: 'En attente d\'approbation' };
  }

  if (!hasIban) {
    return { canGenerate: false, reason: 'IBAN non renseigné' };
  }

  return { canGenerate: true };
}

/**
 * Format IBAN for display (groups of 4)
 */
export function formatIbanDisplay(iban: string): string {
  if (!iban) return '';
  const clean = iban.replace(/\s/g, '').toUpperCase();
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

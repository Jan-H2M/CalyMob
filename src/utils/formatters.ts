/**
 * Centralized formatting utilities for CalyCompta
 * All date, currency, and number formatting should use these functions
 */

/**
 * Format date in Belgian locale
 */
export const formatDate = (
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string => {
  if (!date) return 'Date non disponible';
  
  try {
    const defaultOptions: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    };
    return new Intl.DateTimeFormat('fr-BE', options ?? defaultOptions).format(new Date(date));
  } catch {
    return 'Date invalide';
  }
};

export const formatDateLong = (date: Date | string | number): string => {
  if (!date) return 'Date non disponible';
  
  try {
    return new Intl.DateTimeFormat('fr-BE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(date));
  } catch {
    return 'Date invalide';
  }
};

export const formatDateTime = (date: Date | string | number): string => {
  if (!date) return 'Date non disponible';
  
  try {
    return new Intl.DateTimeFormat('fr-BE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  } catch {
    return 'Date invalide';
  }
};

/**
 * Format currency in Euro
 */
export const formatCurrency = (
  amount: number,
  currency = 'EUR',
  locale = 'fr-BE'
): string => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
};

/**
 * Format number with decimals
 */
export const formatNumber = (
  value: number,
  decimals = 2,
  locale = 'fr-BE'
): string => {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

/**
 * Format percentage
 */
export const formatPercentage = (
  value: number,
  decimals = 1,
  locale = 'fr-BE'
): string => {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
};

/**
 * Format IBAN with spaces
 */
export const formatIBAN = (iban: string): string => {
  return iban.replace(/(.{4})/g, '$1 ').trim();
};

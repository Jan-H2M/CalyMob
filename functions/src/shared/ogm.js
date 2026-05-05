function calculateOgmCheckDigit(base10) {
  if (!/^\d{10}$/.test(base10)) {
    throw new Error(`OGM base must be exactly 10 digits, got: "${base10}"`);
  }

  const remainder = Number(BigInt(base10) % 97n);
  const check = remainder === 0 ? 97 : remainder;
  return String(check).padStart(2, '0');
}

function validateOgm(ogm12) {
  if (!/^\d{12}$/.test(ogm12)) {
    return false;
  }

  const base10 = ogm12.slice(0, 10);
  const providedCheck = ogm12.slice(10, 12);
  return calculateOgmCheckDigit(base10) === providedCheck;
}

function formatOgmDisplay(ogm12) {
  if (!/^\d{12}$/.test(ogm12)) {
    return ogm12;
  }

  return `+++${ogm12.slice(0, 3)}/${ogm12.slice(3, 7)}/${ogm12.slice(7, 12)}+++`;
}

function extractOgmFromRemittance(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return { ogm: null, freeText: '' };
  }

  const structuredPattern = /[+*]{3}(\d{3})\/(\d{4})\/(\d{5})[+*]{3}/;
  const structuredMatch = trimmed.match(structuredPattern);
  if (structuredMatch) {
    const digits = `${structuredMatch[1]}${structuredMatch[2]}${structuredMatch[3]}`;
    if (validateOgm(digits)) {
      return {
        ogm: digits,
        freeText: trimmed.replace(structuredPattern, '').trim(),
      };
    }
  }

  const leadingDigitsMatch = trimmed.match(/^(\d{12})\b/);
  if (leadingDigitsMatch && validateOgm(leadingDigitsMatch[1])) {
    return {
      ogm: leadingDigitsMatch[1],
      freeText: trimmed.slice(12).trim(),
    };
  }

  return { ogm: null, freeText: trimmed };
}

module.exports = {
  calculateOgmCheckDigit,
  validateOgm,
  formatOgmDisplay,
  extractOgmFromRemittance,
};

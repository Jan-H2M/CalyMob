const REGION = 'europe-west1';

function getClubRef(db, clubId) {
  return db.collection('clubs').doc(clubId);
}

function buildInvalidInputError(message, details = {}) {
  const error = new Error(message || 'INVALID_INPUT');
  error.code = 'INVALID_INPUT';
  error.details = details;
  return error;
}

function buildDomainError(code, message, details = {}) {
  const error = new Error(message || code);
  error.code = code;
  error.details = details;
  return error;
}

function mapErrorToHttps(error, HttpsError) {
  const code = error && error.code ? error.code : 'internal';

  switch (code) {
    case 'INVALID_INPUT':
      return new HttpsError('invalid-argument', error.message || 'Entrée invalide', {
        code,
        ...error.details,
      });
    case 'OUT_OF_STOCK':
    case 'PRODUCT_NOT_FOUND':
    case 'PRODUCT_ARCHIVED':
    case 'ORDER_NOT_FOUND':
    case 'ORDER_NOT_CANCELLABLE':
    case 'MEMBER_NOT_FOUND':
    case 'SEASON_NOT_FOUND':
    case 'COTISATION_CLOSED':
    case 'COTISATION_ALREADY_VALID':
    case 'MEMBERSHIP_CATEGORY_MISSING':
    case 'TARIFF_NOT_FOUND':
    case 'TARIFF_UNAVAILABLE':
    case 'EMAIL_NOT_CONFIGURED':
    case 'EMAIL_MISSING':
      return new HttpsError('failed-precondition', error.message || code, {
        code,
        ...error.details,
      });
    default:
      return error instanceof HttpsError
        ? error
        : new HttpsError('internal', error && error.message ? error.message : 'Erreur interne');
  }
}

function parsePositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseMoney(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeEpcText(text) {
  if (!text) return '';

  const accentMap = {
    à: 'a', â: 'a', ä: 'a', á: 'a', ã: 'a',
    è: 'e', é: 'e', ê: 'e', ë: 'e',
    ì: 'i', î: 'i', ï: 'i', í: 'i',
    ò: 'o', ô: 'o', ö: 'o', ó: 'o', õ: 'o',
    ù: 'u', û: 'u', ü: 'u', ú: 'u',
    ç: 'c', ñ: 'n', ÿ: 'y',
    À: 'A', Â: 'A', Ä: 'A', Á: 'A', Ã: 'A',
    È: 'E', É: 'E', Ê: 'E', Ë: 'E',
    Ì: 'I', Î: 'I', Ï: 'I', Í: 'I',
    Ò: 'O', Ô: 'O', Ö: 'O', Ó: 'O', Õ: 'O',
    Ù: 'U', Û: 'U', Ü: 'U', Ú: 'U',
    Ç: 'C', Ñ: 'N', Ÿ: 'Y',
    '€': 'EUR', '&': '+', '@': 'at',
  };

  let sanitized = String(text);
  for (const [accent, replacement] of Object.entries(accentMap)) {
    sanitized = sanitized.replace(new RegExp(accent, 'g'), replacement);
  }

  sanitized = sanitized.replace(/[^a-zA-Z0-9 /\-?:().,'+]/g, '');
  return sanitized.replace(/\s+/g, ' ').trim();
}

function buildEpcQrPayload({ iban, beneficiary, amount, ogm, communication }) {
  const cleanIban = String(iban || '').replace(/\s/g, '').toUpperCase();
  const beneficiaryName = sanitizeEpcText(beneficiary).substring(0, 70);
  const reference = /^\d{12}$/.test(String(ogm || ''))
    ? `${ogm.slice(0, 3)}/${ogm.slice(3, 7)}/${ogm.slice(7, 12)}`
    : '';
  const freeCommunication = reference
    ? ''
    : sanitizeEpcText(communication || '').substring(0, 140);

  const lines = [
    'BCD',
    '002',
    '1',
    'SCT',
    '',
    beneficiaryName,
    cleanIban,
    `EUR${Number(amount || 0).toFixed(2)}`,
    '',
    reference,
    freeCommunication,
    '',
  ];

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
}

module.exports = {
  REGION,
  buildDomainError,
  buildEpcQrPayload,
  buildInvalidInputError,
  getClubRef,
  mapErrorToHttps,
  parseMoney,
  parsePositiveInteger,
};

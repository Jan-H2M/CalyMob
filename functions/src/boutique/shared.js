const admin = require('firebase-admin');

const REGION = 'europe-west1';
const TODO_OGM_PLACEHOLDER = 'TODO_OGM_GENERATE';

function getClubRef(db, clubId) {
  return db.collection('clubs').doc(clubId);
}

function isMigrationBackfill(data) {
  if (!data || typeof data !== 'object') return false;
  return Boolean(data.migration_source) || data._backfill === true;
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

function formatOgmDisplay(ogm) {
  if (!/^\d{12}$/.test(ogm)) {
    return ogm;
  }
  return `+++${ogm.slice(0, 3)}/${ogm.slice(3, 7)}/${ogm.slice(7)}+++`;
}

function validateOgm(ogm) {
  if (!/^\d{12}$/.test(ogm)) {
    return false;
  }

  const base10 = ogm.slice(0, 10);
  const providedCheck = ogm.slice(10);
  const remainder = Number(BigInt(base10) % 97n);
  const expected = String(remainder === 0 ? 97 : remainder).padStart(2, '0');
  return providedCheck === expected;
}

function extractOgmFromRemittance(remittanceInfo) {
  const text = String(remittanceInfo || '').trim();
  if (!text) {
    return { ogm: null, freeText: '' };
  }

  const structuredPattern = /[+*]{3}(\d{3})\/(\d{4})\/(\d{5})[+*]{3}/;
  const structuredMatch = text.match(structuredPattern);
  if (structuredMatch) {
    const digits = `${structuredMatch[1]}${structuredMatch[2]}${structuredMatch[3]}`;
    if (validateOgm(digits)) {
      return {
        ogm: digits,
        freeText: text.replace(structuredPattern, '').trim(),
      };
    }
  }

  const leadingDigitsMatch = text.match(/^(\d{12})\b/);
  if (leadingDigitsMatch && validateOgm(leadingDigitsMatch[1])) {
    return {
      ogm: leadingDigitsMatch[1],
      freeText: text.slice(12).trim(),
    };
  }

  return { ogm: null, freeText: text };
}

async function incrementCounter(db, docRef, fieldName = 'counter', initialValue = 1, extraData = {}) {
  return db.runTransaction(async (transaction) => {
    const counterSnap = await transaction.get(docRef);
    const nextValue = counterSnap.exists
      ? Number(counterSnap.get(fieldName) || 0) + 1
      : initialValue;

    transaction.set(docRef, {
      [fieldName]: nextValue,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...extraData,
    }, { merge: true });

    return nextValue;
  });
}

function buildTodoOgm(contextType, contextId) {
  const suffix = contextId ? `_${String(contextId).slice(0, 12)}` : '';
  const ogm = `${TODO_OGM_PLACEHOLDER}_${contextType}${suffix}`;
  return {
    ogm,
    ogm_display: ogm,
  };
}

function resolveMemberEmail(member) {
  const directEmail = typeof member.email === 'string' ? member.email.trim() : '';
  if (directEmail) return directEmail;
  return '';
}

module.exports = {
  REGION,
  TODO_OGM_PLACEHOLDER,
  buildDomainError,
  buildInvalidInputError,
  buildTodoOgm,
  extractOgmFromRemittance,
  formatOgmDisplay,
  getClubRef,
  incrementCounter,
  isMigrationBackfill,
  mapErrorToHttps,
  parseMoney,
  parsePositiveInteger,
  resolveMemberEmail,
};

const NOT_FOUND_CODES = new Set([
  5,
  '5',
  'NOT_FOUND',
  'not-found',
  'firestore/not-found',
]);

function isFirestoreNotFound(error) {
  return Boolean(error) && (
    NOT_FOUND_CODES.has(error.code)
    || NOT_FOUND_CODES.has(error.status)
  );
}

module.exports = { isFirestoreNotFound };

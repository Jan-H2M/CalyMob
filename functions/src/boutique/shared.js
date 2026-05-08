'use strict';

/**
 * Shared constants and helpers for boutique Cloud Functions.
 */

const REGION = 'europe-west1';

/**
 * Check if a Firestore document is a migration backfill record.
 * These are skipped by realtime and scheduled functions to avoid
 * processing imported data as if it were live user activity.
 *
 * @param {object} docData - The Firestore document data (or null/undefined).
 * @returns {boolean}
 */
function isMigrationBackfill(docData) {
  if (!docData) return false;
  return (
    docData.migration_source ||
    docData._backfill === true ||
    docData._backfill === 'true'
  );
}

module.exports = {
  REGION,
  isMigrationBackfill,
};

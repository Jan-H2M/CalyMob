/**
 * Migration feature-flags voor de legacy→canonical overgang van terugbetalingen
 * (Stap 3 van het migratieplan). Server-side configureerbaar via het Firestore
 * settings-document `clubs/{clubId}/settings/migration_flags`.
 *
 * DORMANT: de defaults behouden EXACT het huidige gedrag —
 *   - sync.enabled            = true   (de bestaande legacy→canonical mirror)
 *   - sync.legacyToCanonical  = true
 *   - sync.canonicalToLegacy  = false  (nieuwe richting nog UIT)
 *   - web.canonicalWrites     = false  (web schrijft nog legacy-primary)
 *   - notifications.owner     = 'legacy'
 *
 * Zolang niemand het settings-document aanmaakt, verandert er niets. De flip
 * (Stap 5a–5d) gebeurt door deze flags één voor één om te zetten, met verificatie.
 */

const DEFAULT_FLAGS = Object.freeze({
  'sync.enabled': true,
  'sync.legacyToCanonical': true,
  'sync.canonicalToLegacy': false,
  'web.canonicalWrites': false,
  'notifications.owner': 'legacy', // 'legacy' | 'canonical'
});

/**
 * Lees de flags voor een club; valt veilig terug op de defaults.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} clubId
 */
async function getMigrationFlags(db, clubId) {
  try {
    const snap = await db
      .collection('clubs')
      .doc(clubId)
      .collection('settings')
      .doc('migration_flags')
      .get();
    const overrides = snap.exists ? snap.data() || {} : {};
    return { ...DEFAULT_FLAGS, ...overrides };
  } catch (err) {
    // Bij twijfel: huidige werking behouden.
    return { ...DEFAULT_FLAGS };
  }
}

function notificationsOwner(flags) {
  return (flags && flags['notifications.owner']) || DEFAULT_FLAGS['notifications.owner'];
}

module.exports = { DEFAULT_FLAGS, getMigrationFlags, notificationsOwner };

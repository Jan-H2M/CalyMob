/**
 * Cloud Function: canonical `expense_claims` -> legacy `demandes_remboursement`.
 *
 * Triggers on: clubs/{clubId}/expense_claims/{demandeId} (any write).
 *
 * DORMANT: standaard UIT (`sync.canonicalToLegacy=false`). Wordt pas actief bij
 * de gecoördineerde flip (Stap 5b), wanneer web canonical-primary wordt en oude
 * app-versies nog legacy lezen. Tot dan doet deze functie niets (early return).
 *
 * Loop-safe: negeert canonical-writes die door de voorwaartse mirror gemaakt
 * zijn (`_sync.origin === 'legacy-mirror'`), en tagt zijn eigen legacy-writes
 * met `origin: 'canonical-mirror'` zodat de voorwaartse mirror ze negeert.
 *
 * Uses Firebase Functions v2 (Gen2).
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { getMigrationFlags } = require('./migrationFlags');
const { buildLegacyFromCanonical, tagSync, changedFields, isGenuineCanonicalWrite } = require('./expenseSync');

exports.mirrorCanonicalToLegacy = onDocumentWritten(
  {
    document: 'clubs/{clubId}/expense_claims/{demandeId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, demandeId } = event.params;
    const db = admin.firestore();

    const flags = await getMigrationFlags(db, clubId);
    // DORMANT tot de flip: enkel actief als beide vlaggen aanstaan.
    if (!flags['sync.enabled'] || !flags['sync.canonicalToLegacy']) return null;

    const afterSnap = event.data && event.data.after;
    const canonicalExists = afterSnap && afterSnap.exists;
    const legacyRef = db
      .collection('clubs').doc(clubId)
      .collection('demandes_remboursement').doc(demandeId);

    if (!canonicalExists) {
      try {
        await legacyRef.delete();
        console.log(`🗑️ [mirror C→L] Deleted legacy mirror ${clubId}/${demandeId}`);
      } catch (error) {
        console.warn(`⚠️ [mirror C→L] Legacy delete soft-failure ${demandeId}:`, error);
      }
      return null;
    }

    const canonData = afterSnap.data() || {};

    // Spiegel enkel ECHTE canonical-primary writes (origin web/app). Negeer
    // legacy-primary dubbel-writes (geen _sync) en forward-mirror-echo's
    // (origin legacy-mirror) → géén dubbele legacy-writes/mails in een tussenfase.
    if (!isGenuineCanonicalWrite(canonData)) {
      return null;
    }

    try {
      const expected = buildLegacyFromCanonical(canonData, demandeId);
      const currentSnap = await legacyRef.get();
      const current = currentSnap.exists ? currentSnap.data() : null;

      if (current && changedFields(expected, current).length === 0) {
        return null;
      }

      const payload = tagSync(expected, {
        origin: 'canonical-mirror',
        version: Date.now(),
        sourceId: demandeId,
      });
      // merge: behoud eventuele legacy-only velden die niet in de reverse-projectie zitten.
      await legacyRef.set(payload, { merge: true });
      console.log(`🔁 [mirror C→L] Synced ${clubId}/${demandeId}`);
    } catch (error) {
      console.error(`❌ [mirror C→L] Failed to sync ${demandeId}:`, error);
      throw error;
    }

    return null;
  }
);

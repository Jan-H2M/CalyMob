/**
 * Cloud Function: legacy `demandes_remboursement` -> canonical `expense_claims`.
 *
 * Triggers on: clubs/{clubId}/demandes_remboursement/{demandeId} (any write).
 *
 * Sinds Stap 5a draait deze functie op de gedeelde sync-engine (expenseSync.js)
 * en de feature-flags (migrationFlags.js). De defaults behouden EXACT het
 * eerdere gedrag (sync.enabled=true, sync.legacyToCanonical=true): elke
 * legacy-write/-delete wordt naar canonical geprojecteerd. Nieuw:
 *  - de canonical-write krijgt server-owned `_sync`-metadata (origin/version);
 *  - change-detection slaat redundante writes over (geen sleutel-volgorde-ruis);
 *  - loop-guard: writes afkomstig van de omgekeerde mirror worden genegeerd.
 *
 * Loop-safe + idempotent. Uses Firebase Functions v2 (Gen2).
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { getMigrationFlags } = require('./migrationFlags');
const { buildCanonicalFromLegacy, tagSync, changedFields } = require('./expenseSync');

exports.mirrorLegacyExpenseClaim = onDocumentWritten(
  {
    document: 'clubs/{clubId}/demandes_remboursement/{demandeId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, demandeId } = event.params;
    const db = admin.firestore();

    const flags = await getMigrationFlags(db, clubId);
    if (!flags['sync.enabled'] || !flags['sync.legacyToCanonical']) return null;

    const legacyRef = db
      .collection('clubs').doc(clubId)
      .collection('demandes_remboursement').doc(demandeId);
    const canonicalRef = db
      .collection('clubs').doc(clubId)
      .collection('expense_claims').doc(demandeId);

    try {
      const outcome = await db.runTransaction(async (transaction) => {
        // Events may arrive late or out of order. Read both current documents
        // in the same transaction before deciding what to mirror or delete.
        const legacySnap = await transaction.get(legacyRef);
        const canonicalSnap = await transaction.get(canonicalRef);
        if (!legacySnap.exists) {
          if (canonicalSnap.exists) transaction.delete(canonicalRef);
          return canonicalSnap.exists ? 'deleted' : 'unchanged';
        }

        const legacyData = legacySnap.data() || {};
        // Ignore writes originating from the reverse mirror, as before.
        if (legacyData._sync && legacyData._sync.origin === 'canonical-mirror') return 'unchanged';

        const expected = buildCanonicalFromLegacy(legacyData, demandeId);
        const current = canonicalSnap.exists ? canonicalSnap.data() : null;
        if (current && changedFields(expected, current).length === 0) return 'unchanged';

        // Update every projected field, while retaining canonical-only data.
        const payload = tagSync(expected, {
          origin: 'legacy-mirror',
          version: Date.now(),
          sourceId: demandeId,
        });
        transaction.set(canonicalRef, payload, { merge: true });
        return 'synced';
      });
      if (outcome !== 'unchanged') console.log(`🔁 [mirror L→C] ${outcome} ${clubId}/${demandeId}`);
    } catch (error) {
      console.error(`❌ [mirror L→C] Failed to sync ${demandeId}:`, error);
      throw error;
    }

    return null;
  }
);

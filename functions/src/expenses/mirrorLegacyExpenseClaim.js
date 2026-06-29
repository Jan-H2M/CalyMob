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

    const afterSnap = event.data && event.data.after;
    const legacyExists = afterSnap && afterSnap.exists;
    const canonicalRef = db
      .collection('clubs').doc(clubId)
      .collection('expense_claims').doc(demandeId);

    // Deletion -> remove the canonical mirror too.
    if (!legacyExists) {
      try {
        await canonicalRef.delete();
        console.log(`🗑️ [mirror L→C] Deleted canonical mirror ${clubId}/${demandeId}`);
      } catch (error) {
        console.warn(`⚠️ [mirror L→C] Canonical delete soft-failure ${demandeId}:`, error);
      }
      return null;
    }

    const legacyData = afterSnap.data() || {};

    // Loop-guard: negeer legacy-writes die door de omgekeerde mirror gemaakt zijn.
    if (legacyData._sync && legacyData._sync.origin === 'canonical-mirror') {
      return null;
    }

    try {
      const expected = buildCanonicalFromLegacy(legacyData, demandeId);
      const currentSnap = await canonicalRef.get();
      const current = currentSnap.exists ? currentSnap.data() : null;

      // Change-detection: sla redundante writes over (negeert _sync + key-volgorde).
      if (current && changedFields(expected, current).length === 0) {
        return null;
      }

      // Volledige projectie (canonical = afgeleide van legacy) + server-owned _sync.
      const payload = tagSync(expected, {
        origin: 'legacy-mirror',
        version: Date.now(),
        sourceId: demandeId,
      });
      await canonicalRef.set(payload);
      console.log(`🔁 [mirror L→C] Synced ${clubId}/${demandeId} (status=${expected.status}, amount=${expected.amount})`);
    } catch (error) {
      console.error(`❌ [mirror L→C] Failed to sync ${demandeId}:`, error);
      throw error;
    }

    return null;
  }
);

#!/usr/bin/env node

/**
 * Reconstruct legacy hard-deleted registrations from the append-only audit log.
 *
 * Dry-run is the default. Use --apply only after deploying the current audit
 * trigger, so each reconstruction receives an explicit historical_restored
 * journal entry. The script is idempotent: an existing registration is never
 * overwritten.
 */

const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;

if (PROJECT_ID !== 'calycompta') {
  console.error('Refusing to run: set GCLOUD_PROJECT=calycompta explicitly.');
  process.exit(2);
}

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

function isLegacyHardDelete(data) {
  return data.event === 'unregistered'
    && (data.registration_status_to === null || data.registration_status_to === undefined)
    && !data.snapshot_after;
}

function reconstructedData(logRef, data) {
  const cancellationAt = data.at || data.event_time || admin.firestore.Timestamp.now();
  return {
    operation_id: data.operation_id,
    membre_id: data.membre_id || null,
    membre_nom: data.membre_nom || '',
    membre_prenom: data.membre_prenom || '',
    is_guest: data.is_guest === true,
    parent_inscription_id: data.parent_inscription_id || null,
    date_inscription: data.date_inscription || null,
    paye: data.paye_from === true,
    registration_status: 'canceled',
    canceled_at: cancellationAt,
    canceled_by: null,
    canceled_by_name: null,
    canceled_by_role: null,
    canceled_source: 'legacy_unattributed_delete',
    canceled_reason: 'historical_hard_delete',
    historical_reconstructed: true,
    historical_source_log_path: logRef.path,
    historical_missing_fields: [
      'actor',
      'app_version',
      'reason',
      'price',
      'payment_transaction',
      'full_snapshot',
    ],
    last_action: 'historical_restored',
    last_action_at: admin.firestore.FieldValue.serverTimestamp(),
    last_action_by: 'system:historical-recovery',
    last_action_by_name: 'CalyCompta historical recovery',
    last_action_by_role: 'system',
    last_action_source: 'maintenance_script',
    last_action_reason: 'reconstruct_legacy_hard_delete',
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function main() {
  const logs = await db.collectionGroup('inscription_logs').get();
  const candidates = [];

  for (const logDoc of logs.docs) {
    const data = logDoc.data();
    if (!isLegacyHardDelete(data)) continue;

    const parts = logDoc.ref.path.split('/');
    const clubId = parts[1];
    const operationId = data.operation_id || parts[3];
    const inscriptionId = data.inscription_id;
    if (!clubId || !operationId || !inscriptionId) continue;

    const inscriptionRef = db.doc(
      `clubs/${clubId}/operations/${operationId}/inscriptions/${inscriptionId}`,
    );
    if ((await inscriptionRef.get()).exists) continue;
    candidates.push({ logDoc, inscriptionRef, data });
  }

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    project: PROJECT_ID,
    candidates: candidates.length,
    paths: candidates.map(candidate => candidate.inscriptionRef.path),
  }, null, 2));

  if (!APPLY) return;

  let restored = 0;
  for (const candidate of candidates) {
    try {
      await candidate.inscriptionRef.create(
        reconstructedData(candidate.logDoc.ref, candidate.data),
      );
      restored += 1;
    } catch (error) {
      if (error && (error.code === 6 || error.code === 'already-exists')) continue;
      throw error;
    }
  }
  console.log(JSON.stringify({ restored }, null, 2));
}

main().then(() => process.exit(0)).catch(error => {
  console.error(error && (error.stack || error.message) || error);
  process.exit(1);
});

/**
 * Audit trail voor inschrijvingen (registratielog) — feature COM-062.
 *
 * Triggert op elke write van een inschrijving
 * (clubs/{clubId}/operations/{operationId}/inscriptions/{inscriptionId}) en logt een
 * append-only regel in clubs/{clubId}/operations/{operationId}/inscription_logs.
 *
 * Doel (jira COM-062): zichtbaar ALLEEN in CalyCompta een log bijhouden wanneer mensen
 * zich inschrijven, zich uitschrijven (cruciaal — dat is vandaag een hard delete) en
 * zich eventueel herinschrijven. Voor elke: wie (membre), wat (registered/unregistered/
 * updated), van→naar (registration_status, paye), en wanneer.
 *
 * De uitschrijving is vandaag een HARD DELETE: hier wordt de 'before'-snapshot bewaard
 * en de rij gelogd als unregistered (zelfde patroon als onInscriptionPaymentAudit).
 *
 * Schrijft enkel naar inscription_logs (andere collectie) → geen self-trigger.
 * Cloud Functions (Admin SDK) bypassen security rules: geen write-rule nodig; de log is
 * CF-only writebaar en CalyMob kan hem niet lezen (alleen CalyCompta admins).
 * Uses Firebase Functions v2 (Gen2).
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

exports.onInscriptionChangeAudit = onDocumentWritten(
  {
    document: 'clubs/{clubId}/operations/{operationId}/inscriptions/{inscriptionId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, operationId, inscriptionId } = event.params;
    const beforeSnap = event.data && event.data.before;
    const afterSnap = event.data && event.data.after;
    const before = beforeSnap && beforeSnap.exists ? beforeSnap.data() : null;
    const after = afterSnap && afterSnap.exists ? afterSnap.data() : null;

    const logRef = admin.firestore()
      .collection('clubs').doc(clubId)
      .collection('operations').doc(operationId)
      .collection('inscription_logs');

    // Verwijdering (uitschrijven / hard delete): log één "unregistered" regel en stop.
    if (!after) {
      try {
        await logRef.add({
          operation_id: operationId,
          inscription_id: inscriptionId,
          event: 'unregistered',
          is_guest: before ? before.is_guest ?? null : null,
          parent_inscription_id: before ? before.parent_inscription_id ?? null : null,
          membre_id: before ? before.membre_id ?? null : null,
          membre_nom: before ? before.membre_nom ?? '' : '',
          membre_prenom: before ? before.membre_prenom ?? '' : '',
          registration_status_from: before ? before.registration_status ?? null : null,
          registration_status_to: null,
          paye_from: before ? before.paye ?? null : null,
          paye_to: null,
          date_inscription: before ? before.date_inscription ?? null : null,
          at: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`🗑️ [inscriptionLog] ${before ? `${before.membre_prenom || ''} ${before.membre_nom || ''}`.trim() : inscriptionId} unregistered (${operationId})`);
      } catch (e) {
        console.warn('[inscriptionLog] unregister-log faalde', e);
      }
      return null;
    }

    // Nieuw document → "registered".
    if (!before && after) {
      try {
        await logRef.add({
          operation_id: operationId,
          inscription_id: inscriptionId,
          event: 'registered',
          is_guest: after.is_guest ?? null,
          parent_inscription_id: after.parent_inscription_id ?? null,
          membre_id: after.membre_id ?? null,
          membre_nom: after.membre_nom ?? '',
          membre_prenom: after.membre_prenom ?? '',
          registration_status_from: null,
          registration_status_to: after.registration_status ?? null,
          paye_from: null,
          paye_to: after.paye ?? null,
          date_inscription: after.date_inscription ?? null,
          at: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`📝 [inscriptionLog] ${after.membre_prenom || ''} ${after.membre_nom || ''} registered (${operationId})`);
      } catch (e) {
        console.warn('[inscriptionLog] register-log faalde', e);
      }
      return null;
    }

    // Update → log alleen wanneer er relevante wijziging is (status / paye / membership / guests).
    const relevant =
      (before.registration_status ?? null) !== (after.registration_status ?? null) ||
      (before.paye ?? null) !== (after.paye ?? null) ||
      (before.membre_id ?? null) !== (after.membre_id ?? null) ||
      (before.is_guest ?? null) !== (after.is_guest ?? null) ||
      (before.parent_inscription_id ?? null) !== (after.parent_inscription_id ?? null);

    if (!relevant) return null;

    try {
      await logRef.add({
        operation_id: operationId,
        inscription_id: inscriptionId,
        event: 'updated',
        is_guest: after.is_guest ?? null,
        parent_inscription_id: after.parent_inscription_id ?? null,
        membre_id: after.membre_id ?? before.membre_id ?? null,
        membre_nom: after.membre_nom ?? before.membre_nom ?? '',
        membre_prenom: after.membre_prenom ?? before.membre_prenom ?? '',
        registration_status_from: before.registration_status ?? null,
        registration_status_to: after.registration_status ?? null,
        paye_from: before.paye ?? null,
        paye_to: after.paye ?? null,
        date_inscription: after.date_inscription ?? before.date_inscription ?? null,
        at: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`✏️ [inscriptionLog] ${after.membre_prenom || ''} ${after.membre_nom || ''} updated (${operationId})`);
    } catch (e) {
      console.warn('[inscriptionLog] update-log faalde', e);
    }
    return null;
  }
);
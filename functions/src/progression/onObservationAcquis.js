/**
 * Cloud Function: Auto-validate LIFRAS exercise when observation result = 'acquis'
 *
 * Triggers on: clubs/{clubId}/member_observations/{observationId}
 *
 * When an encadrant marks a LIFRAS exercise observation as 'acquis',
 * this function automatically creates an entry in the member's
 * exercices_valides subcollection — bridging the Carnet de Formation
 * with the existing LIFRAS progression system.
 *
 * Only fires for:
 *   - category === 'exercice_lifras'
 *   - result === 'acquis'
 *   - exerciceCode is non-empty
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');

const db = admin.firestore();

exports.onObservationAcquis = onDocumentCreated(
  {
    document: 'clubs/{clubId}/member_observations/{observationId}',
    region: 'europe-west1',
  },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      logger.warn('No data in observation document');
      return null;
    }

    const data = snap.data();
    const { clubId } = event.params;

    // Only process LIFRAS exercises marked as acquis
    if (data.category !== 'exercice_lifras') return null;
    if (data.result !== 'acquis') return null;
    if (!data.exerciceCode || !data.memberId) return null;

    const memberId = data.memberId;
    const exerciceCode = data.exerciceCode;

    logger.info(
      `[onObservationAcquis] Processing: member=${memberId}, ` +
      `exercice=${exerciceCode}, observer=${data.observerName}`
    );

    // Check if this exercise is already validated for this member
    const validesRef = db
      .collection('clubs').doc(clubId)
      .collection('members').doc(memberId)
      .collection('exercices_valides');

    const existing = await validesRef
      .where('exercice_code', '==', exerciceCode)
      .limit(1)
      .get();

    if (!existing.empty) {
      logger.info(
        `[onObservationAcquis] Exercise ${exerciceCode} already ` +
        `validated for member ${memberId} — skipping`
      );
      return null;
    }

    // Create the exercice_valide entry
    try {
      await validesRef.add({
        exercice_code: exerciceCode,
        exercice_description: data.exerciceDescription || '',
        exercice_id: '',  // Will be linked later if needed
        exercice_niveau: data.memberNiveau || '',
        exercice_specialite: '',
        date_validation: data.contextDate || FieldValue.serverTimestamp(),
        moniteur_nom: data.observerName || '',
        moniteur_id: data.observerId || '',
        notes: `Auto-validé via Carnet de Formation (session: ${data.contextTitle || ''})`,
        lieu: data.contextType === 'piscine' ? 'Piscine' : 'Plongée',
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
        created_by: data.observerId || '',
        source: 'carnet_formation',
        observation_id: event.params.observationId,
      });

      logger.info(
        `[onObservationAcquis] Created exercice_valide for ` +
        `member=${memberId}, exercice=${exerciceCode}`
      );
    } catch (error) {
      logger.error(
        `[onObservationAcquis] Error creating exercice_valide:`, error
      );
      throw error; // Rethrow so Cloud Functions retries
    }

    return null;
  }
);

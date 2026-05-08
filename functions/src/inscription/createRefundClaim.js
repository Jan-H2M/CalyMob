/**
 * Cloud Function: createInscriptionRefund (Callable)
 *
 * Creates a refund demande (demandes_remboursement) when a member reduces their
 * event inscription amount (e.g. by removing guests or downgrading supplements).
 *
 * Called from CalyMob after the inscription edit dialog commits a change with
 * delta < 0.
 *
 * §6.2 — Inscription edit & refund plan
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const REGION = 'europe-west1';

function validateAuth(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'Authentification requise');
  }
  return request.auth.uid;
}

function validateInput(data) {
  const errors = [];

  if (typeof data.clubId !== 'string' || !data.clubId.trim()) {
    errors.push('clubId requis');
  }
  if (typeof data.inscriptionId !== 'string' || !data.inscriptionId.trim()) {
    errors.push('inscriptionId requis');
  }
  if (typeof data.operationId !== 'string' || !data.operationId.trim()) {
    errors.push('operationId requis');
  }
  if (typeof data.newAmount !== 'number' || !Number.isFinite(data.newAmount)) {
    errors.push('newAmount requis (nombre)');
  }
  if (typeof data.oldAmount !== 'number' || !Number.isFinite(data.oldAmount)) {
    errors.push('oldAmount requis (nombre)');
  }
  if (typeof data.editSessionId !== 'string' || !data.editSessionId.trim()) {
    errors.push('editSessionId requis');
  }
  if (typeof data.description !== 'string' || !data.description.trim()) {
    errors.push('description requise');
  }
  if (typeof data.eventTitre !== 'string' || !data.eventTitre.trim()) {
    errors.push('eventTitre requis');
  }

  if (errors.length > 0) {
    throw new HttpsError('invalid-argument', errors.join('; '));
  }

  const clubId = data.clubId.trim();
  const inscriptionId = data.inscriptionId.trim();
  const operationId = data.operationId.trim();
  const newAmount = Number(data.newAmount);
  const oldAmount = Number(data.oldAmount);
  const editSessionId = data.editSessionId.trim();
  const description = data.description.trim();
  const eventTitre = data.eventTitre.trim();

  return { clubId, inscriptionId, operationId, newAmount, oldAmount, editSessionId, description, eventTitre };
}

/**
 * Resolve the deadline before which a refund can be requested.
 * Uses operation.registration_deadline if set, otherwise falls back to
 * operation.date_debut minus 24 hours.
 */
async function resolveRefundDeadline(operationDoc) {
  const operationData = operationDoc.data();
  if (!operationData) return null;

  const regDeadline = operationData.registration_deadline;
  if (regDeadline) {
    return regDeadline.toDate ? regDeadline.toDate() : new Date(regDeadline);
  }

  const dateDebut = operationData.date_debut;
  if (dateDebut) {
    const d = dateDebut.toDate ? dateDebut.toDate() : new Date(dateDebut);
    return new Date(d.getTime() - 24 * 60 * 60 * 1000);
  }

  return null;
}

exports.createInscriptionRefund = onCall(
  {
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
  },
  async (request) => {
    const userId = validateAuth(request);
    const input = validateInput(request.data);

    const { clubId, inscriptionId, operationId, newAmount, oldAmount, editSessionId, description, eventTitre } = input;

    const db = admin.firestore();
    const clubRef = db.collection('clubs').doc(clubId);

    // === 1. Owner check: fetch inscription, verify it belongs to this user ===
    const inscriptionRef = clubRef
      .collection('operations')
      .doc(operationId)
      .collection('inscriptions')
      .doc(inscriptionId);

    const inscriptionSnap = await inscriptionRef.get();
    if (!inscriptionSnap.exists) {
      throw new HttpsError('not-found', 'Inscription introuvable');
    }

    const inscription = inscriptionSnap.data();
    if (!inscription) {
      throw new HttpsError('internal', 'Erreur de lecture de l\'inscription');
    }

    if (inscription.membre_id !== userId) {
      throw new HttpsError('permission-denied', 'Vous n\'êtes pas autorisé à modifier cette inscription');
    }

    // === 2. Verify amount actually decreased ===
    if (newAmount >= oldAmount) {
      throw new HttpsError('failed-precondition', 'Le montant n\'a pas diminué — aucun remboursement nécessaire');
    }

    const delta = oldAmount - newAmount;
    if (delta <= 0) {
      throw new HttpsError('internal', 'Erreur de calcul du delta (delta <= 0 après vérification)');
    }

    // === 3. Verify deadline not passed ===
    const operationDoc = await clubRef.collection('operations').doc(operationId).get();
    if (!operationDoc.exists) {
      throw new HttpsError('not-found', 'Opération (événement) introuvable');
    }

    const deadline = await resolveRefundDeadline(operationDoc);
    if (deadline) {
      const now = new Date();
      if (now > deadline) {
        throw new HttpsError('failed-precondition', 'Le délai de modification est dépassé. Contactez un administrateur.');
      }
    }

    // === 4. Idempotency check ===
    const idempotencyKey = `${inscriptionId}_${editSessionId}`;
    const idempotencyRef = clubRef.collection('demandes_remboursement')
      .where('idempotency_key', '==', idempotencyKey)
      .limit(1);

    const existingSnap = await idempotencyRef.get();
    if (!existingSnap.empty) {
      const existing = existingSnap.docs[0];
      throw new HttpsError('already-exists', 'Une demande de remboursement existe déjà pour cette modification', {
        demandeId: existing.id,
        idempotency_key: idempotencyKey,
      });
    }

    // === 5. Fetch member info for denormalization ===
    const memberDoc = await clubRef.collection('members').doc(userId).get();
    let demandeurNom = '';
    let demandeurPrenom = '';
    if (memberDoc.exists) {
      const member = memberDoc.data();
      demandeurNom = member.nom || '';
      demandeurPrenom = member.prenom || '';
    }

    // === 6. Batch write: create demande + update inscription ===
    // Using batch ensures atomicity — both writes succeed or neither does.
    const demandeRef = clubRef.collection('demandes_remboursement').doc();
    const now = admin.firestore.Timestamp.now();

    const demandeData = {
      // Identity
      operation_id: operationId,
      operation_titre: eventTitre,

      // Demandeur
      demandeur_id: userId,
      demandeur_nom: demandeurNom,
      demandeur_prenom: demandeurPrenom,

      // Demande details
      titre: `Modification inscription — ${eventTitre}`,
      montant: delta,
      description: description,

      // Account & status
      categorie: 'remboursement_inscription',
      code_comptable: '7090',
      statut: 'soumis',

      // Metadata
      created_by: userId,
      inscription_id: inscriptionId,
      edit_session_id: editSessionId,
      idempotency_key: idempotencyKey,

      // Timestamps
      created_at: now,
      updated_at: now,
      date_demande: now,
    };

    // Update inscription with link to this refund demande
    const inscriptionUpdate = {
      refund_demande_id: demandeRef.id,
      refund_montant: delta,
      refund_status: 'soumis',
      refund_created_at: now,
    };

    const batch = db.batch();
    batch.set(demandeRef, demandeData);
    batch.update(inscriptionRef, inscriptionUpdate);
    await batch.commit();

    return {
      demandeId: demandeRef.id,
      montant: delta,
      statut: 'soumis',
    };
  },
);

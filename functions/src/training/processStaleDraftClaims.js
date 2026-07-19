/**
 * Cloud Function — Carnet de Formation WP-14 (S3), « filet 7 jours »
 *
 * Cron hebdomadaire. Depuis WP-14, la fiche carnet embarque les claims draft
 * (claims_embedded) et la tâche exercise_claim séparée n'est plus créée.
 * Compat : une ancienne app sans la section embarquée laisse les claims en
 * draft pour toujours. Ce filet crée la tâche exercise_claim classique pour
 * tout claim resté draft plus de 7 jours, une seule fois par claim.
 *
 * Idempotence : aucune tâche n'est créée si une formation_task référence déjà
 * le claim (quel que soit son statut — un élève qui a écarté la tâche n'est
 * pas relancé).
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { memberDisplayName } = require('../utils/memberName');

const FUNCTION_NAME = 'processStaleDraftClaims';
const CLUB_ID = 'calypso';
const STALE_DAYS = 7;
const BATCH_LIMIT = 100;

exports.processStaleDraftClaims = onSchedule(
  {
    region: 'europe-west1',
    schedule: 'every monday 07:00',
    timeZone: 'Europe/Brussels',
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async () => {
    const db = admin.firestore();
    const clubRef = db.collection('clubs').doc(CLUB_ID);
    const cutoff = admin.firestore.Timestamp.fromMillis(
      Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000,
    );

    const staleSnap = await clubRef
      .collection('exercise_claims')
      .where('status', '==', 'draft')
      .where('created_at', '<=', cutoff)
      .limit(BATCH_LIMIT)
      .get();

    if (staleSnap.empty) {
      console.log(`[${FUNCTION_NAME}] aucun claim draft > ${STALE_DAYS} j`);
      return;
    }

    const memberCache = new Map();
    let created = 0;
    let skipped = 0;

    for (const claimDoc of staleSnap.docs) {
      const claim = claimDoc.data();
      const claimId = claimDoc.id;
      const memberId = claim.member_id;
      if (!memberId) {
        skipped += 1;
        continue;
      }

      // Idempotence : jamais deux tâches pour le même claim.
      const existingTasks = await clubRef
        .collection('formation_tasks')
        .where('context.exercise_claim_id', '==', claimId)
        .limit(1)
        .get();
      if (!existingTasks.empty) {
        skipped += 1;
        continue;
      }

      let memberName = memberCache.get(memberId);
      if (!memberName) {
        const memberSnap = await clubRef.collection('members').doc(memberId).get();
        memberName = memberSnap.exists
          ? memberDisplayName(memberSnap.data(), 'Membre')
          : 'Membre';
        memberCache.set(memberId, memberName);
      }

      const exerciseCode = claim.exercise_code || claim.exercise_id || '?';
      const taskRef = clubRef.collection('formation_tasks').doc();
      await taskRef.set({
        type: 'exercise_claim',
        status: 'open',
        priority: 'normal',
        title: `Exercice ${exerciseCode} à confirmer`,
        member_id: memberId,
        member_name: memberName,
        current_assignee_id: memberId,
        current_assignee_type: 'student',
        context: {
          exercise_claim_id: claimId,
          exercise_code: exerciseCode,
          operation_id: claim.operation_id || null,
          palanquee_id: claim.palanquee_id || null,
          stale_draft_reminder: true,
        },
        available_actions: [
          { key: 'open', label: 'Confirmer', target_screen: 'exercise_claim' },
          { key: 'dismiss', label: 'Pas concerné' },
        ],
        notification_state: { reminder_count: 0 },
        created_by: 'system',
        created_by_name: FUNCTION_NAME,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      created += 1;
    }

    console.log(
      `[${FUNCTION_NAME}] ${created} tâche(s) créée(s), ${skipped} claim(s) ignoré(s) (sur ${staleSnap.size})`
    );
  },
);

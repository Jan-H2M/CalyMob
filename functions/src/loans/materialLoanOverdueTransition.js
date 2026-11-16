/**
 * Cloud Function — M1: Automatic overdue transition.
 *
 * Scheduled: every day at 06:00 Europe/Brussels.
 *
 * Finds active loans (`statut == 'actif'`) whose `date_retour_prevue` has
 * passed and transitions them to `en_retard`. The comparison uses Brussels
 * local midnight so a member always has the full return day.
 *
 * Idempotent: only transitions loans whose status is still `actif`.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

const FUNCTION_NAME = 'materialLoanOverdueTransition';
const FUNCTION_REGION = 'europe-west1';

/**
 * Returns midnight of today in Brussels local time, expressed as a Date.
 * A loan is overdue when its return date is strictly before this instant.
 */
function todayMidnightBrussels() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const localDate = formatter.format(new Date());
  return new Date(`${localDate}T00:00:00+00:00`);
}

async function transitionOverdueLoans(db, clubId) {
  const loansRef = db
    .collection('clubs')
    .doc(clubId)
    .collection('inventory_loans');

  const snapshot = await loansRef.where('statut', '==', 'actif').get();
  const cutoff = todayMidnightBrussels();
  let transitioned = 0;

  for (const loanDoc of snapshot.docs) {
    const data = loanDoc.data();
    const returnDate = data.date_retour_prevue?.toDate?.();
    if (!returnDate || returnDate >= cutoff) continue;

    try {
      const didTransition = await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(loanDoc.ref);
        if (!fresh.exists || fresh.data().statut !== 'actif') return false;
        const freshReturn = fresh.data().date_retour_prevue?.toDate?.();
        if (!freshReturn || freshReturn >= cutoff) return false;

        transaction.update(loanDoc.ref, {
          statut: 'en_retard',
          overdue_since: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        const auditRef = db
          .collection('clubs')
          .doc(clubId)
          .collection('audit_logs')
          .doc();
        transaction.set(auditRef, {
          event_type: 'material_loan_overdue',
          entity_type: 'inventory_loan',
          entity_id: loanDoc.id,
          loan_number: data.loanNumber || null,
          member_id: data.memberId || null,
          actor_id: 'system',
          actor_name: 'Transition automatique',
          createdAt: FieldValue.serverTimestamp(),
        });
        return true;
      });

      if (didTransition) {
        console.log(
          `[${FUNCTION_NAME}] ${clubId}/${loanDoc.id} → en_retard`
        );
        transitioned++;
      }
    } catch (err) {
      console.error(
        `[${FUNCTION_NAME}] failed ${clubId}/${loanDoc.id}:`,
        err.message
      );
    }
  }

  return { scanned: snapshot.size, transitioned };
}

const materialLoanOverdueTransition = onSchedule(
  {
    region: FUNCTION_REGION,
    schedule: '0 6 * * *',
    timeZone: 'Europe/Brussels',
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async () => {
    const db = admin.firestore();
    let totalScanned = 0;
    let totalTransitioned = 0;

    const clubsSnap = await db.collection('clubs').get();
    for (const clubDoc of clubsSnap.docs) {
      const result = await transitionOverdueLoans(db, clubDoc.id);
      totalScanned += result.scanned;
      totalTransitioned += result.transitioned;
    }

    console.log(
      `[${FUNCTION_NAME}] cycle complete: scanned=${totalScanned}, ` +
        `transitioned=${totalTransitioned}`
    );
  }
);

module.exports = {
  materialLoanOverdueTransition,
  transitionOverdueLoans,
  todayMidnightBrussels,
};

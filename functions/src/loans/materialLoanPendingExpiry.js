/**
 * Cloud Function — M3: Pending QR reservation expiry.
 *
 * Scheduled: every 6 hours (00:00, 06:00, 12:00, 18:00 Europe/Brussels).
 *
 * Cancels pending loans (`statut == 'attente_caution'`) whose `createdAt`
 * exceeds a configurable timeout. Reserved inventory items are released.
 *
 * Timeout configuration:
 *   clubs/{clubId}/settings/material_loans → `attente_caution_timeout_hours`
 *   Default: 48 hours.
 *
 * Idempotent: only touches loans whose status is still `attente_caution`.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

const FUNCTION_NAME = 'materialLoanPendingExpiry';
const FUNCTION_REGION = 'europe-west1';
const DEFAULT_TIMEOUT_HOURS = 48;

async function getTimeoutMs(db, clubId) {
  const doc = await db
    .collection('clubs')
    .doc(clubId)
    .collection('settings')
    .doc('material_loans')
    .get();
  const hours =
    doc.data()?.attente_caution_timeout_hours ?? DEFAULT_TIMEOUT_HOURS;
  return Math.max(1, hours) * 60 * 60 * 1000;
}

async function expirePendingLoans(db, clubId) {
  const timeoutMs = await getTimeoutMs(db, clubId);
  const cutoff = new Date(Date.now() - timeoutMs);

  const loansRef = db
    .collection('clubs')
    .doc(clubId)
    .collection('inventory_loans');

  const snapshot = await loansRef
    .where('statut', '==', 'attente_caution')
    .get();

  let expired = 0;

  for (const loanDoc of snapshot.docs) {
    const data = loanDoc.data();
    const createdAt = data.createdAt?.toDate?.();
    if (!createdAt || createdAt >= cutoff) continue;

    try {
      const didExpire = await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(loanDoc.ref);
        if (!fresh.exists || fresh.data().statut !== 'attente_caution') {
          return false;
        }
        const freshCreated = fresh.data().createdAt?.toDate?.();
        if (!freshCreated || freshCreated >= cutoff) return false;

        // Release every reserved item that still points at this loan.
        const itemIds = (fresh.data().itemIds || [])
          .map((id) => String(id))
          .filter(Boolean);

        const itemRefs = itemIds.map((id) =>
          db
            .collection('clubs')
            .doc(clubId)
            .collection('inventory_items')
            .doc(id)
        );
        const itemDocs = await Promise.all(
          itemRefs.map((ref) => transaction.get(ref))
        );

        for (let i = 0; i < itemRefs.length; i++) {
          if (
            itemDocs[i].exists &&
            itemDocs[i].data().current_loan_id === loanDoc.id
          ) {
            transaction.update(itemRefs[i], {
              statut: 'disponible',
              current_loan_id: FieldValue.delete(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }

        transaction.update(loanDoc.ref, {
          statut: 'annule',
          cancelled_by: 'system',
          cancelled_by_name: 'Expiration automatique',
          cancelled_at: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        const auditRef = db
          .collection('clubs')
          .doc(clubId)
          .collection('audit_logs')
          .doc();
        transaction.set(auditRef, {
          event_type: 'material_loan_expired',
          entity_type: 'inventory_loan',
          entity_id: loanDoc.id,
          loan_number: data.loanNumber || null,
          member_id: data.memberId || null,
          item_ids: itemIds,
          timeout_hours: timeoutMs / (60 * 60 * 1000),
          actor_id: 'system',
          actor_name: 'Expiration automatique',
          createdAt: FieldValue.serverTimestamp(),
        });
        return true;
      });

      if (didExpire) {
        console.log(
          `[${FUNCTION_NAME}] ${clubId}/${loanDoc.id} expired (timeout ${timeoutMs / 3600000}h)`
        );
        expired++;
      }
    } catch (err) {
      console.error(
        `[${FUNCTION_NAME}] failed ${clubId}/${loanDoc.id}:`,
        err.message
      );
    }
  }

  return { scanned: snapshot.size, expired };
}

const materialLoanPendingExpiry = onSchedule(
  {
    region: FUNCTION_REGION,
    schedule: '0 */6 * * *',
    timeZone: 'Europe/Brussels',
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async () => {
    const db = admin.firestore();
    let totalScanned = 0;
    let totalExpired = 0;

    const clubsSnap = await db.collection('clubs').get();
    for (const clubDoc of clubsSnap.docs) {
      const result = await expirePendingLoans(db, clubDoc.id);
      totalScanned += result.scanned;
      totalExpired += result.expired;
    }

    console.log(
      `[${FUNCTION_NAME}] cycle complete: scanned=${totalScanned}, ` +
        `expired=${totalExpired}`
    );
  }
);

module.exports = {
  materialLoanPendingExpiry,
  expirePendingLoans,
  getTimeoutMs,
  DEFAULT_TIMEOUT_HOURS,
};

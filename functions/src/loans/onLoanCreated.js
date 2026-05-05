const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const {
  REGION,
  buildTodoOgm,
  isMigrationBackfill,
} = require('../boutique/shared');

function resolveCautionAmount(loan) {
  const candidates = [loan.montant_caution, loan.caution_montant];
  for (const candidate of candidates) {
    const amount = typeof candidate === 'number' ? candidate : Number(candidate);
    if (Number.isFinite(amount) && amount > 0) {
      return amount;
    }
  }
  return 0;
}

exports.onLoanCreated = onDocumentCreated(
  {
    document: 'clubs/{clubId}/inventory_loans/{loanId}',
    region: REGION,
  },
  async (event) => {
    const loan = event.data.data();
    const { clubId, loanId } = event.params;

    if (isMigrationBackfill(loan)) {
      console.log(`[onLoanCreated] Skip migrated loan ${clubId}/${loanId}`);
      return null;
    }

    if (loan.caution_payee === true || loan.caution_payment_status === 'paid') {
      console.log(`[onLoanCreated] Skip already-paid caution ${clubId}/${loanId}`);
      return null;
    }

    const cautionAmount = resolveCautionAmount(loan);
    if (cautionAmount <= 0) {
      console.log(`[onLoanCreated] No caution amount on ${clubId}/${loanId}`);
      return null;
    }

    const db = admin.firestore();
    const loanRef = db.collection('clubs').doc(clubId).collection('inventory_loans').doc(loanId);
    const ogmStub = buildTodoOgm('LOAN_DEPOSIT', loanId);

    await loanRef.set({
      caution_ogm: ogmStub.ogm,
      caution_ogm_display: ogmStub.ogm_display,
      caution_payment_status: loan.caution_payment_status || 'awaiting_payment',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // TODO Phase 3: adapt sendPaymentQrEmail pattern for loan caution emails.
    // TODO Phase 3: send push notification to the borrowing member.
    console.log('[onLoanCreated] Generated caution placeholder OGM', {
      clubId,
      loanId,
      cautionAmount,
      ogm: ogmStub.ogm,
    });
    return null;
  },
);

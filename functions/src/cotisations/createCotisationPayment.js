const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {
  REGION,
  buildTodoOgm,
  resolveMemberEmail,
} = require('../boutique/shared');

async function findMemberForAuth(clubRef, authUid) {
  const directSnap = await clubRef.collection('members').doc(authUid).get();
  if (directSnap.exists) {
    return { id: directSnap.id, data: directSnap.data() };
  }

  const querySnap = await clubRef.collection('members')
    .where('userId', '==', authUid)
    .limit(1)
    .get();

  if (querySnap.empty) {
    return null;
  }

  return {
    id: querySnap.docs[0].id,
    data: querySnap.docs[0].data(),
  };
}

function computeMembershipPeriod(now) {
  const year = now.getUTCFullYear();
  const septemberFirstUtc = Date.UTC(year, 8, 1, 0, 0, 0, 0);
  return now.getTime() < septemberFirstUtc ? 'jan_dec' : 'sept_dec';
}

exports.createCotisationPayment = onCall(
  {
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError('unauthenticated', 'Authentification requise');
    }

    const clubId = typeof request.data?.clubId === 'string' ? request.data.clubId.trim() : '';
    if (!clubId) {
      throw new HttpsError('invalid-argument', 'clubId requis');
    }

    const db = admin.firestore();
    const clubRef = db.collection('clubs').doc(clubId);
    const memberRecord = await findMemberForAuth(clubRef, request.auth.uid);
    if (!memberRecord) {
      throw new HttpsError('permission-denied', 'Membre introuvable pour cet utilisateur');
    }

    const paymentRef = clubRef.collection('cotisation_payments').doc();
    const now = new Date();
    const period = computeMembershipPeriod(now);
    const ogmStub = buildTodoOgm('COTISATION', paymentRef.id);
    const member = memberRecord.data;
    const email = resolveMemberEmail(member);

    // TODO Phase 3: derive canonical category from member.clubStatuten + active season.
    const category = member.clubStatuten || null;
    // TODO Phase 3: lookup season + tariff in membership_seasons and compute amount.
    const amount = 0;
    // TODO Phase 3: compute validity_until from season rules and chosen period.
    const validityUntil = null;

    await paymentRef.set({
      memberId: memberRecord.id,
      userId: request.auth.uid,
      category,
      period,
      seasonId: null,
      tariffCode: null,
      amount,
      amount_cents: Math.round(amount * 100),
      status: 'awaiting_payment',
      ogm: ogmStub.ogm,
      ogm_display: ogmStub.ogm_display,
      validity_until: validityUntil,
      buyer: {
        displayName: `${member.prenom || ''} ${member.nom || ''}`.trim(),
        email,
      },
      migration_source: null,
      _backfill: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // TODO Phase 3: adapt sendPaymentQrEmail pattern for cotisation QR emails.
    return {
      success: true,
      cotisationPaymentId: paymentRef.id,
      ogm: ogmStub.ogm,
      amount,
      period,
    };
  },
);

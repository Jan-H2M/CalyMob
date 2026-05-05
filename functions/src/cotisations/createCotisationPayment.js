const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {
  REGION,
  resolveMemberEmail,
} = require('../boutique/shared');
const { formatOgmDisplay } = require('../shared/ogm');
const { createPaymentReference, generateNextOgm } = require('../shared/ogmService');

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

function resolveTariffAmount(tariff, period) {
  if (!tariff || typeof tariff !== 'object') {
    return null;
  }

  if (period === 'jan_dec' && Number.isFinite(Number(tariff.price_jan_dec))) {
    return Number(tariff.price_jan_dec);
  }
  if (period === 'sept_dec' && Number.isFinite(Number(tariff.price_sept_dec))) {
    return Number(tariff.price_sept_dec);
  }
  if (Number.isFinite(Number(tariff.price))) {
    return Number(tariff.price);
  }
  return null;
}

function computeValidityUntil(now, period) {
  const year = now.getUTCFullYear();
  if (period === 'jan_dec') {
    return admin.firestore.Timestamp.fromDate(new Date(Date.UTC(year + 1, 0, 31, 23, 59, 59, 999)));
  }
  return admin.firestore.Timestamp.fromDate(new Date(Date.UTC(year + 1, 11, 31, 23, 59, 59, 999)));
}

async function findActiveSeason(clubRef) {
  const activeSnap = await clubRef.collection('membership_seasons')
    .where('is_active', '==', true)
    .limit(1)
    .get();

  if (!activeSnap.empty) {
    return activeSnap.docs[0];
  }

  const latestSnap = await clubRef.collection('membership_seasons')
    .orderBy('created_at', 'desc')
    .limit(1)
    .get();

  return latestSnap.empty ? null : latestSnap.docs[0];
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
    const member = memberRecord.data;
    const email = resolveMemberEmail(member);
    const category = member.clubStatuten || null;
    const tariffCode = typeof member.cotisation_tariff_code === 'string' && member.cotisation_tariff_code.trim()
      ? member.cotisation_tariff_code.trim()
      : 'membre_1ere';
    const seasonDoc = await findActiveSeason(clubRef);

    if (!seasonDoc) {
      throw new HttpsError('failed-precondition', 'Aucune saison de cotisation active');
    }

    const season = seasonDoc.data();
    let tariff = Array.isArray(season.tariffs)
      ? season.tariffs.find((entry) => entry && entry.code === tariffCode)
      : null;

    if (!tariff) {
      const tariffSnap = await seasonDoc.ref.collection('tariffs')
        .where('code', '==', tariffCode)
        .limit(1)
        .get();
      tariff = tariffSnap.empty ? null : tariffSnap.docs[0].data();
    }

    if (!tariff) {
      throw new HttpsError('failed-precondition', `Tarif introuvable pour code ${tariffCode}`);
    }

    const amount = resolveTariffAmount(tariff, period);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpsError('failed-precondition', `Montant introuvable pour la période ${period}`);
    }

    const validityUntil = computeValidityUntil(now, period);
    const ogm = await generateNextOgm(db, clubId);
    const ogmDisplay = formatOgmDisplay(ogm);

    await paymentRef.set({
      memberId: memberRecord.id,
      userId: request.auth.uid,
      category,
      period,
      seasonId: seasonDoc.id,
      tariffCode,
      amount,
      amount_cents: Math.round(amount * 100),
      status: 'awaiting_payment',
      ogm,
      ogm_display: ogmDisplay,
      validity_until: validityUntil,
      buyer: {
        displayName: `${member.prenom || ''} ${member.nom || ''}`.trim(),
        email,
      },
      migration_source: null,
      _backfill: false,
      created_at: admin.firestore.Timestamp.now(),
      updated_at: admin.firestore.Timestamp.now(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await createPaymentReference(db, clubId, {
      ogm,
      payload_text: `Cotisation ${season.label || seasonDoc.id} ${member.prenom || ''} ${member.nom || ''}`.trim(),
      context_type: 'COTISATION',
      context_id: paymentRef.id,
      amount_cents: Math.round(amount * 100),
      created_by: request.auth.uid,
    });

    // TODO Phase 3: adapt sendPaymentQrEmail pattern for cotisation QR emails.
    return {
      success: true,
      cotisationPaymentId: paymentRef.id,
      ogm,
      ogm_display: ogmDisplay,
      amount,
      period,
    };
  },
);

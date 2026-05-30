const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const QRCode = require('qrcode');
const {
  REGION,
  buildDomainError,
  buildEpcQrPayload,
  buildInvalidInputError,
  getClubRef,
  mapErrorToHttps,
} = require('../boutique/shared');

function cleanToken(value, length = 3) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
  return normalized.substring(0, length).padEnd(length, 'X');
}

function resolveMemberName(member) {
  const first = String(member.prenom || member.firstName || '').trim();
  const last = String(member.nom || member.lastName || '').trim();
  const display = String(member.displayName || member.display_name || '').trim();
  return {
    first,
    last,
    displayName: display || `${first} ${last}`.trim() || 'Membre',
  };
}

function resolveLifrasId(member, uid) {
  const candidate = member.lifras_id || member.licence_lifras || member.lifrasId || '';
  const digits = String(candidate).replace(/\D/g, '');
  if (digits) return digits;
  return `MID${String(uid || '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toUpperCase()}`;
}

function buildCommunication({ year, firstName, lastName, lifrasId }) {
  return `+++COT-${year}-${cleanToken(firstName)}-${cleanToken(lastName)}-ID${lifrasId}+++`;
}

function resolvePrice(tariff, period) {
  return period === 'sept_dec' ? tariff.price_sept_dec : tariff.price_jan_dec;
}

function resolveMembershipPeriod(member) {
  if (member.membership_period === 'sept_dec' || member.membership_period === 'jan_dec') {
    return member.membership_period;
  }
  if (member.cotisation_validite || member.cotisationValidite) {
    return 'jan_dec';
  }
  return new Date().getUTCMonth() >= 8 ? 'sept_dec' : 'jan_dec';
}

function resolveValidityUntil(startYear, period) {
  const year = period === 'sept_dec' ? startYear + 2 : startYear + 1;
  return admin.firestore.Timestamp.fromDate(new Date(Date.UTC(year, 0, 31, 12, 0, 0)));
}

async function resolveClubBankSettings(clubRef) {
  const [bankSnap, generalSnap, clubInfoSnap] = await Promise.all([
    clubRef.collection('settings').doc('bank').get(),
    clubRef.collection('settings').doc('general').get(),
    clubRef.collection('settings').doc('club_info').get(),
  ]);

  const bank = bankSnap.exists ? bankSnap.data() : {};
  const general = generalSnap.exists ? generalSnap.data() : {};
  const clubInfo = clubInfoSnap.exists ? clubInfoSnap.data() : {};

  const iban = String(
    clubInfo.iban ||
      bank.iban ||
      process.env.CLUB_IBAN ||
      '',
  ).replace(/\s/g, '').toUpperCase();
  const beneficiary = String(
    clubInfo.beneficiaryName ||
      clubInfo.beneficiary ||
      bank.beneficiaryName ||
      general.clubName ||
      'Calypso',
  ).trim();

  if (!iban || !beneficiary) {
    throw buildInvalidInputError('INVALID_INPUT', {
      missing: !iban ? 'settings.bank.iban|settings.club_info.iban|env.CLUB_IBAN' : 'beneficiaryName',
    });
  }

  return { iban, beneficiary };
}

async function resolveAccountingCode(clubRef, tariffCode) {
  const snap = await clubRef.collection('settings').doc('cotisation_accounting').get();
  const data = snap.exists ? snap.data() : {};
  const byTariff = data.byTariffCode && typeof data.byTariffCode === 'object' ? data.byTariffCode : {};
  if (typeof byTariff[tariffCode] === 'string' && byTariff[tariffCode].trim()) {
    return byTariff[tariffCode].trim();
  }
  if (typeof data.defaultCode === 'string' && data.defaultCode.trim()) {
    return data.defaultCode.trim();
  }
  if (String(tariffCode || '').includes('instruct')) return '730-00-713';
  if (String(tariffCode || '').includes('nageur')) return '730-00-715';
  if (String(tariffCode || '').includes('2')) return '730-00-716';
  return '730-00-712';
}

exports.createCotisationPayment = onCall(
  {
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 30,
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError('unauthenticated', 'Authentification requise');
    }

    const db = admin.firestore();
    const clubId = typeof request.data?.clubId === 'string' ? request.data.clubId.trim() : '';
    if (!clubId) {
      throw new HttpsError('invalid-argument', 'clubId manquant', { code: 'INVALID_INPUT' });
    }

    const uid = request.auth.uid;
    const clubRef = getClubRef(db, clubId);
    const memberRef = clubRef.collection('members').doc(uid);

    try {
      const [memberSnap, activeSeasonSnap, bankSettings] = await Promise.all([
        memberRef.get(),
        clubRef.collection('membership_seasons').where('is_active', '==', true).limit(1).get(),
        resolveClubBankSettings(clubRef),
      ]);

      if (!memberSnap.exists) {
        throw buildDomainError('MEMBER_NOT_FOUND', 'Membre introuvable');
      }
      if (activeSeasonSnap.empty) {
        throw buildDomainError('SEASON_NOT_FOUND', 'Aucune saison de cotisation active');
      }

      const member = memberSnap.data();
      const seasonDoc = activeSeasonSnap.docs[0];
      const season = seasonDoc.data();
      const paymentStatus = season.payment_status || 'closed';

      if (paymentStatus !== 'open') {
        throw buildDomainError(
          'COTISATION_CLOSED',
          season.payment_message || 'Les cotisations ne sont pas ouvertes pour le moment.',
          { paymentStatus },
        );
      }

      const tariffCode = member.membership_category_code || '';
      const period = resolveMembershipPeriod(member);
      if (!tariffCode) {
        throw buildDomainError('MEMBERSHIP_CATEGORY_MISSING', 'Type de membre manquant');
      }

      const tariffs = Array.isArray(season.tariffs) ? season.tariffs : [];
      const tariff = tariffs.find((entry) => entry && entry.code === tariffCode);
      if (!tariff) {
        throw buildDomainError('TARIFF_NOT_FOUND', 'Tarif de cotisation introuvable', { tariffCode });
      }

      const amount = resolvePrice(tariff, period);
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        throw buildDomainError('TARIFF_UNAVAILABLE', 'Aucun montant disponible pour cette période', {
          tariffCode,
          period,
        });
      }

      const paymentId = `${uid}_${seasonDoc.id}_${period}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const paymentRef = clubRef.collection('cotisation_payments').doc(paymentId);
      const existingPaymentSnap = await paymentRef.get();

      if (existingPaymentSnap.exists && ['awaiting_payment', 'paid'].includes(existingPaymentSnap.get('status'))) {
        const data = existingPaymentSnap.data();
        return {
          paymentId: existingPaymentSnap.id,
          status: data.status,
          alreadyExists: true,
          orderNumber: data.payment_communication,
          paymentCommunication: data.payment_communication,
          amount: data.amount,
          iban: data.iban,
          beneficiary: data.beneficiary,
          epcPayload: data.epcPayload,
          qrDataUrl: data.qrDataUrl,
          validityUntil: data.validity_until?.toDate?.()?.toISOString?.() || null,
        };
      }

      const { first, last, displayName } = resolveMemberName(member);
      const lifrasId = resolveLifrasId(member, uid);
      const communication = buildCommunication({
        year: season.start_year,
        firstName: first,
        lastName: last,
        lifrasId,
      });
      const validityUntil = resolveValidityUntil(Number(season.start_year), period);
      const accountingCode = await resolveAccountingCode(clubRef, tariffCode);
      const now = admin.firestore.Timestamp.now();
      const epcPayload = buildEpcQrPayload({
        iban: bankSettings.iban,
        beneficiary: bankSettings.beneficiary,
        amount,
        communication,
      });
      const qrDataUrl = await QRCode.toDataURL(epcPayload, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 512,
      });

      await paymentRef.set({
        memberId: uid,
        member_id: uid,
        member_name_snapshot: displayName,
        member_email_snapshot: member.email || '',
        lifras_id_snapshot: String(lifrasId).replace(/^MID/, ''),
        tariff_code: tariff.code,
        tariff_label_snapshot: tariff.label,
        tariff_id: tariff.id || tariff.code,
        tariff_label: tariff.label,
        seasonId: seasonDoc.id,
        season_id: seasonDoc.id,
        season_label: season.label || String(season.start_year),
        period,
        amount,
        payment_communication: communication,
        paymentCommunication: communication,
        accounting_code: accountingCode,
        ogm: communication,
        ogm_display: communication,
        status: 'awaiting_payment',
        validity_from: admin.firestore.Timestamp.fromDate(new Date(Date.UTC(Number(season.start_year), 0, 1, 12, 0, 0))),
        validity_until: validityUntil,
        iban: bankSettings.iban,
        beneficiary: bankSettings.beneficiary,
        epcPayload,
        qrDataUrl,
        created_at: now,
        updated_at: now,
      });

      return {
        paymentId: paymentRef.id,
        status: 'awaiting_payment',
        alreadyExists: false,
        orderNumber: communication,
        paymentCommunication: communication,
        amount,
        iban: bankSettings.iban,
        beneficiary: bankSettings.beneficiary,
        epcPayload,
        qrDataUrl,
        validityUntil: validityUntil.toDate().toISOString(),
      };
    } catch (error) {
      throw mapErrorToHttps(error, HttpsError);
    }
  },
);

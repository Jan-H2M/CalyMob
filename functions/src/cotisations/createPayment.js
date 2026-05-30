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

function resolveRequestedPeriod(requestedPeriod, member) {
  if (requestedPeriod === 'sept_dec' || requestedPeriod === 'jan_dec') {
    return requestedPeriod;
  }
  if (member.membership_period === 'sept_dec' || member.membership_period === 'jan_dec') {
    return member.membership_period;
  }
  return 'jan_dec';
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

async function resolveClubEmailSettings(clubRef) {
  const [emailSnap, generalSnap] = await Promise.all([
    clubRef.collection('settings').doc('email_config').get(),
    clubRef.collection('settings').doc('general').get(),
  ]);

  const emailConfig = emailSnap.exists ? emailSnap.data() : {};
  const general = generalSnap.exists ? generalSnap.data() : {};
  if (emailConfig.provider !== 'resend' || !emailConfig.resend?.apiKey) {
    throw buildDomainError(
      'EMAIL_NOT_CONFIGURED',
      'La configuration email du club est manquante.',
    );
  }

  const clubName = general.clubName || 'Calypso';
  return {
    apiKey: emailConfig.resend.apiKey,
    fromEmail: emailConfig.resend.fromEmail || 'onboarding@resend.dev',
    fromName: emailConfig.resend.fromName || clubName,
    clubName,
    logoUrl: general.logoUrl || '',
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatAmount(amount) {
  return `${Number(amount || 0).toFixed(2).replace('.', ',')} €`;
}

function buildCotisationEmailHtml({
  recipientName,
  clubName,
  tariffLabel,
  periodLabel,
  amount,
  communication,
  iban,
  beneficiary,
  logoUrl,
}) {
  const logoBlock = logoUrl
    ? `<div style="text-align:center;margin:0 0 22px;"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(clubName)}" style="max-width:220px;max-height:90px;height:auto;"></div>`
    : '';
  return `
<!doctype html>
<html>
<body style="margin:0;background:#f3f7fb;font-family:Arial,Helvetica,sans-serif;color:#12325c;">
  <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
    <div style="background:#ffffff;border-radius:16px;padding:26px;border:1px solid #dfe8f2;">
      ${logoBlock}
      <h1 style="margin:0 0 10px;font-size:24px;color:#12325c;">Cotisation ${escapeHtml(clubName)}</h1>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.45;">
        Bonjour ${escapeHtml(recipientName)}, voici le QR code pour payer votre cotisation.
        Ouvrez ce mail sur ordinateur et scannez le QR avec votre application bancaire.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <img src="cid:qrcode" alt="QR code de paiement" style="width:260px;max-width:100%;border:1px solid #dfe8f2;border-radius:14px;padding:12px;background:#fff;">
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr><td style="padding:8px 0;color:#667085;">Type</td><td style="padding:8px 0;font-weight:700;">${escapeHtml(tariffLabel)}</td></tr>
        <tr><td style="padding:8px 0;color:#667085;">Période</td><td style="padding:8px 0;font-weight:700;">${escapeHtml(periodLabel)}</td></tr>
        <tr><td style="padding:8px 0;color:#667085;">Montant</td><td style="padding:8px 0;font-weight:800;color:#ff8500;">${escapeHtml(formatAmount(amount))}</td></tr>
        <tr><td style="padding:8px 0;color:#667085;">Bénéficiaire</td><td style="padding:8px 0;font-weight:700;">${escapeHtml(beneficiary)}</td></tr>
        <tr><td style="padding:8px 0;color:#667085;">IBAN</td><td style="padding:8px 0;font-weight:700;">${escapeHtml(iban)}</td></tr>
        <tr><td style="padding:8px 0;color:#667085;">Communication</td><td style="padding:8px 0;font-weight:800;">${escapeHtml(communication)}</td></tr>
      </table>
      <p style="margin:22px 0 0;font-size:14px;line-height:1.45;color:#667085;">
        Si vous préférez faire un virement manuel, utilisez exactement l'IBAN et la communication ci-dessus.
      </p>
    </div>
  </div>
</body>
</html>`.trim();
}

async function sendEmailViaResend(apiKey, from, to, subject, html, attachments = []) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html, attachments }),
  });

  if (!response.ok) {
    let message = `Resend API failed (${response.status})`;
    try {
      const data = await response.json();
      message = data.message || message;
    } catch (_) {
      // Keep the fallback message.
    }
    throw new Error(message);
  }

  return response.json();
}

async function sendCotisationPaymentEmail({
  clubRef,
  clubId,
  member,
  displayName,
  paymentRef,
  season,
  period,
  tariff,
  amount,
  communication,
  bankSettings,
  qrDataUrl,
}) {
  const recipientEmail = String(member.email || '').trim();
  if (!recipientEmail) {
    throw buildDomainError('EMAIL_MISSING', 'Votre fiche membre ne contient pas d’adresse email.');
  }

  const emailSettings = await resolveClubEmailSettings(clubRef);
  const periodLabel = period === 'sept_dec'
    ? 'Nouveau membre · Septembre à décembre année suivante'
    : 'Janvier à décembre';
  const subject = `Cotisation ${season.label || season.start_year} - ${formatAmount(amount)}`;
  const html = buildCotisationEmailHtml({
    recipientName: displayName,
    clubName: emailSettings.clubName,
    tariffLabel: tariff.label,
    periodLabel,
    amount,
    communication,
    iban: bankSettings.iban,
    beneficiary: bankSettings.beneficiary,
    logoUrl: emailSettings.logoUrl,
  });
  const qrBase64 = String(qrDataUrl || '').replace(/^data:image\/png;base64,/, '');
  const result = await sendEmailViaResend(
    emailSettings.apiKey,
    `${emailSettings.fromName} <${emailSettings.fromEmail}>`,
    recipientEmail,
    subject,
    html,
    [
      {
        filename: 'cotisation-qrcode.png',
        content: qrBase64,
        content_id: 'qrcode',
      },
    ],
  );

  const now = admin.firestore.Timestamp.now();
  await Promise.all([
    paymentRef.update({
      email_sent_at: now,
      email_status: 'sent',
      email_resend_id: result.id || null,
      updated_at: now,
    }),
    clubRef.collection('email_history').add({
      recipientEmail,
      recipientName: displayName,
      htmlContent: html,
      sendType: 'automated',
      provider: 'resend',
      emailType: 'cotisation_payment',
      createdAt: now,
      sentAt: now,
      clubId,
      type: 'cotisation_payment',
      to: recipientEmail,
      subject,
      amount,
      paymentId: paymentRef.id,
      resendId: result.id || null,
      status: 'sent',
    }),
  ]);

  return now;
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
    timeoutSeconds: 60,
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
      const requestedPeriod = typeof request.data?.period === 'string' ? request.data.period.trim() : '';
      const period = resolveRequestedPeriod(requestedPeriod, member);
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

      const validityUntil = resolveValidityUntil(Number(season.start_year), period);
      const paymentId = `${uid}_${seasonDoc.id}_${period}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const paymentRef = clubRef.collection('cotisation_payments').doc(paymentId);
      const existingPaymentSnap = await paymentRef.get();

      if (existingPaymentSnap.exists && ['awaiting_payment', 'paid'].includes(existingPaymentSnap.get('status'))) {
        const data = existingPaymentSnap.data();
        let emailSentAt = data.email_sent_at || null;
        if (
          data.status === 'awaiting_payment' &&
          (request.data?.resendEmail === true || !data.email_sent_at)
        ) {
          const { displayName } = resolveMemberName(member);
          emailSentAt = await sendCotisationPaymentEmail({
            clubRef,
            clubId,
            member,
            displayName,
            paymentRef,
            season,
            period,
            tariff: {
              label: data.tariff_label_snapshot || data.tariff_label || tariff.label,
            },
            amount: data.amount,
            communication: data.payment_communication,
            bankSettings: {
              iban: data.iban || bankSettings.iban,
              beneficiary: data.beneficiary || bankSettings.beneficiary,
            },
            qrDataUrl: data.qrDataUrl,
          });
        }
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
          emailSentAt: emailSentAt?.toDate?.()?.toISOString?.() || null,
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

      const emailSentAt = await sendCotisationPaymentEmail({
        clubRef,
        clubId,
        member,
        displayName,
        paymentRef,
        season,
        period,
        tariff,
        amount,
        communication,
        bankSettings,
        qrDataUrl,
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
        emailSentAt: emailSentAt.toDate().toISOString(),
      };
    } catch (error) {
      throw mapErrorToHttps(error, HttpsError);
    }
  },
);

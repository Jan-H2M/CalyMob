/**
 * Cloud Function: Send EPC QR payment email
 *
 * Callable function triggered from CalyMob when a user chooses "Pay now" during event registration.
 * Uses the email template system with type 'event_payment' from Firestore.
 *
 * Input: {
 *   clubId: string,
 *   operationId: string,
 *   participantId: string,
 *   memberEmail: string,
 *   memberFirstName: string,
 *   memberLastName: string,
 *   amount: number,
 *   operationTitle: string,
 *   operationNumber?: string,
 *   operationDate?: string (ISO format)
 * }
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const QRCode = require('qrcode');
const {
  buildEmailRouting,
  logEmailHistoryAndCommunication,
  renderCommunicationTemplate,
  resolveCommunicationTemplate,
} = require('../utils/communicationTemplates');
const { sendEmailWithConfig } = require('../utils/emailDelivery');

/**
 * Generate EPC QR code payload for SEPA Credit Transfer
 *
 * EPC QR Code Structure (12 lines):
 * 1. BCD (Service Tag - fixed)
 * 2. 002 (Version - using 002 for EEA without BIC requirement)
 * 3. 1 (Character encoding - 1=UTF-8)
 * 4. SCT (Identification Code - SEPA Credit Transfer)
 * 5. [BIC] (optional in version 002 for EEA)
 * 6. [Beneficiary Name] (max 70 chars)
 * 7. [IBAN] (max 34 chars)
 * 8. [EUR Amount] (format: EURX.XX)
 * 9. [Purpose Code] (4 chars, optional)
 * 10. [Structured Reference] (optional, ISO 11649)
 * 11. [Unstructured Text] (max 140 chars, payment description)
 * 12. [Beneficiary Info] (max 70 chars, optional)
 */
function generateEpcPayload(data) {
  const {
    beneficiaryName,
    iban,
    amount,
    bic = '',
    description = '',
  } = data;

  // Clean and format data
  const cleanIban = iban.replace(/\s/g, '').toUpperCase();
  const cleanBic = bic.replace(/\s/g, '').toUpperCase();
  const cleanBeneficiary = beneficiaryName.trim().substring(0, 70);
  const formattedAmount = `EUR${amount.toFixed(2)}`;
  const cleanDescription = description.substring(0, 140);

  // Build the 12-line payload
  const lines = [
    'BCD',           // 1. Service Tag
    '002',           // 2. Version (002 = BIC optional in EEA)
    '1',             // 3. Character encoding (1 = UTF-8)
    'SCT',           // 4. Identification code
    cleanBic,        // 5. BIC (optional)
    cleanBeneficiary, // 6. Beneficiary name
    cleanIban,       // 7. IBAN
    formattedAmount, // 8. Amount
    '',              // 9. Purpose code (optional)
    '',              // 10. Structured reference (optional)
    cleanDescription, // 11. Unstructured text (payment description)
    '',              // 12. Beneficiary info (optional)
  ];

  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
}

/**
 * Convert integer (0-9999) to Belgian French word
 *
 * Uses Belgian French: septante (70), nonante (90)
 * Examples: 2 → deux, 25 → vingt-cinq, 70 → septante, 80 → quatre-vingts
 */
function numberToFrenchWord(n) {
  if (n < 0) return numberToFrenchWord(-n);

  const units = [
    'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit',
    'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
    'dix-sept', 'dix-huit', 'dix-neuf',
  ];

  const tens = [
    '', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante',
    'septante', 'quatre-vingt', 'nonante',
  ];

  if (n < 20) return units[n];

  if (n < 100) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (t === 8) {
      if (u === 0) return 'quatre-vingts';
      return `quatre-vingt-${units[u]}`;
    }
    if (u === 0) return tens[t];
    if (u === 1) return `${tens[t]} et un`;
    return `${tens[t]}-${units[u]}`;
  }

  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    let prefix;
    if (h === 1) {
      prefix = 'cent';
    } else {
      prefix = r === 0 ? `${units[h]} cents` : `${units[h]} cent`;
    }
    if (r === 0) return prefix;
    return `${prefix} ${numberToFrenchWord(r)}`;
  }

  if (n < 10000) {
    const m = Math.floor(n / 1000);
    const r = n % 1000;
    const prefix = m === 1 ? 'mille' : `${units[m]} mille`;
    if (r === 0) return prefix;
    return `${prefix} ${numberToFrenchWord(r)}`;
  }

  // Fallback for numbers >= 10000: digit by digit
  return n.toString().split('').map(d => units[parseInt(d, 10)]).join('-');
}

/**
 * Replace all digits in text with Belgian French word equivalents
 *
 * Example: "Villers-2-Eglises" → "Villers-deux-Eglises"
 * Example: "Sortie 25 mars" → "Sortie vingt-cinq mars"
 */
function replaceDigitsWithFrenchWords(text) {
  return text.replace(/\d+/g, (match) => {
    const n = parseInt(match, 10);
    return numberToFrenchWord(isNaN(n) ? 0 : n);
  });
}

function formatInstallmentForCommunication(installmentLabel = '') {
  const label = String(installmentLabel || '').trim().replace(/\s+/g, ' ');
  if (!label) return '';

  const numberMatch = label.match(/\b(\d{1,2})\b/);
  if (numberMatch) {
    return `Tranche ${numberMatch[1]}`;
  }

  return label.substring(0, 24);
}

/**
 * Convert a sequential number to 4 base-26 letters (A=0, B=1, ..., Z=25).
 * Mirrors OperationService.numberToLetterCode in CalyCompta.
 */
function numberToLetterCode(n) {
  const d3 = Math.floor(n / (26 * 26 * 26)) % 26;
  const d2 = Math.floor(n / (26 * 26)) % 26;
  const d1 = Math.floor(n / 26) % 26;
  const d0 = n % 26;
  return String.fromCharCode(65 + d3)
    + String.fromCharCode(65 + d2)
    + String.fromCharCode(65 + d1)
    + String.fromCharCode(65 + d0);
}

/**
 * Decode 4 base-26 letters back to a sequential number.
 * Mirrors OperationService.letterCodeToNumber in CalyCompta.
 */
function letterCodeToNumber(code) {
  return (code.charCodeAt(0) - 65) * 26 * 26 * 26
    + (code.charCodeAt(1) - 65) * 26 * 26
    + (code.charCodeAt(2) - 65) * 26
    + (code.charCodeAt(3) - 65);
}

// Regex patterns recognised by CalyCompta's eventNumberMatchingService.
// Any code that matches one of these can be auto-matched at bank import.
const VALID_NEW_CODE = /^[PS][A-Z]{4}$/;
const VALID_OLD_CODE = /^\d[A-Z0-9]{5}$/;

/**
 * Ensure the operation has a valid event_number for bank reconciliation.
 *
 * If the operation already has a code that matches the matching-service regex,
 * return it. Otherwise generate a new one (P* for plongee, S* for sortie),
 * persist it on the doc, and return it.
 *
 * NOTE: best-effort against races — two concurrent invocations on the same
 * club could theoretically assign the same next code. Rare enough for our
 * low-volume use case; CalyCompta's generator has the same limitation.
 */
async function ensureEventNumber(db, clubId, operationId) {
  const opRef = db.collection('clubs').doc(clubId)
    .collection('operations').doc(operationId);
  const doc = await opRef.get();
  if (!doc.exists) {
    throw new HttpsError('not-found', `Operation ${operationId} not found`);
  }
  const data = doc.data();

  // Already has a recognisable code → keep it.
  if (typeof data.event_number === 'string'
    && (VALID_NEW_CODE.test(data.event_number) || VALID_OLD_CODE.test(data.event_number))) {
    return data.event_number;
  }

  // Only evenement-type operations get an event_number.
  if (data.type !== 'evenement') return null;

  const isDive = data.event_category === 'plongee';
  const prefix = isDive ? 'P' : 'S';

  const snap = await db.collection('clubs').doc(clubId)
    .collection('operations')
    .where('event_number', '>=', prefix + 'AAAA')
    .where('event_number', '<=', prefix + 'ZZZZ')
    .orderBy('event_number', 'desc')
    .limit(1)
    .get();

  let newCode;
  if (snap.empty) {
    newCode = prefix + numberToLetterCode(1); // PAAAB / SAAAB
  } else {
    const last = snap.docs[0].data().event_number;
    newCode = prefix + numberToLetterCode(letterCodeToNumber(last.substring(1)) + 1);
  }

  console.log(`🔧 [ensureEventNumber] Generated ${newCode} for operation ${operationId} (was: "${data.event_number || ''}")`);

  await opRef.update({
    event_number: newCode,
    event_number_autogen_at: admin.firestore.FieldValue.serverTimestamp(),
    event_number_autogen_source: 'sendPaymentQrEmail',
  });

  return newCode;
}

/**
 * Generate digit-free payment communication string
 *
 * Format: +++OP-{eventNumber}+++ {eventName} {installmentLabel} {participantName}
 * Example: +++OP-PAAAG+++ Gozo EDM Ecole de Mer Tranche 2 Jean Dupont
 *
 * The eventNumber MUST be in letter format — callers are expected to call
 * ensureEventNumber() first so a valid code is persisted on the operation.
 * Digits in event name are replaced by French words (workaround for BNP bank bug).
 */
function generatePaymentCommunication(eventNumber, eventId, eventTitle, eventDate, firstName, lastName, installmentLabel = '') {
  // 1. Event code — must be a valid auto-matchable format. If missing, the
  //    caller forgot to call ensureEventNumber; fail loud rather than silently
  //    generating a doc-id substring (which would NOT auto-match at bank import).
  if (!eventNumber) {
    throw new Error(`[generatePaymentCommunication] Missing eventNumber for operation ${eventId}. Call ensureEventNumber() upstream.`);
  }
  if (!VALID_NEW_CODE.test(eventNumber) && !VALID_OLD_CODE.test(eventNumber)) {
    throw new Error(`[generatePaymentCommunication] Invalid eventNumber "${eventNumber}" — must match [PS][A-Z]{4} or \\d[A-Z0-9]{5}`);
  }
  const code = `+++OP-${eventNumber}+++`;

  // 2. Event name with digits replaced by French words
  let name = replaceDigitsWithFrenchWords(eventTitle);
  if (name.length > 60) name = name.substring(0, 60);

  // 3. No date (removed to avoid digits)

  // 4. Participant name (max 30 chars)
  const participantName = `${firstName || ''} ${lastName || ''}`.trim().substring(0, 30);
  const installmentText = formatInstallmentForCommunication(installmentLabel);

  // 5. Build communication (max 140 chars for EPC spec)
  const communication = `${code} ${name} ${installmentText} ${participantName}`.trim();
  return communication.substring(0, 140);
}

/**
 * Format IBAN for display (groups of 4)
 */
function formatIbanDisplay(iban) {
  if (!iban) return '';
  const clean = iban.replace(/\s/g, '').toUpperCase();
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Generate QR code as base64 string (without data URL prefix)
 * Returns just the base64 content for use as email attachment
 */
async function generateQrCodeBase64(payload) {
  try {
    const dataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 300,
      margin: 2,
    });
    // Remove the data URL prefix to get just the base64 content
    // Format: data:image/png;base64,XXXXX
    const base64Content = dataUrl.replace(/^data:image\/png;base64,/, '');
    return base64Content;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
}

/**
 * Format amount for display (Belgian format)
 */
function formatAmount(amount) {
  return `${amount.toFixed(2).replace('.', ',')} €`;
}

/**
 * Format date for display (DD/MM/YYYY)
 */
function formatDateDisplay(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Aggregate payment for a member's inscription including any guest
 * inscriptions linked to it via `parent_inscription_id`.
 *
 * Returns `null` when the participant doc is missing or when there are
 * no guest children (in which case the caller should fall back to the
 * client-supplied amount). Otherwise returns:
 *   {
 *     parentAmount: number,                  // member's own prix + supplements
 *     guestSubtotal: number,                 // sum of all linked guest prix
 *     totalAmount: number,                   // parent + guests
 *     guests: Array<{ name, prix }>,         // for email template rendering
 *     parentInscription: <DocumentData>,     // parent doc for downstream use
 *   }
 *
 * IMPORTANT: this is the single source of truth for "how much should the
 * member pay?" — the caller is allowed to pass an `amount`, but if guests
 * are linked the server overrides it with the aggregated total to prevent
 * the QR from being short-paid.
 */
async function aggregatePaymentForInscription(db, clubId, operationId, participantId) {
  if (!participantId) return null;

  const inscriptionsRef = db
    .collection('clubs').doc(clubId)
    .collection('operations').doc(operationId)
    .collection('inscriptions');

  const parentSnap = await inscriptionsRef.doc(participantId).get();
  if (!parentSnap.exists) {
    console.log(`[aggregatePaymentForInscription] Parent inscription ${participantId} not found — falling back to client amount`);
    return null;
  }
  const parent = parentSnap.data();

  // Guests are inscriptions whose parent_inscription_id points back to us.
  const childrenSnap = await inscriptionsRef
    .where('parent_inscription_id', '==', participantId)
    .where('is_guest', '==', true)
    .get();

  if (childrenSnap.empty) return null;

  // Montant OUVERT d'une inscription (fix "flat aggregation ignore le déjà
  // payé"): avec plan → somme des tranches encore ouvertes; sans plan →
  // 0 si paye, sinon prix + suppléments. On ne re-facture jamais ce qui
  // est déjà réglé.
  const openAmountFor = (i) => {
    const ip = i.installment_payments;
    if (ip && Object.keys(ip).length > 0) {
      return Object.values(ip).reduce((sum, p) => {
        if (!p || p.status === 'paid' || p.status === 'waived') return sum;
        return sum + (Number(p.amount_due) || 0);
      }, 0);
    }
    if (i.paye === true) return 0;
    return (Number(i.prix) || 0) + (Number(i.supplement_total) || 0);
  };

  const parentAmount = openAmountFor(parent);
  let guestSubtotal = 0;
  const guests = [];
  childrenSnap.forEach((doc) => {
    const g = doc.data();
    const guestOpen = openAmountFor(g);
    if (guestOpen <= 0) return; // invité déjà en règle — pas dans le QR
    guestSubtotal += guestOpen;
    const fullName = `${g.membre_prenom || ''} ${g.membre_nom || ''}`.trim() || 'Invité';
    guests.push({ name: fullName, prix: guestOpen });
  });

  const totalAmount = parentAmount + guestSubtotal;
  console.log(`[aggregatePaymentForInscription] parent=${parentAmount}€ + ${guests.length} guests (${guestSubtotal}€) = ${totalAmount}€`);

  return {
    parentAmount,
    guestSubtotal,
    totalAmount,
    guests,
    parentInscription: parent,
  };
}

async function resolveInstallmentPaymentForInscription(db, clubId, operationId, participantId, installmentId) {
  if (!participantId || !installmentId) return null;

  const inscriptionsRef = db
    .collection('clubs').doc(clubId)
    .collection('operations').doc(operationId)
    .collection('inscriptions');

  const inscriptionSnap = await inscriptionsRef.doc(participantId).get();

  if (!inscriptionSnap.exists) {
    console.log(`[resolveInstallmentPaymentForInscription] Inscription ${participantId} not found — falling back to client amount`);
    return null;
  }

  const inscription = inscriptionSnap.data();
  const installment = inscription.installment_payments && inscription.installment_payments[installmentId];
  if (!installment) {
    console.log(`[resolveInstallmentPaymentForInscription] Installment ${installmentId} not found for ${participantId} — falling back to client amount`);
    return null;
  }

  // Montant PROPRE du membre pour CETTE tranche: 0 si sa tranche est déjà
  // payée/dispensée (sinon on re-facturerait une tranche déjà réglée — cas
  // d'un membre en avance sur son invité, p.ex. Patrick a payé son acompte 2
  // mais l'acompte 2 de son invité Marie reste ouvert).
  const ownStatus = installment.status || 'unpaid';
  const ownOpen = ownStatus !== 'paid' && ownStatus !== 'waived';
  const rawOwnDue = Number(installment.amount_due) || 0;
  const ownDue = ownOpen ? rawOwnDue : 0;

  // Paiement groupé: le membre paie SA tranche (si ouverte) + la MÊME tranche
  // (encore ouverte) de chaque invité rattaché (is_guest + parent_inscription_id).
  // Ex.: Acompte 2 = 500 € (membre) + 250 € (invité) = 750 € sur le QR.
  const guestsSnap = await inscriptionsRef
    .where('parent_inscription_id', '==', participantId)
    .where('is_guest', '==', true)
    .get();

  let guestSubtotal = 0;
  const guests = [];
  guestsSnap.forEach((doc) => {
    const g = doc.data();
    const gp = g.installment_payments && g.installment_payments[installmentId];
    if (gp && gp.status !== 'paid' && gp.status !== 'waived') {
      const gd = Number(gp.amount_due) || 0;
      if (gd > 0) {
        guestSubtotal += gd;
        const name = `${g.membre_prenom || ''} ${g.membre_nom || ''}`.trim() || 'Invité';
        guests.push({ name, prix: gd });
      }
    }
  });

  const aggregatedDue = ownDue + guestSubtotal;
  if (!(aggregatedDue > 0)) {
    throw new HttpsError(
      'failed-precondition',
      'Cette tranche ne contient aucun montant à payer.'
    );
  }
  if (guests.length > 0) {
    console.log(`[resolveInstallmentPaymentForInscription] tranche agrégée: ${aggregatedDue}€ (membre ${ownDue}€ + ${guests.length} invité(s) ${guestSubtotal}€)`);
  }

  return {
    amountDue: ownDue,        // montant PROPRE du membre (0 si sa tranche est réglée)
    ownOpen,                  // true si la tranche PROPRE du membre est encore ouverte
    aggregatedDue,            // membre + invités (montant du QR)
    guestSubtotal,
    guests,
    status: installment.status || 'unpaid',
  };
}

/**
 * Core per-member payment email send logic, shared by the
 * `sendPaymentQrEmail` callable (invoked from CalyMob) and the
 * `sendPaymentReminder` callable (invoked from CalyCompta, which
 * iterates this helper per member in the QR group).
 *
 * Behavior is identical to the original inline callable body — this
 * function is a pure extraction so we don't round-trip through a
 * callable interface when re-sending reminder emails server-side.
 *
 * Input shape matches the original `request.data` shape:
 *   { clubId, operationId, participantId, memberEmail, memberFirstName,
 *     memberLastName, amount, operationTitle, operationNumber?, operationDate? }
 *
 * If the participant has guest inscriptions linked via
 * `parent_inscription_id`, the email aggregates those into a single QR.
 * The server-side aggregated total wins over any client-supplied `amount`
 * to prevent short-paid QRs.
 *
 * Throws `HttpsError` on recoverable failures; the caller is expected
 * to translate unexpected errors to `HttpsError('internal', ...)`.
 */
async function sendPaymentEmailForMember(db, input) {
  const {
    clubId,
    operationId,
    participantId,
    memberEmail,
    memberFirstName,
    memberLastName,
    amount: clientAmount,
    operationTitle,
    operationNumber,
    operationDate,
    installmentId,
    installmentLabel,
  } = input;

  console.log(`📧 [sendPaymentQrEmail] Sending payment email for operation ${operationId} to ${memberEmail}`);

  // 0. Aggregate payment if guests are linked. Server-side aggregation
  //    wins over the client-supplied amount so a tampered or stale
  //    `amount` from CalyMob can't short-pay the QR.
  const installmentPayment = installmentId
    ? await resolveInstallmentPaymentForInscription(db, clubId, operationId, participantId, installmentId)
    : null;
  const aggregation = installmentId
    ? null
    : await aggregatePaymentForInscription(
        db, clubId, operationId, participantId
      );
  const amount = installmentPayment ? installmentPayment.aggregatedDue : (aggregation ? aggregation.totalAmount : clientAmount);
  if (aggregation) {
    console.log(`📧 [sendPaymentQrEmail] Aggregated amount: ${amount}€ (parent ${aggregation.parentAmount}€ + ${aggregation.guests.length} guests ${aggregation.guestSubtotal}€). Client sent ${clientAmount}€.`);
  }
  if (installmentPayment && installmentPayment.guests.length > 0) {
    console.log(`📧 [sendPaymentQrEmail] Tranche agrégée: ${amount}€ (membre ${installmentPayment.amountDue}€ + ${installmentPayment.guests.length} invité(s) ${installmentPayment.guestSubtotal}€). Client sent ${clientAmount}€.`);
  }

  // Contexte invités unifié (flat ou par tranche) pour le rendu de l'email.
  const guestContext = aggregation
    ? { count: aggregation.guests.length, subtotal: aggregation.guestSubtotal, parentAmount: aggregation.parentAmount, guests: aggregation.guests }
    : (installmentPayment && installmentPayment.guests.length > 0
        ? { count: installmentPayment.guests.length, subtotal: installmentPayment.guestSubtotal, parentAmount: installmentPayment.amountDue, guests: installmentPayment.guests }
        : null);
  if (typeof amount !== 'number' || amount <= 0) {
    throw new HttpsError(
      'failed-precondition',
      'Aucun montant à payer pour cette inscription (déjà réglée ou gratuite).'
    );
  }

  // 1. Get bank settings
  const bankSettingsDoc = await db.collection('clubs').doc(clubId)
    .collection('settings').doc('bank').get();

  if (!bankSettingsDoc.exists) {
    throw new HttpsError('failed-precondition', 'Bank settings not configured. Please configure IBAN in CalyCompta.');
  }

  const bankSettings = bankSettingsDoc.data();
  const { iban, beneficiaryName, bic } = bankSettings;

  if (!iban || !beneficiaryName) {
    throw new HttpsError('failed-precondition', 'IBAN or beneficiary name not configured');
  }

  // 2. Get email config
  const emailConfigDoc = await db.collection('clubs').doc(clubId)
    .collection('settings').doc('email_config').get();

  if (!emailConfigDoc.exists) {
    throw new HttpsError('failed-precondition', 'Email configuration not found');
  }

  const emailConfig = emailConfigDoc.data();

  const provider = emailConfig.provider || 'resend';
  const hasPrimaryGmail = provider === 'gmail'
    && emailConfig.gmail?.clientId
    && emailConfig.gmail?.clientSecret
    && emailConfig.gmail?.refreshToken
    && emailConfig.gmail?.fromEmail;
  const hasPrimaryResend = provider !== 'gmail'
    && emailConfig.resend?.apiKey
    && emailConfig.resend?.fromEmail;
  const hasFallback = emailConfig.deliveryFallback?.enabled === true
    && emailConfig.deliveryFallback.provider
    && emailConfig.deliveryFallback.provider !== provider;

  if (!hasPrimaryGmail && !hasPrimaryResend && !hasFallback) {
    throw new HttpsError('failed-precondition', 'Email provider not configured');
  }

  // 3. Get general settings for club name and logo
  const generalSettingsDoc = await db.collection('clubs').doc(clubId)
    .collection('settings').doc('general').get();

  const generalSettings = generalSettingsDoc.exists ? generalSettingsDoc.data() : {};
  const clubName = generalSettings.clubName || 'Club';
  const logoUrl = generalSettings.logoUrl || '';

  // 4. Load email template with type 'event_payment' from Firestore
  console.log(`📄 [sendPaymentQrEmail] Looking for email template with emailType='event_payment'`);
  const resolvedTemplate = await resolveCommunicationTemplate(db, clubId, 'event_payment', 'allow_system_seed');
  if (resolvedTemplate.warning) {
    console.warn(`[sendPaymentQrEmail] ${resolvedTemplate.warning}`);
  }
  console.log(`✅ [sendPaymentQrEmail] Using template: ${resolvedTemplate.template.id}`);

  // 5. Ensure the operation has a valid event_number, then generate
  //    the payment communication. If the caller already passed a valid
  //    operationNumber we reuse it; otherwise we fetch/generate-and-save
  //    one on the operation doc so future bank imports can auto-match.
  let effectiveEventNumber = operationNumber;
  if (!effectiveEventNumber
    || (!/^[PS][A-Z]{4}$/.test(effectiveEventNumber) && !/^\d[A-Z0-9]{5}$/.test(effectiveEventNumber))) {
    effectiveEventNumber = await ensureEventNumber(db, clubId, operationId);
    console.log(`📧 [sendPaymentQrEmail] Using ensured event_number=${effectiveEventNumber} for ${operationId}`);
  }

  const paymentReference = generatePaymentCommunication(
    effectiveEventNumber,
    operationId,
    operationTitle,
    operationDate,
    memberFirstName,
    memberLastName,
    installmentLabel
  );

  // 6. Generate EPC payload
  const epcPayload = generateEpcPayload({
    beneficiaryName,
    iban,
    bic,
    amount,
    description: paymentReference,
  });

  // 7. Generate QR code as base64
  const qrCodeBase64 = await generateQrCodeBase64(epcPayload);

  // 8. Prepare template variables
  // Use CID reference for the QR code image (will be embedded as attachment)
  const amountFormatted = formatAmount(amount);
  const ibanFormatted = formatIbanDisplay(iban);
  const eventDateFormatted = formatDateDisplay(operationDate);

  const templateData = {
    recipientName: memberFirstName || memberLastName || memberEmail.split('@')[0],
    firstName: memberFirstName || '',
    lastName: memberLastName || '',
    eventTitle: operationTitle,
    installmentLabel: installmentLabel || '',
    hasInstallment: !!installmentId,
    eventDate: eventDateFormatted,
    amount: amount,
    amountFormatted: amountFormatted,
    iban: iban,
    ibanFormatted: ibanFormatted,
    beneficiaryName: beneficiaryName,
    paymentReference: paymentReference,
    qrCodeImage: 'cid:qrcode',  // CID reference for embedded image
    clubName: clubName,
    logoUrl: logoUrl,
    appUrl: 'https://caly.club',
    // Guest aggregation context for templates that opt-in to display it.
    // When `hasGuests` is false the template should render its normal layout.
    hasGuests: !!guestContext,
    guestCount: guestContext ? guestContext.count : 0,
    // Pre-formatted French label so templates don't need a custom Handlebars
    // helper to pluralise (e.g. "1 invité" / "3 invités").
    guestCountLabel: guestContext
      ? `${guestContext.count} invité${guestContext.count > 1 ? 's' : ''}`
      : '',
    parentAmountFormatted: guestContext ? formatAmount(guestContext.parentAmount) : amountFormatted,
    guestSubtotalFormatted: guestContext ? formatAmount(guestContext.subtotal) : '',
    guests: guestContext ? guestContext.guests.map(g => ({
      name: g.name,
      prixFormatted: formatAmount(g.prix),
    })) : [],
  };

  // 9. Render template
  const { subject: renderedSubject, html: renderedHtml } = renderCommunicationTemplate(
    resolvedTemplate.template,
    templateData
  );

  // 10. Send email with QR code as CID embedded attachment
  const routing = buildEmailRouting(emailConfig, {
    clubId,
    entityType: 'operation',
    entityId: operationId,
    entityLabel: operationTitle,
    recipientEmail: memberEmail,
    recipientName: templateData.recipientName,
  });

  // Prepare QR code attachment with Content-ID for inline display
  const attachments = [
    {
      filename: 'qrcode.png',
      content: qrCodeBase64,
      content_id: 'qrcode',
    },
  ];

  const configuredFromName = provider === 'gmail'
    ? (emailConfig.gmail?.fromName || clubName)
    : (emailConfig.resend?.fromName || clubName);
  const result = await sendEmailWithConfig(emailConfig, {
    to: memberEmail,
    subject: renderedSubject,
    html: renderedHtml,
    attachments,
    replyTo: routing.replyToAddress || undefined,
    replyToName: configuredFromName,
    headers: routing.headers,
  });
  const usedProviderConfig = result.provider === 'gmail' ? (emailConfig.gmail || {}) : (emailConfig.resend || {});

  console.log(`✅ [sendPaymentQrEmail] Email sent successfully to ${memberEmail}, id: ${result.messageId}`);

  // 11. Log to email_history collection
  try {
    const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();
    await logEmailHistoryAndCommunication(db, clubId, {
      // Canonical fields consumed by CalyCompta > Communication > Emails Sortants.
      recipientEmail: memberEmail,
      recipientName: templateData.recipientName,
      htmlContent: renderedHtml,
      sendType: 'automated',
      provider: result.provider,
      providerThreadId: result.providerThreadId || null,
      fallbackUsed: result.fallbackUsed === true,
      attemptedProviders: result.attemptedProviders || null,
      primaryProvider: result.primaryProvider || null,
      fallbackProvider: result.fallbackProvider || null,
      primaryError: result.primaryError || null,
      replyKey: routing.replyKey,
      replyToAddress: routing.replyToAddress,
      fromEmail: usedProviderConfig.fromEmail || null,
      fromName: usedProviderConfig.fromName || clubName,
      emailType: 'event_payment',
      templateId: resolvedTemplate.template.id,
      templateName: resolvedTemplate.template.name,
      templateType: 'event_payment',
      createdAt: serverTimestamp,
      sentAt: serverTimestamp,
      entityType: 'operation',
      entityId: operationId,
      entityLabel: operationTitle,
      // Legacy fields kept for existing scripts and quick Firestore inspection.
      type: 'event_payment',
      to: memberEmail,
      subject: renderedSubject,
      operationId,
      participantId,
      installmentId: installmentId || null,
      installmentLabel: installmentLabel || null,
      amount,
      messageId: result.messageId,
      resendId: result.provider === 'resend' ? result.messageId : null,
      gmailMessageId: result.provider === 'gmail' ? result.messageId : null,
      status: 'sent',
    }, {
      entityType: 'operation',
      entityId: operationId,
      entityLabel: operationTitle,
      templateId: resolvedTemplate.template.id,
      templateName: resolvedTemplate.template.name,
      templateType: 'event_payment',
      triggerName: 'event_payment',
      sendType: 'automated',
    });
  } catch (logError) {
    console.warn('Warning: Failed to log email to history:', logError);
    // Don't throw - email was sent successfully
  }

  // Estampe UNIQUEMENT la tranche PROPRE du membre, et seulement si elle est
  // encore ouverte. On n'écrit JAMAIS amount_due ici: le montant dû vient du
  // tarif/plan, pas de l'envoi d'un QR. (Bug historique 29/06/2026: le montant
  // AGRÉGÉ membre+invités a été persisté dans amount_due de Maxime → double
  // comptage de la part invité au QR suivant, 500 → 750 → 1000 €.)
  // Deux garde-fous:
  //  - installmentPayment null (tranche introuvable) → aucune écriture, sinon
  //    on persisterait le montant client/agrégé dans une nouvelle entrée.
  //  - ownOpen false (tranche du membre déjà payée/dispensée, QR envoyé pour
  //    un invité en retard) → aucune écriture, sinon on écraserait 'paid'.
  if (installmentId && installmentPayment && installmentPayment.ownOpen) {
    try {
      await db.collection('clubs').doc(clubId)
        .collection('operations').doc(operationId)
        .collection('inscriptions').doc(participantId)
        .update({
          [`installment_payments.${installmentId}.status`]: 'qr_sent',
          [`installment_payments.${installmentId}.qr_sent_at`]: admin.firestore.FieldValue.serverTimestamp(),
          [`installment_payments.${installmentId}.payment_email_id`]: result.messageId || null,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (statusError) {
      console.warn(`[sendPaymentQrEmail] Email sent but failed to mark installment ${installmentId} as qr_sent:`, statusError);
    }
  } else if (installmentId) {
    console.log(`[sendPaymentQrEmail] Skip stamping installment ${installmentId} for ${participantId} (ownOpen=${installmentPayment ? installmentPayment.ownOpen : 'n/a'}, resolved=${!!installmentPayment})`);
  }

  return {
    success: true,
    message: 'Payment email sent successfully',
    emailId: result.messageId,
  };
}

/**
 * Main Cloud Function: sendPaymentQrEmail
 *
 * Callable from CalyMob app. Thin wrapper around `sendPaymentEmailForMember`
 * that performs input validation and consistent error translation.
 */
const sendPaymentQrEmail = onCall(
  {
    region: 'europe-west1',
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
  },
  async (request) => {
    const db = admin.firestore();

    // Validate input
    const { clubId, operationId, memberEmail, operationTitle } = request.data;

    if (!clubId || !operationId || !memberEmail || !operationTitle) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    try {
      return await sendPaymentEmailForMember(db, request.data);
    } catch (error) {
      console.error('❌ [sendPaymentQrEmail] Error:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError('internal', error.message || 'Failed to send payment email');
    }
  }
);

module.exports = { sendPaymentQrEmail, sendPaymentEmailForMember };

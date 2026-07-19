/**
 * Shared helpers for the payment reminder system.
 *
 * Used by:
 *   - eventPaymentReminder.js (daily scheduled run, 08:30 Europe/Brussels)
 *   - onInscriptionPaymentChange.js (Firestore trigger, live updates)
 *   - sendPaymentReminder.js (callable, send-time validation)
 *
 * Single source of truth for:
 *   - the "is this operation in the reminder window?" check
 *   - the unpaid-inscription → groups → composed message text pipeline
 *   - the Firestore write that updates `payment_reminder` on the operation
 */

const admin = require('firebase-admin');
const { memberFirstName, memberLastName } = require('../utils/memberName');

const TIME_ZONE = 'Europe/Brussels';
const DAYS_BEFORE_EVENT = 3;
const SKIPPED_STATUSES = new Set(['Annulé', 'annule', 'ferme', 'Fermé']);

// =============================================================================
// Time / date helpers (Europe/Brussels safe)
// =============================================================================

function getTimeZoneParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  const values = {};
  formatter.formatToParts(date).forEach(({ type, value }) => {
    if (type !== 'literal') values[type] = value;
  });
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  const utcTimestamp = Date.UTC(
    parts.year, parts.month - 1, parts.day,
    parts.hour, parts.minute, parts.second,
  );
  return utcTimestamp - date.getTime();
}

function makeDateInTimeZone(year, month, day, hour, minute, second, timeZone) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMs = getTimeZoneOffsetMs(utcGuess, timeZone);
  const zonedDate = new Date(utcGuess.getTime() - offsetMs);
  const correctedOffsetMs = getTimeZoneOffsetMs(zonedDate, timeZone);
  if (correctedOffsetMs === offsetMs) return zonedDate;
  return new Date(utcGuess.getTime() - correctedOffsetMs);
}

function addDaysToCalendarDate(year, month, day, daysToAdd) {
  const date = new Date(Date.UTC(year, month - 1, day + daysToAdd));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/**
 * Returns the window [startOfToday, endOfDayPlusN+1) in Europe/Brussels.
 * Any operation whose date_debut falls inside this window is considered
 * "in the reminder window" and gets a draft.
 */
function getReminderWindow(now = new Date()) {
  const today = getTimeZoneParts(now, TIME_ZONE);
  const startOfToday = makeDateInTimeZone(today.year, today.month, today.day, 0, 0, 0, TIME_ZONE);
  const endTarget = addDaysToCalendarDate(today.year, today.month, today.day, DAYS_BEFORE_EVENT + 1);
  const endOfWindow = makeDateInTimeZone(
    endTarget.year, endTarget.month, endTarget.day, 0, 0, 0, TIME_ZONE,
  );
  return { startOfToday, endOfWindow };
}

function pad2(value) { return String(value).padStart(2, '0'); }

function formatDate(date) {
  const parts = getTimeZoneParts(date, TIME_ZONE);
  return `${pad2(parts.day)}/${pad2(parts.month)}/${parts.year}`;
}

// =============================================================================
// Member / inscription helpers
// =============================================================================

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function extractEmailLocalPart(email) {
  const normalizedEmail = normalizeText(email);
  if (!normalizedEmail.includes('@')) return normalizedEmail;
  return normalizedEmail.split('@')[0].trim();
}

function resolveDisplayName(memberData, memberId) {
  const firstName = normalizeText(memberFirstName(memberData));
  const lastName = normalizeText(memberLastName(memberData));
  if (firstName && lastName) {
    return `${firstName} ${lastName.toLocaleUpperCase('fr-BE')}`;
  }
  const emailLocalPart = extractEmailLocalPart(memberData.email);
  if (emailLocalPart) return emailLocalPart;
  return memberId;
}

function classifyGroup(paymentStatus) {
  if (paymentStatus === 'qr_on_site' || paymentStatus === 'sur_place') return 'sur_place';
  return 'qr_email';
}

function isOpenInstallmentPayment(payment) {
  const amountDue = Number(payment && payment.amount_due) || 0;
  const status = (payment && payment.status) || 'unpaid';
  return amountDue > 0 && status !== 'paid' && status !== 'waived';
}

// Sélection GROUPE: première tranche (par ordre) où le membre OU un de ses
// invités rattachés a encore un montant ouvert. `guestInscriptions` = les
// inscriptions invité (is_guest + parent_inscription_id) liées à ce membre.
// Le montant renvoyé est le montant OUVERT du groupe pour cette tranche
// (part du membre si ouverte + parts des invités ouvertes), de sorte qu'un
// invité en retard (p.ex. acompte 2 de Marie) ne soit jamais sauté quand le
// membre est déjà en règle sur cette tranche.
function resolveFirstOpenInstallment(operationData, inscriptionData, guestInscriptions = []) {
  if (operationData.payment_plan_enabled !== true) return null;
  const installments = Array.isArray(operationData.payment_installments)
    ? [...operationData.payment_installments].sort((a, b) => {
        const left = Number(a.display_order) || 0;
        const right = Number(b.display_order) || 0;
        return left - right;
      })
    : [];
  if (installments.length === 0) return null;

  const payments = inscriptionData.installment_payments || {};
  for (const installment of installments) {
    const id = normalizeText(installment.id);
    if (!id) continue;
    const ownPayment = payments[id] || {};
    const ownOpen = isOpenInstallmentPayment(ownPayment);
    const ownOpenAmount = ownOpen ? (Number(ownPayment.amount_due) || 0) : 0;

    let guestOpenAmount = 0;
    for (const guest of guestInscriptions) {
      const gp = (guest.installment_payments || {})[id];
      if (isOpenInstallmentPayment(gp)) {
        guestOpenAmount += Number(gp.amount_due) || 0;
      }
    }

    const groupOpenAmount = ownOpenAmount + guestOpenAmount;
    if (groupOpenAmount > 0) {
      return {
        installment_id: id,
        installment_label: normalizeText(installment.label) || 'Tranche',
        amount_due: groupOpenAmount,
        status: ownOpen ? (ownPayment.status || 'unpaid') : 'paid',
      };
    }
  }
  return null;
}

function sortMembersByDisplayName(members) {
  members.sort((left, right) => {
    const cmp = left.display_name.localeCompare(
      right.display_name, 'fr-BE', { sensitivity: 'base' },
    );
    if (cmp !== 0) return cmp;
    return left.membre_id.localeCompare(right.membre_id, 'fr-BE', { sensitivity: 'base' });
  });
}

// =============================================================================
// Message composition
// =============================================================================

function buildNameList(members) {
  return members.map((m) => {
    if (m.installment_label && m.amount_due) {
      return `${m.display_name} — ${m.installment_label} (${Number(m.amount_due).toFixed(2)} €)`;
    }
    return m.display_name;
  }).join('\n');
}

function composeReminderText(operationData, qrEmailMembers, surPlaceMembers) {
  const eventTitle = normalizeText(operationData.titre)
    || normalizeText(operationData.title)
    || 'Événement';
  const operationDate = operationData.date_debut && typeof operationData.date_debut.toDate === 'function'
    ? operationData.date_debut.toDate()
    : null;
  if (!operationDate) throw new Error('Operation date_debut is missing or invalid');

  // Short date "DD/MM" — full date with year is overkill in the title
  const shortDate = formatDate(operationDate).slice(0, 5);
  const heading = `Rappel — ${eventTitle} (${shortDate})`;

  const sections = [heading];

  if (qrEmailMembers.length > 0) {
    sections.push(`**Paiement QR pas encore reçu :**\n${buildNameList(qrEmailMembers)}`);
  }

  if (surPlaceMembers.length > 0) {
    sections.push(`**Paiement sur place :**\n${buildNameList(surPlaceMembers)}`);
  }

  sections.push("Utilisez le QR code dans l'app — c'est facile !");

  return sections.join('\n\n');
}

// =============================================================================
// Operation eligibility / draft recompute
// =============================================================================

/**
 * Returns true if the operation should currently have a payment_reminder draft.
 * Conditions: not cancelled/closed, date_debut within [today, today+3 days].
 */
function isOperationInReminderWindow(operationData, now = new Date()) {
  if (!operationData) return false;
  if (SKIPPED_STATUSES.has(operationData.statut)) return false;
  if (!operationData.date_debut || typeof operationData.date_debut.toDate !== 'function') return false;
  const eventDate = operationData.date_debut.toDate();
  const { startOfToday, endOfWindow } = getReminderWindow(now);
  return eventDate >= startOfToday && eventDate < endOfWindow;
}

/**
 * Recompute the payment_reminder draft for one operation.
 *
 * Behavior:
 *   - If status === 'sent' → leave as-is (return { written: false, reason: 'already-sent' })
 *   - If not in reminder window → leave as-is (return { written: false, reason: 'out-of-window' })
 *   - If unpaid inscriptions exist → write fresh draft (status: 'pending')
 *   - If no unpaid inscriptions but a pending draft exists → mark as 'cleared'
 *     (banner disappears in CalyCompta)
 *   - If no unpaid inscriptions and no draft → noop
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} clubId
 * @param {FirebaseFirestore.DocumentReference} operationRef
 * @param {object} operationData
 * @returns {Promise<{written:boolean, reason:string, qrCount?:number, surPlaceCount?:number, title?:string, date?:string}>}
 */
async function recomputePaymentReminderDraft(db, clubId, operationRef, operationData, options = {}) {
  const { allowResend = false } = options;
  const existing = operationData.payment_reminder;

  // Don't overwrite a reminder that's already been sent — UNLESS the caller
  // explicitly wants to allow resending (e.g. send-time refresh from
  // sendPaymentReminder, where the admin clicked "Renvoyer").
  if (existing && existing.status === 'sent' && !allowResend) {
    return { written: false, reason: 'already-sent' };
  }

  if (!isOperationInReminderWindow(operationData)) {
    return { written: false, reason: 'out-of-window' };
  }

  const inscriptionsSnap = await operationRef
    .collection('inscriptions').where('paye', '==', false).get();

  // No unpaid → if there was a pending draft, clear it; otherwise noop.
  if (inscriptionsSnap.empty) {
    if (existing && existing.status === 'pending') {
      await operationRef.update({
        'payment_reminder.status': 'cleared',
        'payment_reminder.cleared_at': admin.firestore.FieldValue.serverTimestamp(),
        'payment_reminder.groups': { qr_email: [], sur_place: [] },
      });
      return { written: true, reason: 'cleared-no-unpaid' };
    }
    return { written: false, reason: 'no-unpaid' };
  }

  // Map parent inscription id -> guest inscriptions (les invités "roulent"
  // sur le rappel agrégé du parent). Permet une sélection de tranche au
  // niveau du GROUPE (membre + invités).
  const guestsByParent = {};
  for (const d of inscriptionsSnap.docs) {
    const x = d.data();
    if (x.is_guest === true && x.parent_inscription_id) {
      if (!guestsByParent[x.parent_inscription_id]) guestsByParent[x.parent_inscription_id] = [];
      guestsByParent[x.parent_inscription_id].push(x);
    }
  }

  // Build groups (qr_email vs sur_place) with display names.
  const groups = { qr_email: [], sur_place: [] };
  for (const insDoc of inscriptionsSnap.docs) {
    try {
      const ins = insDoc.data();
      const insId = insDoc.id;

      // Guest inscriptions linked to a parent member ride on the parent's
      // aggregated QR — never list them as individual reminder recipients,
      // they have no email account anyway. Standalone admin-added guests
      // (no parent_inscription_id) stay in the list as before.
      if (ins.is_guest === true && ins.parent_inscription_id) {
        continue;
      }

      const membreId = normalizeText(ins.membre_id) || insId;
      const openInstallment = resolveFirstOpenInstallment(operationData, ins, guestsByParent[insId] || []);
      const groupKey = openInstallment ? 'qr_email' : classifyGroup(ins.payment_status);

      const memberSnap = await db.collection('clubs').doc(clubId)
        .collection('members').doc(membreId).get();

      const displayName = memberSnap.exists
        ? resolveDisplayName(memberSnap.data(), membreId)
        : membreId;

      groups[groupKey].push({
        membre_id: membreId,
        display_name: displayName,
        inscription_id: insId,
        ...(openInstallment ? openInstallment : {}),
      });
    } catch (error) {
      console.error(
        `[paymentReminder] Error processing inscription ${clubId}/${operationRef.id}/${insDoc.id}:`,
        error,
      );
    }
  }

  sortMembersByDisplayName(groups.qr_email);
  sortMembersByDisplayName(groups.sur_place);

  if (groups.qr_email.length === 0 && groups.sur_place.length === 0) {
    return { written: false, reason: 'no-valid-unpaid' };
  }

  const composedMessage = composeReminderText(operationData, groups.qr_email, groups.sur_place);

  await operationRef.update({
    payment_reminder: {
      prepared_at: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending',
      text: composedMessage,
      groups,
      target_event_date: operationData.date_debut,
      days_before: DAYS_BEFORE_EVENT,
    },
  });

  return {
    written: true,
    reason: 'updated',
    qrCount: groups.qr_email.length,
    surPlaceCount: groups.sur_place.length,
    title: normalizeText(operationData.titre) || normalizeText(operationData.title) || 'Événement',
    date: operationData.date_debut.toDate ? formatDate(operationData.date_debut.toDate()) : '',
  };
}

module.exports = {
  TIME_ZONE,
  DAYS_BEFORE_EVENT,
  SKIPPED_STATUSES,
  getReminderWindow,
  formatDate,
  normalizeText,
  classifyGroup,
  resolveDisplayName,
  sortMembersByDisplayName,
  composeReminderText,
  isOperationInReminderWindow,
  recomputePaymentReminderDraft,
};

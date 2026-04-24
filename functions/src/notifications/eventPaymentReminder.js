/**
 * Cloud Function: Prepare payment reminder drafts for paid events 3 days away
 *
 * Scheduled function that runs daily at 08:30 Europe/Brussels.
 * For each club, it finds events on the target day, groups unpaid participants
 * by payment flow, and stores a reminder draft on the operation document.
 *
 * Output: writes `payment_reminder` on `clubs/{clubId}/operations/{operationId}`
 * only. It does not post chat messages, send FCM notifications, or resend QR
 * emails.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

const TIME_ZONE = 'Europe/Brussels';
const DAYS_BEFORE_EVENT = 3;
const SKIPPED_STATUSES = new Set(['Annulé', 'annule', 'ferme', 'Fermé']);

function getTimeZoneParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const values = {};

  parts.forEach(({ type, value }) => {
    if (type !== 'literal') {
      values[type] = value;
    }
  });

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  const utcTimestamp = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return utcTimestamp - date.getTime();
}

function makeDateInTimeZone(year, month, day, hour, minute, second, timeZone) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMs = getTimeZoneOffsetMs(utcGuess, timeZone);
  const zonedDate = new Date(utcGuess.getTime() - offsetMs);
  const correctedOffsetMs = getTimeZoneOffsetMs(zonedDate, timeZone);

  if (correctedOffsetMs === offsetMs) {
    return zonedDate;
  }

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

function getTargetDayWindow(now = new Date()) {
  const today = getTimeZoneParts(now, TIME_ZONE);
  const targetDay = addDaysToCalendarDate(
    today.year,
    today.month,
    today.day,
    DAYS_BEFORE_EVENT,
  );
  const nextDay = addDaysToCalendarDate(
    targetDay.year,
    targetDay.month,
    targetDay.day,
    1,
  );

  const startOfTargetDay = makeDateInTimeZone(
    targetDay.year,
    targetDay.month,
    targetDay.day,
    0,
    0,
    0,
    TIME_ZONE,
  );
  const endOfTargetDay = makeDateInTimeZone(
    nextDay.year,
    nextDay.month,
    nextDay.day,
    0,
    0,
    0,
    TIME_ZONE,
  );

  return {
    targetDay,
    startOfTargetDay,
    endOfTargetDay,
    targetDate: startOfTargetDay,
  };
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatDate(date) {
  // Format the operation date in Europe/Brussels so the rendered dd/MM/yyyy
  // never drifts around midnight regardless of the server's local timezone.
  const parts = getTimeZoneParts(date, TIME_ZONE);
  return `${pad2(parts.day)}/${pad2(parts.month)}/${parts.year}`;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function extractEmailLocalPart(email) {
  const normalizedEmail = normalizeText(email);
  if (!normalizedEmail.includes('@')) return normalizedEmail;
  return normalizedEmail.split('@')[0].trim();
}

function resolveDisplayName(memberData, memberId) {
  const firstName = normalizeText(memberData.prenom);
  const lastName = normalizeText(memberData.nom);

  if (firstName && lastName) {
    return `${firstName} ${lastName.toLocaleUpperCase('fr-BE')}`;
  }

  const emailLocalPart = extractEmailLocalPart(memberData.email);
  if (emailLocalPart) {
    return emailLocalPart;
  }

  console.warn(
    `[eventPaymentReminder] Missing prenom/nom/email for member ${memberId}, falling back to member id`,
  );
  return memberId;
}

function classifyGroup(paymentStatus) {
  if (paymentStatus === 'qr_on_site' || paymentStatus === 'sur_place') {
    return 'sur_place';
  }

  return 'qr_email';
}

function buildBulletList(members) {
  return members.map((member) => `   • ${member.display_name}`).join('\n');
}

function composeReminderText(operation, qrEmailMembers, surPlaceMembers) {
  const eventTitle = normalizeText(operation.titre) || normalizeText(operation.title) || 'Événement';
  const operationDate = operation.date && typeof operation.date.toDate === 'function'
    ? operation.date.toDate()
    : null;

  if (!operationDate) {
    throw new Error('Operation date is missing or invalid');
  }

  const heading = `Rappel — paiement pour ${eventTitle} du ${formatDate(operationDate)}`;
  const qrParagraph = `Ont choisi de payer via le QR code envoyé par email — paiement pas encore reçu (nouvel email envoyé) :\n${buildBulletList(qrEmailMembers)}`;
  const surPlaceParagraph = `Paiement sur place confirmé (ne pas oublier votre téléphone) :\n${buildBulletList(surPlaceMembers)}`;

  if (qrEmailMembers.length > 0 && surPlaceMembers.length > 0) {
    return [
      heading,
      'Il reste 3 jours avant l\'événement. Quelques paiements sont encore en attente :',
      qrParagraph,
      surPlaceParagraph,
      'Merci d\'utiliser de préférence le QR code dans l\'app — cela facilite énormément le travail du trésorier.',
    ].join('\n\n');
  }

  if (qrEmailMembers.length > 0) {
    return [
      heading,
      'Il reste 3 jours avant l\'événement. Quelques paiements sont encore en attente :',
      qrParagraph,
      'Merci d\'utiliser de préférence le QR code dans l\'app — cela facilite énormément le travail du trésorier.',
    ].join('\n\n');
  }

  return [
    heading,
    'Il reste 3 jours avant l\'événement.',
    surPlaceParagraph,
    'À bientôt !',
  ].join('\n\n');
}

function sortMembersByDisplayName(members) {
  members.sort((left, right) => {
    const displayNameComparison = left.display_name.localeCompare(
      right.display_name,
      'fr-BE',
      { sensitivity: 'base' },
    );

    if (displayNameComparison !== 0) {
      return displayNameComparison;
    }

    return left.membre_id.localeCompare(right.membre_id, 'fr-BE', {
      sensitivity: 'base',
    });
  });
}

function logSkip(clubId, operationId, reason) {
  console.log(`[eventPaymentReminder] Skipped ${clubId}/${operationId}: ${reason}`);
}

exports.eventPaymentReminder = onSchedule(
  {
    schedule: '30 8 * * *',
    timeZone: TIME_ZONE,
    region: 'europe-west1',
  },
  async () => {
    console.log('[eventPaymentReminder] Running at', new Date().toISOString());

    try {
      const db = admin.firestore();
      const { startOfTargetDay, endOfTargetDay, targetDate } = getTargetDayWindow();
      const clubsSnapshot = await db.collection('clubs').get();
      let totalPrepared = 0;

      for (const clubDoc of clubsSnapshot.docs) {
        const clubId = clubDoc.id;
        console.log(`[eventPaymentReminder] Checking operations for club ${clubId}`);

        try {
          const operationsSnapshot = await db
            .collection('clubs')
            .doc(clubId)
            .collection('operations')
            .where('date', '>=', admin.firestore.Timestamp.fromDate(startOfTargetDay))
            .where('date', '<', admin.firestore.Timestamp.fromDate(endOfTargetDay))
            .get();

          if (operationsSnapshot.empty) {
            console.log(`[eventPaymentReminder] No candidate operations for club ${clubId}`);
            continue;
          }

          for (const operationDoc of operationsSnapshot.docs) {
            const operationId = operationDoc.id;

            try {
              const operation = operationDoc.data();
              const operationRef = operationDoc.ref;

              if (SKIPPED_STATUSES.has(operation.statut)) {
                logSkip(clubId, operationId, `status "${operation.statut}"`);
                continue;
              }

              const inscriptionsSnapshot = await operationRef
                .collection('inscriptions')
                .where('paye', '==', false)
                .get();

              if (inscriptionsSnapshot.empty) {
                logSkip(clubId, operationId, 'no unpaid inscriptions');
                continue;
              }

              if (
                operation.payment_reminder
                && operation.payment_reminder.prepared_at
                && operation.payment_reminder.status !== 'cancelled'
              ) {
                logSkip(clubId, operationId, 'already prepared');
                continue;
              }

              const groups = {
                qr_email: [],
                sur_place: [],
              };

              for (const inscriptionDoc of inscriptionsSnapshot.docs) {
                try {
                  const inscription = inscriptionDoc.data();
                  const inscriptionId = inscriptionDoc.id;
                  const membreId = normalizeText(inscription.membre_id) || inscriptionId;

                  if (!inscription.membre_id) {
                    console.warn(
                      `[eventPaymentReminder] Missing membre_id for ${clubId}/${operationId}/${inscriptionId}, falling back to inscription id`,
                    );
                  }

                  const groupKey = classifyGroup(inscription.payment_status);
                  const memberRef = db
                    .collection('clubs')
                    .doc(clubId)
                    .collection('members')
                    .doc(membreId);
                  const memberDoc = await memberRef.get();

                  let displayName;
                  if (!memberDoc.exists) {
                    console.warn(
                      `[eventPaymentReminder] Member ${membreId} not found for ${clubId}/${operationId}/${inscriptionId}, falling back to member id`,
                    );
                    displayName = membreId;
                  } else {
                    displayName = resolveDisplayName(memberDoc.data(), membreId);
                  }

                  groups[groupKey].push({
                    membre_id: membreId,
                    display_name: displayName,
                    inscription_id: inscriptionId,
                  });
                } catch (error) {
                  console.error(
                    `[eventPaymentReminder] Error processing inscription ${clubId}/${operationId}/${inscriptionDoc.id}:`,
                    error,
                  );
                }
              }

              sortMembersByDisplayName(groups.qr_email);
              sortMembersByDisplayName(groups.sur_place);

              if (groups.qr_email.length === 0 && groups.sur_place.length === 0) {
                logSkip(clubId, operationId, 'no valid unpaid members after processing');
                continue;
              }

              const composedMessage = composeReminderText(
                operation,
                groups.qr_email,
                groups.sur_place,
              );

              await operationRef.update({
                payment_reminder: {
                  prepared_at: admin.firestore.FieldValue.serverTimestamp(),
                  status: 'pending',
                  text: composedMessage,
                  groups,
                  target_event_date: admin.firestore.Timestamp.fromDate(targetDate),
                  days_before: DAYS_BEFORE_EVENT,
                },
              });

              totalPrepared += 1;
              console.log(
                `[eventPaymentReminder] Prepared draft for ${clubId}/${operationId}: ${groups.qr_email.length} QR, ${groups.sur_place.length} sur place`,
              );
            } catch (error) {
              console.error(
                `[eventPaymentReminder] Error processing operation ${clubId}/${operationId}:`,
                error,
              );
            }
          }
        } catch (error) {
          console.error(`[eventPaymentReminder] Error processing club ${clubId}:`, error);
        }
      }

      console.log(
        `[eventPaymentReminder] Completed: ${totalPrepared} drafts across ${clubsSnapshot.size} clubs`,
      );
    } catch (error) {
      console.error('[eventPaymentReminder] Unrecoverable error:', error);
      throw error;
    }
  },
);

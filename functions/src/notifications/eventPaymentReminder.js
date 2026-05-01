/**
 * Cloud Function: Daily refresh of payment reminder drafts.
 *
 * Scheduled run: every day at 08:30 Europe/Brussels.
 *
 * For every club, scans operations whose `date_debut` falls within the next 3
 * days (inclusive of today, exclusive of day +4) and recomputes the
 * `payment_reminder` draft on each operation by reading the current state of
 * its `inscriptions` subcollection. This is the daily backstop: live updates
 * are normally handled by `onInscriptionPaymentChange` (Firestore trigger).
 *
 * Output:
 *   - writes / updates / clears `payment_reminder` on each in-window operation
 *   - sends a single summary email to ADMIN_NOTIFICATION_EMAIL listing all
 *     operations that currently have a pending draft (so the admin doesn't
 *     have to remember to open CalyCompta).
 *
 * Email failures are logged but never fail the function — drafts must remain
 * written to Firestore.
 *
 * It does not post chat messages, send FCM notifications, or resend QR
 * emails. Those side effects are triggered manually from CalyCompta via the
 * `sendPaymentReminder` callable.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

const {
  TIME_ZONE,
  getReminderWindow,
  formatDate,
  normalizeText,
  recomputePaymentReminderDraft,
} = require('../payment/paymentReminderHelpers');

const ADMIN_NOTIFICATION_EMAIL = 'jan.andriessens@gmail.com';
const APP_URL = 'https://caly.club';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

async function sendEmailViaResend(apiKey, from, to, subject, html) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!response.ok) {
    let errorMessage = `Resend API failed (${response.status})`;
    try {
      const errorData = await response.json();
      if (errorData && errorData.message) errorMessage = errorData.message;
    } catch (e) { /* ignore */ }
    throw new Error(errorMessage);
  }
  return response.json();
}

async function findResendConfigForAdminEmail(db) {
  const clubsSnapshot = await db.collection('clubs').get();
  for (const clubDoc of clubsSnapshot.docs) {
    try {
      const configDoc = await db.collection('clubs').doc(clubDoc.id)
        .collection('settings').doc('email_config').get();
      if (!configDoc.exists) continue;
      const data = configDoc.data();
      if (data.provider !== 'resend' || !data.resend || !data.resend.apiKey) continue;
      const generalDoc = await db.collection('clubs').doc(clubDoc.id)
        .collection('settings').doc('general').get();
      const general = generalDoc.exists ? generalDoc.data() : {};
      return {
        apiKey: data.resend.apiKey,
        fromEmail: data.resend.fromEmail || 'onboarding@resend.dev',
        fromName: data.resend.fromName || general.clubName || 'Calypso',
      };
    } catch (e) {
      console.warn(`[eventPaymentReminder] Failed to read email config for ${clubDoc.id}:`, e);
    }
  }
  return null;
}

function buildAdminNotificationHtml(preparedDrafts) {
  const rows = preparedDrafts.map((d) => {
    const link = `${APP_URL}/operations?selectedId=${encodeURIComponent(d.operationId)}`;
    return `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #eee;vertical-align:top;">
          <strong>${escapeHtml(d.title)}</strong><br>
          <span style="color:#666;font-size:13px;">${escapeHtml(d.date)}</span>
        </td>
        <td style="padding:12px;border-bottom:1px solid #eee;vertical-align:top;color:#333;">
          ${d.qrCount} via QR-mail<br>
          ${d.surPlaceCount} sur place
        </td>
        <td style="padding:12px;border-bottom:1px solid #eee;vertical-align:top;">
          <a href="${link}" style="background:#d97706;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;font-size:13px;">Openen in CalyCompta →</a>
        </td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8"><title>Betalingsreminders klaar</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;margin:0;padding:24px;color:#111;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;padding:28px;border:1px solid #e5e5e5;">
    <h1 style="margin:0 0 8px 0;font-size:20px;color:#111;">🔔 Betalingsreminders klaar voor verzending</h1>
    <p style="color:#555;margin:0 0 20px 0;font-size:14px;line-height:1.5;">
      Onderstaande events vinden binnen 3 dagen plaats en hebben nog onbetaalde deelnemers.
      Open het event in CalyCompta, ga naar het tabblad <strong>Inscriptions</strong> en klik op
      <em>"Prévisualiser et envoyer"</em> om de reminder te versturen.
      Banner-cijfers updaten live wanneer betalingen binnenkomen.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead><tr style="background:#fafafa;">
        <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #e5e5e5;">Event</th>
        <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #e5e5e5;">Onbetaald</th>
        <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #e5e5e5;">Actie</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#888;font-size:12px;margin-top:24px;line-height:1.5;">
      Automatisch verzonden door Calypso Cloud Function <code>eventPaymentReminder</code> (dagelijks 08:30 Europe/Brussels).
    </p>
  </div>
</body></html>`;
}

async function sendAdminNotificationEmail(db, preparedDrafts) {
  if (preparedDrafts.length === 0) {
    console.log('[eventPaymentReminder] No drafts prepared — skipping admin email');
    return;
  }
  try {
    const config = await findResendConfigForAdminEmail(db);
    if (!config) {
      console.warn('[eventPaymentReminder] No Resend config found — admin email skipped');
      return;
    }
    const subject = preparedDrafts.length === 1
      ? `🔔 Calypso — 1 betalingsreminder klaar voor verzending`
      : `🔔 Calypso — ${preparedDrafts.length} betalingsreminders klaar voor verzending`;
    const html = buildAdminNotificationHtml(preparedDrafts);
    const from = `${config.fromName} <${config.fromEmail}>`;
    await sendEmailViaResend(config.apiKey, from, ADMIN_NOTIFICATION_EMAIL, subject, html);
    console.log(
      `[eventPaymentReminder] Admin notification email sent to ${ADMIN_NOTIFICATION_EMAIL} (${preparedDrafts.length} drafts)`,
    );
  } catch (error) {
    console.error('[eventPaymentReminder] Failed to send admin notification email:', error);
  }
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
      const { startOfToday, endOfWindow } = getReminderWindow();
      const clubsSnapshot = await db.collection('clubs').get();
      let totalUpdated = 0;
      let totalCleared = 0;
      const preparedDrafts = [];

      for (const clubDoc of clubsSnapshot.docs) {
        const clubId = clubDoc.id;
        console.log(`[eventPaymentReminder] Checking operations for club ${clubId}`);

        try {
          const operationsSnapshot = await db.collection('clubs').doc(clubId)
            .collection('operations')
            .where('date_debut', '>=', admin.firestore.Timestamp.fromDate(startOfToday))
            .where('date_debut', '<', admin.firestore.Timestamp.fromDate(endOfWindow))
            .get();

          if (operationsSnapshot.empty) {
            console.log(`[eventPaymentReminder] No operations in window for club ${clubId}`);
            continue;
          }

          for (const operationDoc of operationsSnapshot.docs) {
            const operationId = operationDoc.id;
            try {
              const result = await recomputePaymentReminderDraft(
                db, clubId, operationDoc.ref, operationDoc.data(),
              );
              console.log(
                `[eventPaymentReminder] ${clubId}/${operationId}: ${result.reason}`,
              );
              if (result.reason === 'updated') {
                totalUpdated += 1;
                preparedDrafts.push({
                  clubId,
                  operationId,
                  title: result.title,
                  date: result.date,
                  qrCount: result.qrCount,
                  surPlaceCount: result.surPlaceCount,
                });
              } else if (result.reason === 'cleared-no-unpaid') {
                totalCleared += 1;
              }
            } catch (error) {
              console.error(
                `[eventPaymentReminder] Error processing ${clubId}/${operationId}:`, error,
              );
            }
          }
        } catch (error) {
          console.error(`[eventPaymentReminder] Error processing club ${clubId}:`, error);
        }
      }

      console.log(
        `[eventPaymentReminder] Completed: ${totalUpdated} drafts updated, ${totalCleared} cleared (across ${clubsSnapshot.size} clubs)`,
      );

      // Sort drafts chronologically before sending the summary email.
      preparedDrafts.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      await sendAdminNotificationEmail(db, preparedDrafts);
    } catch (error) {
      console.error('[eventPaymentReminder] Unrecoverable error:', error);
      throw error;
    }
  },
);

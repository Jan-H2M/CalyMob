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
const { sendEmailWithConfig } = require('../utils/emailDelivery');
const {
  logEmailHistoryAndCommunication,
  renderCommunicationTemplate,
  resolveCommunicationTemplate,
} = require('../utils/communicationTemplates');

const ADMIN_NOTIFICATION_EMAIL = process.env.CALYMOB_ADMIN_NOTIFICATION_EMAIL || 'jan.andriessens@gmail.com';
const APP_URL = 'https://caly.club';
const ADMIN_NOTIFICATION_TEMPLATE_TYPE = 'event_payment_reminder';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function hasProviderConfig(emailConfig, provider) {
  if (provider === 'gmail') {
    return Boolean(
      emailConfig?.gmail?.clientId
      && emailConfig.gmail.clientSecret
      && emailConfig.gmail.refreshToken
      && emailConfig.gmail.fromEmail,
    );
  }

  return Boolean(
    emailConfig?.resend?.apiKey
    && emailConfig.resend.fromEmail
    && emailConfig.resend.fromEmail !== 'onboarding@resend.dev',
  );
}

function canDeliverAdminEmail(emailConfig) {
  const primaryProvider = emailConfig?.provider === 'gmail' ? 'gmail' : 'resend';
  if (hasProviderConfig(emailConfig, primaryProvider)) return true;

  const fallbackProvider = emailConfig?.deliveryFallback?.enabled === true
    && emailConfig.deliveryFallback.provider
    && emailConfig.deliveryFallback.provider !== primaryProvider
    ? emailConfig.deliveryFallback.provider
    : null;

  return fallbackProvider ? hasProviderConfig(emailConfig, fallbackProvider) : false;
}

function normalizeProvider(value) {
  return value === 'gmail' ? 'gmail' : 'resend';
}

function normalizeIdentity(value) {
  if (!value || typeof value !== 'object') return null;
  const email = typeof value.email === 'string' ? value.email.trim() : '';
  if (!email) return null;
  return {
    id: typeof value.id === 'string' ? value.id.trim() : '',
    email,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : '',
    provider: normalizeProvider(value.provider),
    active: value.active !== false,
  };
}

function getProviderConfig(emailConfig, provider) {
  return provider === 'gmail' ? (emailConfig?.gmail || {}) : (emailConfig?.resend || {});
}

function resolveAdminSenderIdentity(emailConfig, clubName) {
  const identities = Array.isArray(emailConfig?.senderIdentities)
    ? emailConfig.senderIdentities.map(normalizeIdentity).filter(Boolean)
    : [];
  const activeIdentities = identities.filter((identity) => identity.active !== false);
  const moduleIdentityIds = emailConfig?.moduleSenderIdentityIds || {};
  const preferredIdentityIds = [
    moduleIdentityIds.event_payment_reminder,
    moduleIdentityIds.payment_reminder,
    moduleIdentityIds.operation,
    moduleIdentityIds.event,
    emailConfig?.defaultSenderIdentityId,
  ].filter((value) => typeof value === 'string' && value.trim());
  const provider = normalizeProvider(emailConfig?.provider);
  const providerConfig = getProviderConfig(emailConfig, provider);
  const selected = preferredIdentityIds
    .map((id) => activeIdentities.find((identity) => identity.id && identity.id === id))
    .find(Boolean)
    || activeIdentities.find((identity) => identity.provider === provider)
    || activeIdentities[0];

  return {
    id: selected?.id || `${provider}-default`,
    email: selected?.email || providerConfig.fromEmail,
    name: selected?.name || providerConfig.fromName || clubName || 'Calypso Diving Club',
    provider: selected?.provider || provider,
  };
}

function buildDeliveryConfigForIdentity(emailConfig, senderIdentity) {
  const provider = normalizeProvider(senderIdentity.provider || emailConfig?.provider);
  const deliveryConfig = {
    ...(emailConfig || {}),
    provider,
    resend: { ...(emailConfig?.resend || {}) },
    gmail: { ...(emailConfig?.gmail || {}) },
  };

  if (provider === 'gmail') {
    deliveryConfig.gmail = {
      ...deliveryConfig.gmail,
      fromEmail: senderIdentity.email || deliveryConfig.gmail.fromEmail,
      fromName: senderIdentity.name || deliveryConfig.gmail.fromName,
    };
  } else {
    deliveryConfig.resend = {
      ...deliveryConfig.resend,
      fromEmail: senderIdentity.email || deliveryConfig.resend.fromEmail,
      fromName: senderIdentity.name || deliveryConfig.resend.fromName,
    };
  }

  return deliveryConfig;
}

async function getAdminEmailContext(db, clubId) {
  try {
    const [configDoc, generalDoc] = await Promise.all([
      db.collection('clubs').doc(clubId).collection('settings').doc('email_config').get(),
      db.collection('clubs').doc(clubId).collection('settings').doc('general').get(),
    ]);
    if (!configDoc.exists) return null;
    const emailConfig = configDoc.data() || {};
    const general = generalDoc.exists ? (generalDoc.data() || {}) : {};
    const clubName = general.clubName || general.nom || 'Calypso Diving Club';
    const senderIdentity = resolveAdminSenderIdentity(emailConfig, clubName);
    const deliveryConfig = buildDeliveryConfigForIdentity(emailConfig, senderIdentity);
    if (!canDeliverAdminEmail(deliveryConfig)) return null;
    return {
      clubId,
      clubName,
      logoUrl: general.logoUrl || general.logo_url || '',
      emailConfig,
      deliveryConfig,
      senderIdentity,
    };
  } catch (e) {
    console.warn(`[eventPaymentReminder] Failed to read email context for ${clubId}:`, e);
    return null;
  }
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
          ${d.qrCount} via email QR<br>
          ${d.surPlaceCount} sur place
        </td>
        <td style="padding:12px;border-bottom:1px solid #eee;vertical-align:top;">
          <a href="${link}" style="background:#d97706;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;font-size:13px;">Ouvrir dans CalyCompta →</a>
        </td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Rappels de paiement prêts</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;margin:0;padding:24px;color:#111;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;padding:28px;border:1px solid #e5e5e5;">
    <h1 style="margin:0 0 8px 0;font-size:20px;color:#111;">🔔 Rappels de paiement prêts à envoyer</h1>
    <p style="color:#555;margin:0 0 20px 0;font-size:14px;line-height:1.5;">
      Les événements ci-dessous ont lieu dans les 3 prochains jours et certains paiements
      sont encore en attente. Ouvrez l'événement dans CalyCompta, allez dans l'onglet
      <strong>Inscriptions</strong> et cliquez sur <em>"Prévisualiser et envoyer"</em>
      pour envoyer le rappel. Les compteurs de la bannière se mettent à jour en direct
      à mesure que les paiements arrivent.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead><tr style="background:#fafafa;">
        <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #e5e5e5;">Événement</th>
        <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #e5e5e5;">Impayé</th>
        <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #e5e5e5;">Action</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#888;font-size:12px;margin-top:24px;line-height:1.5;">
      Envoyé automatiquement par la Cloud Function Calypso <code>eventPaymentReminder</code>
      (tous les jours à 08:30 Europe/Bruxelles).
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
    const clubId = preparedDrafts[0].clubId;
    const context = await getAdminEmailContext(db, clubId);
    if (!context) {
      console.warn(`[eventPaymentReminder] No deliverable email config found for ${clubId} — admin email skipped`);
      return;
    }
    const defaultSubject = preparedDrafts.length === 1
      ? `🔔 Calypso — 1 rappel de paiement prêt à envoyer`
      : `🔔 Calypso — ${preparedDrafts.length} rappels de paiement prêts à envoyer`;
    const templateData = {
      recipientName: 'Administrateur',
      clubName: context.clubName,
      logoUrl: context.logoUrl,
      appUrl: APP_URL,
      draftsCount: preparedDrafts.length,
      drafts: preparedDrafts.map((draft) => ({
        ...draft,
        url: `${APP_URL}/operations?selectedId=${encodeURIComponent(draft.operationId)}`,
      })),
    };
    let templateMeta = {
      templateId: null,
      templateName: null,
      templateSource: 'fallback',
      templateWarning: null,
    };
    let subject = defaultSubject;
    let html = buildAdminNotificationHtml(preparedDrafts);

    try {
      const resolved = await resolveCommunicationTemplate(db, clubId, ADMIN_NOTIFICATION_TEMPLATE_TYPE);
      const rendered = renderCommunicationTemplate(resolved.template, templateData);
      subject = rendered.subject || defaultSubject;
      html = rendered.html || html;
      templateMeta = {
        templateId: resolved.template.id || null,
        templateName: resolved.template.name || resolved.template.id || null,
        templateSource: resolved.source,
        templateWarning: resolved.warning || null,
      };
    } catch (templateError) {
      templateMeta.templateWarning = templateError.message || String(templateError);
      console.warn(`[eventPaymentReminder] Template resolution failed for ${clubId}:`, templateError);
    }

    const result = await sendEmailWithConfig(context.deliveryConfig, {
      to: ADMIN_NOTIFICATION_EMAIL,
      subject,
      html,
      headers: {
        'X-CalyMob-Notification': 'event_payment_reminder_admin_summary',
        'X-CalyMob-Club-Id': clubId,
        'X-CalyCompta-Template-Type': ADMIN_NOTIFICATION_TEMPLATE_TYPE,
      },
    });
    const usedProviderConfig = result.provider === 'gmail'
      ? (context.deliveryConfig.gmail || {})
      : (context.deliveryConfig.resend || {});
    await logEmailHistoryAndCommunication(db, clubId, {
      recipientEmail: ADMIN_NOTIFICATION_EMAIL,
      recipientName: 'Administrateur',
      emailType: ADMIN_NOTIFICATION_TEMPLATE_TYPE,
      templateType: ADMIN_NOTIFICATION_TEMPLATE_TYPE,
      templateId: templateMeta.templateId,
      templateName: templateMeta.templateName,
      templateSource: templateMeta.templateSource,
      templateWarning: templateMeta.templateWarning,
      subject,
      htmlContent: html,
      textContent: normalizeText(html.replace(/<[^>]*>/g, ' ')),
      status: 'sent',
      messageId: result.messageId || null,
      provider: result.provider,
      providerThreadId: result.providerThreadId || null,
      fallbackUsed: result.fallbackUsed || false,
      attemptedProviders: result.attemptedProviders || [],
      primaryError: result.primaryError || null,
      identityId: context.senderIdentity.id,
      fromEmail: usedProviderConfig.fromEmail || context.senderIdentity.email || null,
      fromName: usedProviderConfig.fromName || context.senderIdentity.name || null,
      sendType: 'automated',
      triggerName: 'eventPaymentReminder',
      entityType: 'system',
      entityId: `event_payment_reminder:${new Date().toISOString().slice(0, 10)}`,
      entityLabel: `${preparedDrafts.length} rappel(s) de paiement`,
    }, {
      entityType: 'system',
      entityId: `event_payment_reminder:${new Date().toISOString().slice(0, 10)}`,
      entityLabel: `${preparedDrafts.length} rappel(s) de paiement`,
      templateType: ADMIN_NOTIFICATION_TEMPLATE_TYPE,
      templateId: templateMeta.templateId,
      templateName: templateMeta.templateName,
      sendType: 'automated',
      triggerName: 'eventPaymentReminder',
    });
    console.log(
      `[eventPaymentReminder] Admin notification email sent to ${ADMIN_NOTIFICATION_EMAIL} `
      + `(${preparedDrafts.length} drafts, provider=${result.provider}, fallback=${result.fallbackUsed ? 'yes' : 'no'})`,
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
      const draftsByClub = new Map();
      for (const draft of preparedDrafts) {
        const clubDrafts = draftsByClub.get(draft.clubId) || [];
        clubDrafts.push(draft);
        draftsByClub.set(draft.clubId, clubDrafts);
      }
      for (const clubDrafts of draftsByClub.values()) {
        await sendAdminNotificationEmail(db, clubDrafts);
      }
    } catch (error) {
      console.error('[eventPaymentReminder] Unrecoverable error:', error);
      throw error;
    }
  },
);

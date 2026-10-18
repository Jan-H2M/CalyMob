const admin = require('firebase-admin');
const { onCall } = require('firebase-functions/v2/https');
const { REGION } = require('../utils/constants');
const { buildBugResolutionHistoryRecord } = require('../utils/notificationHistory');
const { isActiveMember } = require('../utils/memberStatus');

const MAX_SCREENSHOTS = 5;
const RESOLUTION_TYPE = 'bug_report_resolution';

function fail(code, message) {
  // Keep the dependency local for the small testable pure helpers in this file.
  // eslint-disable-next-line global-require
  const { HttpsError } = require('firebase-functions/v2/https');
  throw new HttpsError(code, message);
}

function administrator(data = {}) {
  return ['admin', 'superadmin'].includes(String(data.app_role || '').toLowerCase());
}

function cleanText(value, field, { required = false, max = 3000 } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (required && !text) fail('invalid-argument', `${field} est requis.`);
  if (text.length > max) fail('invalid-argument', `${field} est trop long.`);
  return text;
}

function safeId(value, field) {
  const id = String(value || '');
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) fail('invalid-argument', `${field} invalide.`);
  return id;
}

function feedbackScreenshotPath(clubId, reportId, feedbackId, index) {
  return `clubs/${clubId}/bug_reports/${reportId}/resolution_feedback/${feedbackId}/screenshot_${index}.png`;
}

function validFeedbackScreenshots({ clubId, reportId, feedbackId, screenshots }) {
  if (!Array.isArray(screenshots) || screenshots.length > MAX_SCREENSHOTS) {
    fail('invalid-argument', `Au plus ${MAX_SCREENSHOTS} captures sont autorisées.`);
  }
  return screenshots.map((raw, index) => {
    if (!raw || typeof raw !== 'object') fail('invalid-argument', 'Capture invalide.');
    const storagePath = String(raw.storagePath || '');
    if (storagePath !== feedbackScreenshotPath(clubId, reportId, feedbackId, index)) {
      fail('invalid-argument', 'Chemin de capture invalide.');
    }
    const url = String(raw.url || '');
    if (!url.startsWith('https://firebasestorage.googleapis.com/')
      || !url.includes(encodeURIComponent(storagePath))) {
      fail('invalid-argument', 'URL de capture invalide.');
    }
    return { storagePath, url, storageIndex: index };
  });
}

async function resolutionFeedbackEnabled(db, clubId) {
  const flags = await db.doc(`clubs/${clubId}/settings/feature_flags`).get();
  // Fail closed: this intentionally makes a deployment inert until an
  // administrator explicitly enables the DEV/published-release gate.
  return flags.exists && flags.data()?.bugResolutionFeedbackEnabled === true;
}

async function queueBugResolutionFeedback({ db, messaging, clubId, adminUid, reportId }) {
  if (!await resolutionFeedbackEnabled(db, clubId)) {
    fail('failed-precondition', 'La notification de résolution est désactivée.');
  }
  const club = db.collection('clubs').doc(clubId);
  const [operator, report] = await Promise.all([
    club.collection('members').doc(adminUid).get(), club.collection('bug_reports').doc(reportId).get(),
  ]);
  if (!operator.exists || !isActiveMember(operator.data()) || !administrator(operator.data())) {
    fail('permission-denied', 'Administrateur actif requis.');
  }
  if (!report.exists) fail('not-found', 'Signalement introuvable.');
  const reportData = report.data() || {};
  if (reportData.status !== 'resolu') fail('failed-precondition', 'Le signalement doit être résolu.');
  // An operator must explicitly record public availability before queueing.
  // This prevents a DEV-only fix or an unshipped build from notifying a real
  // reporter, and deliberately provides no historical backfill path.
  if (reportData.public_release_available !== true) {
    fail('failed-precondition', 'La correction n’est pas déclarée disponible publiquement.');
  }
  const reporterId = safeId(reportData.reporter?.uid, 'Rapporteur');
  const feedbackId = `resolution_${reportId}`;
  const feedbackRef = report.ref.collection('resolution_feedback').doc(feedbackId);
  const notificationRef = club.collection('members').doc(reporterId)
    .collection('notifications').doc(`bug_resolution_${reportId}`);
  const reporter = await club.collection('members').doc(reporterId).get();
  if (!reporter.exists || !isActiveMember(reporter.data() || {})) {
    fail('failed-precondition', 'Rapporteur actif requis.');
  }
  const reporterData = reporter.data() || {};
  const name = String(reporterData.firstName || reporterData.prenom || reportData.reporter?.name || '').trim().split(/\s+/)[0];
  const title = cleanText(reportData.title, 'Titre', { required: true, max: 300 });
  await db.runTransaction(async tx => {
    const existing = await tx.get(feedbackRef);
    if (existing.exists) fail('already-exists', 'Cette demande de test existe déjà.');
    tx.create(feedbackRef, {
      kind: RESOLUTION_TYPE,
      status: 'pending',
      report_id: reportId,
      reporter_id: reporterId,
      requested_by: adminUid,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.create(notificationRef, buildBugResolutionHistoryRecord({ reportId, feedbackId, title, reporterFirstName: name }));
  });

  // The durable card is intentionally committed before FCM. A missing token,
  // disabled notifications, or transient APNs failure must never hide the
  // in-app request from the reporter.
  const tokens = Array.isArray(reporterData.fcm_tokens) ? reporterData.fcm_tokens :
    (reporterData.fcm_token ? [reporterData.fcm_token] : []);
  if (!tokens.length || reporterData.notifications_enabled === false) return { queued: true, pushed: false };
  try {
    await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: `Signalement ${title}`,
        body: `Bonjour ${name}, votre signalement est résolu. Pouvez-vous tester et nous dire si tout fonctionne ?`,
      },
      data: { type: RESOLUTION_TYPE, club_id: clubId, report_id: reportId, resolution_feedback_id: feedbackId },
    });
    return { queued: true, pushed: true };
  } catch (error) {
    console.error(`Resolution feedback push failed for ${reporterId}: ${error.message}`);
    return { queued: true, pushed: false };
  }
}

async function respondToBugResolutionFeedback({ db, clubId, reporterId, reportId, feedbackId, outcome, text, screenshots = [] }) {
  if (!await resolutionFeedbackEnabled(db, clubId)) fail('failed-precondition', 'La fonctionnalité est désactivée.');
  safeId(clubId, 'Club'); safeId(reportId, 'Signalement'); safeId(feedbackId, 'Réponse');
  if (!['confirmed', 'reopened'].includes(outcome)) fail('invalid-argument', 'Réponse invalide.');
  const clean = cleanText(text, 'Message', { required: outcome === 'reopened' });
  const club = db.collection('clubs').doc(clubId);
  const reportRef = club.collection('bug_reports').doc(reportId);
  const feedbackRef = reportRef.collection('resolution_feedback').doc(feedbackId);
  const [member, report, feedback] = await Promise.all([
    club.collection('members').doc(reporterId).get(), reportRef.get(), feedbackRef.get(),
  ]);
  if (!member.exists || !isActiveMember(member.data() || {})) fail('permission-denied', 'Membre actif requis.');
  if (!report.exists || report.data()?.reporter?.uid !== reporterId) fail('permission-denied', 'Ce signalement ne vous appartient pas.');
  if (!feedback.exists || feedback.data()?.status !== 'pending' || feedback.data()?.reporter_id !== reporterId) {
    fail('failed-precondition', 'Cette demande n’est plus disponible.');
  }
  const attachments = validFeedbackScreenshots({ clubId, reportId, feedbackId, screenshots });
  const memberData = member.data() || {};
  const authorName = String(memberData.firstName || memberData.prenom || report.data()?.reporter?.name || 'Membre');
  await db.runTransaction(async tx => {
    const fresh = await tx.get(feedbackRef);
    if (!fresh.exists || fresh.data()?.status !== 'pending') fail('aborted', 'Réponse déjà enregistrée.');
    tx.update(feedbackRef, {
      status: outcome,
      text: clean,
      screenshots: attachments,
      responded_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    if (outcome === 'reopened') tx.update(reportRef, {
      status: 'en_cours',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      resolution_feedback: { status: 'reopened', feedback_id: feedbackId, text: clean, screenshot_count: attachments.length },
    });
    else tx.update(reportRef, {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      resolution_feedback: { status: 'confirmed', feedback_id: feedbackId, text: clean, screenshot_count: attachments.length },
    });
    tx.create(reportRef.collection('comments').doc(), {
      kind: outcome === 'reopened' ? 'reporter_reopened' : 'reporter_confirmed',
      authorName,
      authorUid: reporterId,
      text: clean || 'Ça fonctionne',
      screenshots: attachments,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  return { success: true, status: outcome };
}

const queueBugResolutionFeedbackV1 = onCall({ region: REGION, timeoutSeconds: 30 }, async request => {
  if (!request.auth?.uid) fail('unauthenticated', 'Authentification requise.');
  return queueBugResolutionFeedback({ ...request.data, db: admin.firestore(), messaging: admin.messaging(), adminUid: request.auth.uid });
});
const respondToBugResolutionFeedbackV1 = onCall({ region: REGION, timeoutSeconds: 30 }, async request => {
  if (!request.auth?.uid) fail('unauthenticated', 'Authentification requise.');
  return respondToBugResolutionFeedback({ ...request.data, db: admin.firestore(), reporterId: request.auth.uid });
});

module.exports = {
  MAX_SCREENSHOTS, RESOLUTION_TYPE, feedbackScreenshotPath, validFeedbackScreenshots,
  queueBugResolutionFeedback, respondToBugResolutionFeedback,
  queueBugResolutionFeedbackV1, respondToBugResolutionFeedbackV1,
};

/**
 * Cloud Functions for CalyMob (Gen2)
 * Payment management via Noda (Open Banking) and Push Notifications
 */

// Load environment variables from .env file (for local development)
require('dotenv').config();

const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

// Compatibility shim for the firebase-admin v13 modular API: when running
// the local emulator on Node 25 the legacy `admin.firestore.FieldValue`
// accessor isn't auto-attached, breaking every `serverTimestamp()` call.
// Pulling it from the modular entry-point fixes it without changing the
// behaviour on Cloud Functions production runtime (Node 20).
if (!admin.firestore.FieldValue) {
  // eslint-disable-next-line global-require
  admin.firestore.FieldValue = require('firebase-admin/firestore').FieldValue;
}

// =============================================================================
// EPC QR PAYMENT EMAIL (Gen2)
// =============================================================================

// EPC QR code payment email for event registrations
const { sendPaymentQrEmail } = require('./src/payment/sendPaymentQrEmail');
exports.sendPaymentQrEmail = sendPaymentQrEmail;

// Payment reminder — called by CalyCompta to send QR emails + post message in event chat
const { sendPaymentReminder } = require('./src/payment/sendPaymentReminder');
exports.sendPaymentReminder = sendPaymentReminder;

// =============================================================================
// NODA PAYMENT FUNCTIONS (Gen2) - DEPRECATED, kept for backward compatibility
// =============================================================================

// Import Noda payment functions
const { createNodaPayment } = require('./src/payment/createPayment');
const { nodaWebhook } = require('./src/payment/webhook');
const { checkNodaPaymentStatus } = require('./src/payment/checkStatus');

// Export Noda functions
exports.createNodaPayment = createNodaPayment;
exports.nodaWebhook = nodaWebhook;
exports.checkNodaPaymentStatus = checkNodaPaymentStatus;

// =============================================================================
// PUSH NOTIFICATIONS (Gen2)
// =============================================================================

// Push notifications for event messages
const { onNewEventMessage } = require('./src/notifications/onNewEventMessage');
exports.onNewEventMessage = onNewEventMessage;

// NOTE (Fix #8): onEventStatusChange is removed. It attempted to decrement
// per-member unread counts when an event was closed/cancelled, but the client
// already excludes closed events from the count() query driving the badge.
// That made the function both redundant and broken (wrong delta calculation).
// See docs/NOTIFICATIONS_MASTER.md § Fix #8.

// Push notifications for club announcements
const { onNewAnnouncement } = require('./src/notifications/onNewAnnouncement');
exports.onNewAnnouncement = onNewAnnouncement;

// Push notifications for announcement replies
const { onNewAnnouncementReply } = require('./src/notifications/onNewAnnouncementReply');
exports.onNewAnnouncementReply = onNewAnnouncementReply;

// =============================================================================
// EXPENSE EMAIL NOTIFICATIONS (Gen2)
// =============================================================================

// Email notification when expense request is created
const { onExpenseCreated } = require('./src/notifications/onExpenseCreated');
exports.onExpenseCreated = onExpenseCreated;

// Email notification when expense status changes (approved/reimbursed)
const { onExpenseStatusChange } = require('./src/notifications/onExpenseStatusChange');
exports.onExpenseStatusChange = onExpenseStatusChange;

// Keep canonical `expense_claims` in sync with legacy `demandes_remboursement`
// (auto-mirror so reimbursement requests are always visible in the web app)
const { mirrorLegacyExpenseClaim } = require('./src/expenses/mirrorLegacyExpenseClaim');
exports.mirrorLegacyExpenseClaim = mirrorLegacyExpenseClaim;

// Reverse mirror canonical -> legacy (DORMANT: standaard uit via feature-flag,
// pas actief bij de gecoördineerde flip Stap 5b)
const { mirrorCanonicalToLegacy } = require('./src/expenses/mirrorCanonicalToLegacy');
exports.mirrorCanonicalToLegacy = mirrorCanonicalToLegacy;

// Audit trail: logt elke tranche-betaalstatuswijziging van een inschrijving
// (over-afsluit-regressies meteen zichtbaar)
const { onInscriptionPaymentAudit } = require('./src/audit/onInscriptionPaymentAudit');
exports.onInscriptionPaymentAudit = onInscriptionPaymentAudit;

// =============================================================================
// PISCINE SESSION NOTIFICATIONS (Gen2)
// =============================================================================

// Push notifications for new piscine session messages
const { onNewSessionMessage } = require('./src/notifications/onNewSessionMessage');
exports.onNewSessionMessage = onNewSessionMessage;

// Push notifications for new team channel messages
const { onNewTeamMessage } = require('./src/notifications/onNewTeamMessage');
exports.onNewTeamMessage = onNewTeamMessage;

// Daily reminder for upcoming piscine sessions
const { sessionReminder } = require('./src/notifications/sessionReminder');
exports.sessionReminder = sessionReminder;

// Daily payment reminder draft for events 3 days away
const { eventPaymentReminder } = require('./src/notifications/eventPaymentReminder');
exports.eventPaymentReminder = eventPaymentReminder;

// Live refresh of payment_reminder draft when an inscription changes
// (created / paid / unpaid / deleted). Keeps the CalyCompta banner up to date
// in real time, without waiting for the daily 08:30 run.
const { onInscriptionPaymentChange } = require('./src/notifications/onInscriptionPaymentChange');
exports.onInscriptionPaymentChange = onInscriptionPaymentChange;

// Auto-mark a member as present on a paid dive event (event_category === 'plongee').
// Fires when `paye` flips falsy → true on the inscription. Refunds are NOT auto-reverted.
const { onInscriptionPaidMarkPresent } = require('./src/notifications/onInscriptionPaidMarkPresent');
exports.onInscriptionPaidMarkPresent = onInscriptionPaidMarkPresent;

// Weekly cleanup for old chat messages and orphaned attachments
const { cleanupOldMessages } = require('./src/maintenance/cleanupOldMessages');
exports.cleanupOldMessages = cleanupOldMessages;

// Push notification when a new outdoor event/dive is created
const { onNewOperation } = require('./src/notifications/onNewOperation');
exports.onNewOperation = onNewOperation;

// Push notification when a member self-declares a LIFRAS exercise from CalyMob
// NOTE 2026-04-30: realtime push DISABLED via kill switch inside the function —
// it spammed encadrants. Replaced by `dailyExerciseDeclarationDigest` below.
const { onExerciceDeclared } = require('./src/notifications/onExerciceDeclared');
exports.onExerciceDeclared = onExerciceDeclared;

// Daily 19:00 Europe/Brussels digest of pending self-declared LIFRAS exercises
const {
  dailyExerciseDeclarationDigest,
} = require('./src/notifications/dailyExerciseDeclarationDigest');
exports.dailyExerciseDeclarationDigest = dailyExerciseDeclarationDigest;

// Push notification when a member is assigned to a pool session task
const { onPiscineTaskAssigned } = require('./src/notifications/onPiscineTaskAssigned');
exports.onPiscineTaskAssigned = onPiscineTaskAssigned;

// =============================================================================
// MEDICAL CERTIFICATE NOTIFICATIONS (Gen2)
// =============================================================================

// Push notification when medical certificate status changes (approved/rejected)
const { onMedicalCertStatusChange, onMedicalCertCreated } = require('./src/notifications/onMedicalCertStatusChange');
exports.onMedicalCertStatusChange = onMedicalCertStatusChange;
exports.onMedicalCertCreated = onMedicalCertCreated;

// =============================================================================
// BUG REPORT → LINEAR SYNC (Gen2)
// =============================================================================

// Sync new bug reports to Linear as issues
const { onNewBugReport } = require('./src/integrations/onBugReportCreated');
exports.onNewBugReport = onNewBugReport;

// =============================================================================
// CARNET DE FORMATION — PROGRESSION (Gen2)
// =============================================================================

// Auto-validate LIFRAS exercise when observation result is 'acquis'
const { onObservationAcquis } = require('./src/progression/onObservationAcquis');
exports.onObservationAcquis = onObservationAcquis;

// WP-08 — journalise chaque changement de plongeur_code dans brevet_history.
const { onPlongeurCodeChanged } = require('./src/progression/onPlongeurCodeChanged');
exports.onPlongeurCodeChanged = onPlongeurCodeChanged;

// WP-09 — snapshot de formation matérialisé (members/{id}/formation_snapshot/current).
// 5 triggers minces + cron de rattrapage 04:00 → rebuildSnapshot.
const snapshotFns = require('./src/progression/rebuildFormationSnapshot');
exports.onLogbookEntryWriteSnapshot = snapshotFns.onLogbookEntryWriteSnapshot;
exports.onExerciseClaimWriteSnapshot = snapshotFns.onExerciseClaimWriteSnapshot;
exports.onMemberObservationWriteSnapshot = snapshotFns.onMemberObservationWriteSnapshot;
exports.onExercicesValidesWriteSnapshot = snapshotFns.onExercicesValidesWriteSnapshot;
exports.onFormationGoalsWriteSnapshot = snapshotFns.onFormationGoalsWriteSnapshot;
exports.onMemberFormationFieldsWriteSnapshot = snapshotFns.onMemberFormationFieldsWriteSnapshot;
exports.rebuildStaleSnapshots = snapshotFns.rebuildStaleSnapshots;

// WP-11 — notifie le chef d'école quand un élève change son brevet visé (D12).
const { onTargetLevelChanged } = require('./src/progression/onTargetLevelChanged');
exports.onTargetLevelChanged = onTargetLevelChanged;

// WP-26 MS-A — surveillance hebdomadaire du MIL (mil.amb-lifras.be) + run manuel.
const milSync = require('./src/mil_sync/milSync');
exports.milSyncWeekly = milSync.milSyncWeekly;
exports.runMilSyncNow = milSync.runMilSyncNow;
exports.reviewMilProposal = milSync.reviewMilProposal;
exports.milImpactPreview = milSync.milImpactPreview;

// =============================================================================
// INSCRIPTION REFUND (Gen2)
// =============================================================================

// Creates a demande de remboursement when a member reduces their inscription
exports.createInscriptionRefund = require('./src/inscription/createRefundClaim').createInscriptionRefund;

// =============================================================================
// BOUTIQUE (Gen2)
// =============================================================================

const { createBoutiqueOrder } = require('./src/boutique/createOrder');
exports.createBoutiqueOrder = createBoutiqueOrder;

const { sendBoutiqueOrderPaymentEmail } = require('./src/boutique/createOrder');
exports.sendBoutiqueOrderPaymentEmail = sendBoutiqueOrderPaymentEmail;

const { listBoutiqueOrders } = require('./src/boutique/listOrders');
exports.listBoutiqueOrders = listBoutiqueOrders;

const { cancelBoutiqueOrder } = require('./src/boutique/cancelOrder');
exports.cancelBoutiqueOrder = cancelBoutiqueOrder;

const { expireBoutiqueOrders } = require('./src/boutique/expireOrders');
exports.expireBoutiqueOrders = expireBoutiqueOrders;

const { createCotisationPayment } = require('./src/cotisations/createPayment');
exports.createCotisationPayment = createCotisationPayment;

// =============================================================================
// CARNET DE FORMATION — Phase 1 (Gen2)
// =============================================================================
// Spec : `CARNET_DE_FORMATION_TECH.md` v2.1
//
// Three Cloud Functions handle the inbox lifecycle for the Carnet de Formation :
//   - onPiscineAttendeeCreated  : creates a pool_checkin task when an entry
//                                 scan writes to piscine_sessions/{}/attendees
//   - onOperationFinished       : creates logbook_completion tasks when a
//                                 dive operation status moves to "terminée"
//   - processFormationTaskReminders : scheduled every 4h, sends at most ONE
//                                 push per member per day across all open tasks
//
// All three respect the formation_active filter on member documents — free
// swimmers receive no tasks and no pushes.
// =============================================================================

const { onPiscineAttendeeCreated } = require('./src/training/onPiscineAttendeeCreated');
exports.onPiscineAttendeeCreated = onPiscineAttendeeCreated;

const { onOperationFinished } = require('./src/training/onOperationFinished');
exports.onOperationFinished = onOperationFinished;

const { processFormationTaskReminders } = require('./src/training/processFormationTaskReminders');
exports.processFormationTaskReminders = processFormationTaskReminders;

// WP-14 filet 7 jours : tâche exercise_claim classique pour les drafts oubliés
const { processStaleDraftClaims } = require('./src/training/processStaleDraftClaims');
exports.processStaleDraftClaims = processStaleDraftClaims;

// Phase 2 — Claim → official observation promotion
const { onClaimAccepted } = require('./src/training/onClaimAccepted');
exports.onClaimAccepted = onClaimAccepted;

// 2026-05-14 — Audit blocker #1 + #4: spawn a formation_task on every new
// reviewable exercise_claim so monitors / admins actually see the claim in
// their inbox. Reads validation_mode + tries claim.monitor_id, club settings,
// palanquée chef, club admin pool in order.
const { onClaimSubmitted } = require('./src/training/onClaimSubmitted');
exports.onClaimSubmitted = onClaimSubmitted;

// WP-02 (chaîne de refus S1) — un refus n'est plus silencieux : onClaimRejected
// crée une tâche 'claim_rejected' chez l'élève (raison + push immédiat) et
// résout la tâche de validation parente ; onClaimResubmitted recrée une tâche
// de validation quand l'élève re-soumet (rejected → submitted), car
// onClaimSubmitted est create-only.
const { onClaimRejected } = require('./src/training/onClaimRejected');
exports.onClaimRejected = onClaimRejected;
const { onClaimResubmitted } = require('./src/training/onClaimResubmitted');
exports.onClaimResubmitted = onClaimResubmitted;

// WP-05 complément — maintient une tâche buddy_confirmation agrégée par membre
// (ouverte tant qu'il reste des logbook_dive_confirmations pending, done à 0).
const { onBuddyConfirmationTask } = require('./src/training/onBuddyConfirmationTask');
exports.onBuddyConfirmationTask = onBuddyConfirmationTask;

// 2026-05-14 — Audit blocker #2: materialise the verdict written by
// MonitorObservationForm into a permanent member_observations doc. Today
// this captures a theme-level verdict (acquis/en_progres/a_revoir); the
// per-LIFRAS-code fan-out into exercices_valides waits on the form being
// extended to capture per-code ticks.
const {
  onMonitorObservationCompleted,
} = require('./src/training/onMonitorObservationCompleted');
exports.onMonitorObservationCompleted = onMonitorObservationCompleted;

// Phase 4 — Palanquée planning → draft exercise_claims pre-fill
const {
  onPalanqueeSaved,
  onOperationPalanqueeSaved,
} = require('./src/training/onPalanqueeSaved');
exports.onPalanqueeSaved = onPalanqueeSaved;
exports.onOperationPalanqueeSaved = onOperationPalanqueeSaved;

// Phase A (v2.2) — Pool check-in completion propagation:
// when a student submits the pool check-in task, mirror the chosen
// group / outcome onto the attendee document so SessionParticipantsTab
// can render the review view.
const { onPoolCheckinCompleted } = require('./src/training/onPoolCheckinCompleted');
exports.onPoolCheckinCompleted = onPoolCheckinCompleted;

// Phase A (v2.2) — Pool session close fan-out:
// when the chef d'école closes a session, batch-create logbook entries
// + monitor_observation tasks for each training attendee. Honour the
// DRY_RUN_POOL_CLOSE env flag during initial rollout.
const { onPoolSessionClosed } = require('./src/training/onPoolSessionClosed');
exports.onPoolSessionClosed = onPoolSessionClosed;

// Phase A (v2.2) — Daily auto-close of stale pool sessions.
// The "chef d'école closes the session" rule was removed from the design
// after pilot 2026-05-14 — closes are now automatic at 04:00 Europe/Brussels
// for any open session whose date is >18h in the past. The close itself
// fires onPoolSessionClosed, which fans out logbook + monitor_observation.
const { autoClosePoolSessions } = require('./src/training/autoClosePoolSessions');
exports.autoClosePoolSessions = autoClosePoolSessions;

// Phase A follow-up (2026-05-14) — Re-route the open monitor_observation
// task when a student corrects the pool entry group_level / group_number
// from their carnet. Keeps the task in sync with whoever validates the
// newly chosen group.
const {
  onLogbookEntryGroupChanged,
} = require('./src/training/onLogbookEntryGroupChanged');
exports.onLogbookEntryGroupChanged = onLogbookEntryGroupChanged;

// 2026-05-14 — Auto-assign unique per-member dive numbers.
// `assignDiveNumber` runs on every new student_logbook_entries doc and
// pulls the next available number from an atomic counter in the member's
// settings. `backfillMyDiveNumbers` is a callable Mon Carnet invokes the
// first time it loads, to retroactively number any legacy entries that
// were created before the trigger shipped.
const {
  assignDiveNumber,
  backfillMyDiveNumbers,
} = require('./src/training/assignDiveNumber');
exports.assignDiveNumber = assignDiveNumber;
exports.backfillMyDiveNumbers = backfillMyDiveNumbers;

// Buddy confirmation flow for Mon Carnet: when a diver adds Calypso members as
// binômes, those members confirm the shared dive and copy/compare it.
const {
  onLogbookDiveBuddiesChanged,
  respondToLogbookDiveConfirmation,
} = require('./src/training/logbookDiveConfirmations');
exports.onLogbookDiveBuddiesChanged = onLogbookDiveBuddiesChanged;
exports.respondToLogbookDiveConfirmation = respondToLogbookDiveConfirmation;

// Paper logbook OCR/AI import.
const { analyzeLogbookPage } = require('./src/logbookOcr/analyzeLogbookPage');
exports.analyzeLogbookPage = analyzeLogbookPage;

// Free dictation AI extraction for new logbook entries.
const {
  analyzeLogbookDictation,
} = require('./src/logbookDictation/analyzeLogbookDictation');
exports.analyzeLogbookDictation = analyzeLogbookDictation;

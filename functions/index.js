/**
 * Cloud Functions for CalyMob (Gen2)
 * Payment management via Noda (Open Banking) and Push Notifications
 */

// A Cloud Run instance serves one entry point. Firebase discovery and the
// emulator's shared debug process need the complete set of functions.
const target = process.env.FUNCTION_DEBUG_MODE ? undefined : process.env.FUNCTION_TARGET;

// Load environment variables from .env file (for local development)
require('dotenv').config();

const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

// Compatibility shim for the firebase-admin v13 modular API: when running
// the local emulator on Node 25 the legacy `admin.firestore.FieldValue`
// accessor isn't auto-attached, breaking every `serverTimestamp()` call.
// Pulling it from the modular entry-point fixes it without changing the
// behaviour on Cloud Functions production runtime (Node 22).
if (!admin.firestore.FieldValue) {
  // eslint-disable-next-line global-require
  admin.firestore.FieldValue = require('firebase-admin/firestore').FieldValue;
}

function exportFunctions(loadModule, ...names) {
  if (target && !names.includes(target)) return;

  const functions = loadModule();
  for (const name of target ? [target] : names) {
    exports[name] = functions[name];
  }
}

// =============================================================================
// EPC QR PAYMENT EMAIL (Gen2)
// =============================================================================

// EPC QR code payment email for event registrations
exportFunctions(() => require('./src/payment/sendPaymentQrEmail'), 'sendPaymentQrEmail');

// Material-loan cautions have their own callable contract. They never reuse
// event registrations, event templates or event bank-matching state.
exportFunctions(
  () => require('./src/payment/materialLoanPayment'),
  'getMaterialLoanPaymentQr',
  'sendMaterialLoanPaymentQrEmail',
);

exportFunctions(
  () => require('./src/loans/sendMaterialLoanHandoverReceipt'),
  'sendMaterialLoanHandoverReceipt',
);

// M1: Daily overdue transition — marks active loans past their return date as en_retard.
exportFunctions(() => require('./src/loans/materialLoanOverdueTransition'), 'materialLoanOverdueTransition');

// M3: Pending reservation expiry — cancels stale attente_caution loans after a configurable timeout.
exportFunctions(() => require('./src/loans/materialLoanPendingExpiry'), 'materialLoanPendingExpiry');

// Payment reminder — called by CalyCompta to send QR emails + post message in event chat
exportFunctions(() => require('./src/payment/sendPaymentReminder'), 'sendPaymentReminder');

// Server-authoritative on-site QR confirmation. The mobile client may request
// this action but may not write accounting fields directly.
exportFunctions(() => require('./src/payment/recordOnSitePayment'), 'recordOnSitePayment');
exportFunctions(() => require('./src/payment/recordPaymentCommunication'), 'recordPaymentCommunication');
exportFunctions(() => require('./src/payment/recordInstallmentPayment'), 'recordInstallmentPayment');

// =============================================================================
// NODA PAYMENT FUNCTIONS (Gen2) - DEPRECATED, kept for backward compatibility
// =============================================================================

exportFunctions(() => require('./src/payment/createPayment'), 'createNodaPayment');
exportFunctions(() => require('./src/payment/webhook'), 'nodaWebhook');
exportFunctions(() => require('./src/payment/checkStatus'), 'checkNodaPaymentStatus');

// =============================================================================
// PUSH NOTIFICATIONS (Gen2)
// =============================================================================

// Push notifications for event messages
exportFunctions(() => require('./src/notifications/onNewEventMessage'), 'onNewEventMessage');

// NOTE (Fix #8): onEventStatusChange is removed. It attempted to decrement
// per-member unread counts when an event was closed/cancelled, but the client
// already excludes closed events from the count() query driving the badge.
// That made the function both redundant and broken (wrong delta calculation).
// See docs/NOTIFICATIONS_MASTER.md § Fix #8.

// Push notifications for club announcements
exportFunctions(() => require('./src/notifications/onNewAnnouncement'), 'onNewAnnouncement');

// Daily 07:00 birthday push, only when one or more active members celebrate.
exportFunctions(() => require('./src/notifications/birthdayNotification'), 'birthdayNotification');

// Push notifications for announcement replies
exportFunctions(() => require('./src/notifications/onNewAnnouncementReply'), 'onNewAnnouncementReply');
exportFunctions(
  () => require('./src/notifications/onAnnouncementReplyDeleted'),
  'onAnnouncementReplyDeleted',
);
exportFunctions(
  () => require('./src/notifications/onReadStateWritten'),
  'onReadStateWritten',
  'onReadStateScopeWritten',
);
exportFunctions(() => require('./src/notifications/bootstrapUnreadCursor'), 'bootstrapUnreadCursorV1');
exportFunctions(
  () => require('./src/notifications/acknowledgeVisibleUnreadCursor'),
  'acknowledgeVisibleUnreadCursorV1',
);
exportFunctions(() => require('./src/notifications/announcementFieldMaintenance'), 'onAnnouncementWritten');

// =============================================================================
// EXPENSE EMAIL NOTIFICATIONS (Gen2)
// =============================================================================

// Email notification when expense request is created
exportFunctions(() => require('./src/notifications/onExpenseCreated'), 'onExpenseCreated');

// Email notification when expense status changes (approved/reimbursed)
exportFunctions(() => require('./src/notifications/onExpenseStatusChange'), 'onExpenseStatusChange');

// Keep canonical `expense_claims` in sync with legacy `demandes_remboursement`
// (auto-mirror so reimbursement requests are always visible in the web app)
exportFunctions(() => require('./src/expenses/mirrorLegacyExpenseClaim'), 'mirrorLegacyExpenseClaim');

// Reverse mirror canonical -> legacy (DORMANT: standaard uit via feature-flag,
// pas actief bij de gecoördineerde flip Stap 5b)
exportFunctions(() => require('./src/expenses/mirrorCanonicalToLegacy'), 'mirrorCanonicalToLegacy');

// Audit trail: logt elke tranche-betaalstatuswijziging van een inschrijving
// (over-afsluit-regressies meteen zichtbaar)
exportFunctions(() => require('./src/audit/onInscriptionPaymentAudit'), 'onInscriptionPaymentAudit');

// COM-062: registratielog — logged registered/unregistered/updated per inscription,
// visible only in CalyCompta (append-only inscription_logs subcollection).
exportFunctions(() => require('./src/audit/onInscriptionChangeAudit'), 'onInscriptionChangeAudit');

// =============================================================================
// PISCINE SESSION NOTIFICATIONS (Gen2)
// =============================================================================

// Push notifications for new piscine session messages
exportFunctions(() => require('./src/notifications/onNewSessionMessage'), 'onNewSessionMessage');
exportFunctions(
  () => require('./src/notifications/onPiscineSessionChatAclWritten'),
  'onPiscineSessionChatAclWritten',
);
exportFunctions(
  () => require('./src/notifications/unreadTimestampReconciliationTriggers'),
  'onAnnouncementUnreadTimestampCreated',
  'onAnnouncementReplyUnreadTimestampCreated',
  'onEventMessageUnreadTimestampCreated',
  'onTeamMessageUnreadTimestampCreated',
  'onSessionMessageUnreadTimestampCreated',
);
exportFunctions(
  () => require('./src/notifications/ensurePiscineSessionChatAcl'),
  'ensurePiscineSessionChatAcl',
);

// Push notifications for new team channel messages
exportFunctions(() => require('./src/notifications/onNewTeamMessage'), 'onNewTeamMessage');

// Daily reminder for upcoming piscine sessions
exportFunctions(() => require('./src/notifications/sessionReminder'), 'sessionReminder');

// Daily payment reminder draft for events 3 days away
exportFunctions(() => require('./src/notifications/eventPaymentReminder'), 'eventPaymentReminder');

// Live refresh of payment_reminder draft when an inscription changes
// (created / paid / unpaid / deleted). Keeps the CalyCompta banner up to date
// in real time, without waiting for the daily 08:30 run.
exportFunctions(
  () => require('./src/notifications/onInscriptionPaymentChange'),
  'onInscriptionPaymentChange',
);

// Auto-mark a member as present on a paid dive event (event_category === 'plongee').
// Fires when `paye` flips falsy → true on the inscription. Refunds are NOT auto-reverted.
exportFunctions(
  () => require('./src/notifications/onInscriptionPaidMarkPresent'),
  'onInscriptionPaidMarkPresent',
);

// Weekly cleanup for old chat messages and orphaned attachments
exportFunctions(() => require('./src/maintenance/cleanupOldMessages'), 'cleanupOldMessages');

// Push notification when a new outdoor event/dive is created
exportFunctions(() => require('./src/notifications/onNewOperation'), 'onNewOperation');

// Push notification when a member self-declares a LIFRAS exercise from CalyMob
// NOTE 2026-04-30: realtime push DISABLED via kill switch inside the function —
// it spammed encadrants. Replaced by `dailyExerciseDeclarationDigest` below.
exportFunctions(() => require('./src/notifications/onExerciceDeclared'), 'onExerciceDeclared');

// Daily 19:00 Europe/Brussels digest of pending self-declared LIFRAS exercises
exportFunctions(
  () => require('./src/notifications/dailyExerciseDeclarationDigest'),
  'dailyExerciseDeclarationDigest',
);

// Push notification when a member is assigned to a pool session task
exportFunctions(() => require('./src/notifications/onPiscineTaskAssigned'), 'onPiscineTaskAssigned');

// =============================================================================
// MEDICAL CERTIFICATE NOTIFICATIONS (Gen2)
// =============================================================================

exportFunctions(() => require('./src/medical/getMedicalCertificateUrl'), 'getMedicalCertificateUrl');

// Push notification when medical certificate status changes (approved/rejected)
exportFunctions(
  () => require('./src/notifications/onMedicalCertStatusChange'),
  'onMedicalCertStatusChange',
  'onMedicalCertCreated',
);

// =============================================================================
// CARNET DE FORMATION — PROGRESSION (Gen2)
// =============================================================================

// Auto-validate LIFRAS exercise when observation result is 'acquis'
exportFunctions(() => require('./src/progression/onObservationAcquis'), 'onObservationAcquis');

// WP-08 — journalise chaque changement de plongeur_code dans brevet_history.
exportFunctions(() => require('./src/progression/onPlongeurCodeChanged'), 'onPlongeurCodeChanged');

// WP-09 — snapshot de formation matérialisé (members/{id}/formation_snapshot/current).
// 5 triggers minces + cron de rattrapage 04:00 → rebuildSnapshot.
exportFunctions(
  () => require('./src/progression/rebuildFormationSnapshot'),
  'onLogbookEntryWriteSnapshot',
  'onExerciseClaimWriteSnapshot',
  'onMemberObservationWriteSnapshot',
  'onExercicesValidesWriteSnapshot',
  'onFormationGoalsWriteSnapshot',
  'onMemberFormationFieldsWriteSnapshot',
  'rebuildStaleSnapshots',
);

// WP-11 — notifie le chef d'école quand un élève change son brevet visé (D12).
exportFunctions(() => require('./src/progression/onTargetLevelChanged'), 'onTargetLevelChanged');

// WP-26 MS-A — surveillance hebdomadaire du MIL (mil.amb-lifras.be) + run manuel.
exportFunctions(
  () => require('./src/mil_sync/milSync'),
  'milSyncWeekly',
  'runMilSyncNow',
  'reviewMilProposal',
  'milImpactPreview',
);

// =============================================================================
// INSCRIPTION REFUND (Gen2)
// =============================================================================

// Creates a demande de remboursement when a member reduces their inscription
exportFunctions(() => require('./src/inscription/createRefundClaim'), 'createInscriptionRefund');

// Transactional event waitlist lifecycle (join, leave, organizer promotion).
exportFunctions(
  () => require('./src/inscription/eventWaitlist'),
  'joinEventWaitlist',
  'registerForEvent',
  'addGuestToEvent',
  'leaveEventWaitlist',
  'unregisterFromEvent',
  'promoteEventWaitlistEntry',
);
exportFunctions(
  () => require('./src/inscription/onEventTariffConfigurationWritten'),
  'onEventTariffConfigurationWritten',
);

// =============================================================================
// BOUTIQUE (Gen2)
// =============================================================================

exportFunctions(
  () => require('./src/boutique/createOrder'),
  'createBoutiqueOrder',
  'sendBoutiqueOrderPaymentEmail',
);
exportFunctions(() => require('./src/boutique/getOrderPayment'), 'getBoutiqueOrderPayment');

exportFunctions(() => require('./src/boutique/listOrders'), 'listBoutiqueOrders');

exportFunctions(() => require('./src/boutique/cancelOrder'), 'cancelBoutiqueOrder');

exportFunctions(() => require('./src/boutique/expireOrders'), 'expireBoutiqueOrders');

exportFunctions(() => require('./src/boutique/setGlobalAccess'), 'setBoutiqueGlobalAccess');

exportFunctions(() => require('./src/cotisations/createPayment'), 'createCotisationPayment');

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

exportFunctions(() => require('./src/training/onPiscineAttendeeCreated'), 'onPiscineAttendeeCreated');

exportFunctions(() => require('./src/training/onOperationFinished'), 'onOperationFinished');

exportFunctions(
  () => require('./src/training/onMemberCarnetPreferenceChanged'),
  'onMemberCarnetPreferenceChanged',
);

// Privacy-safe projections consumed by member-facing directory and
// authorised operational status screens.
exportFunctions(() => require('./src/privacy/syncMemberProjections'), 'syncMemberProjections');

exportFunctions(() => require('./src/privacy/updateBirthdaySharing'), 'updateBirthdaySharing');

exportFunctions(
  () => require('./src/training/processFormationTaskReminders'),
  'processFormationTaskReminders',
);

// WP-14 filet 7 jours : tâche exercise_claim classique pour les drafts oubliés
exportFunctions(() => require('./src/training/processStaleDraftClaims'), 'processStaleDraftClaims');

// Phase 2 — Claim → official observation promotion
exportFunctions(() => require('./src/training/onClaimAccepted'), 'onClaimAccepted');

// 2026-05-14 — Audit blocker #1 + #4: spawn a formation_task on every new
// reviewable exercise_claim so monitors / admins actually see the claim in
// their inbox. Reads validation_mode + tries claim.monitor_id, club settings,
// palanquée chef, club admin pool in order.
exportFunctions(() => require('./src/training/onClaimSubmitted'), 'onClaimSubmitted');

// COM-084 — student-selected evaluation request and durable monitor decision.
// Both callables validate ownership and monitor eligibility server-side.
exportFunctions(
  () => require('./src/training/evaluationRequests'),
  'requestExerciseEvaluation',
  'decideExerciseEvaluation',
);

// WP-02 (chaîne de refus S1) — un refus n'est plus silencieux : onClaimRejected
// crée une tâche 'claim_rejected' chez l'élève (raison + push immédiat) et
// résout la tâche de validation parente ; onClaimResubmitted recrée une tâche
// de validation quand l'élève re-soumet (rejected → submitted), car
// onClaimSubmitted est create-only.
exportFunctions(() => require('./src/training/onClaimRejected'), 'onClaimRejected');
exportFunctions(() => require('./src/training/onClaimResubmitted'), 'onClaimResubmitted');

// WP-05 complément — maintient une tâche buddy_confirmation agrégée par membre
// (ouverte tant qu'il reste des logbook_dive_confirmations pending, done à 0).
exportFunctions(() => require('./src/training/onBuddyConfirmationTask'), 'onBuddyConfirmationTask');

// 2026-05-14 — Audit blocker #2: materialise the verdict written by
// MonitorObservationForm into a permanent member_observations doc. Today
// this captures a theme-level verdict (acquis/en_progres/a_revoir); the
// per-LIFRAS-code fan-out into exercices_valides waits on the form being
// extended to capture per-code ticks.
exportFunctions(
  () => require('./src/training/onMonitorObservationCompleted'),
  'onMonitorObservationCompleted',
);

// Phase 4 — Palanquée planning → draft exercise_claims pre-fill
exportFunctions(
  () => require('./src/training/onPalanqueeSaved'),
  'onPalanqueeSaved',
  'onOperationPalanqueeSaved',
);

// Phase A (v2.2) — Pool check-in completion propagation:
// when a student submits the pool check-in task, mirror the chosen
// group / outcome onto the attendee document so SessionParticipantsTab
// can render the review view.
exportFunctions(() => require('./src/training/onPoolCheckinCompleted'), 'onPoolCheckinCompleted');

// Phase A (v2.2) — Pool session close fan-out:
// when the chef d'école closes a session, batch-create logbook entries
// + monitor_observation tasks for each training attendee. Honour the
// DRY_RUN_POOL_CLOSE env flag during initial rollout.
exportFunctions(() => require('./src/training/onPoolSessionClosed'), 'onPoolSessionClosed');

// Phase A (v2.2) — Daily auto-close of stale pool sessions.
// The "chef d'école closes the session" rule was removed from the design
// after pilot 2026-05-14 — closes are now automatic at 04:00 Europe/Brussels
// for any open session whose date is >18h in the past. The close itself
// fires onPoolSessionClosed, which fans out logbook + monitor_observation.
exportFunctions(() => require('./src/training/autoClosePoolSessions'), 'autoClosePoolSessions');

// Phase A follow-up (2026-05-14) — Re-route the open monitor_observation
// task when a student corrects the pool entry group_level / group_number
// from their carnet. Keeps the task in sync with whoever validates the
// newly chosen group.
exportFunctions(() => require('./src/training/onLogbookEntryGroupChanged'), 'onLogbookEntryGroupChanged');

// 2026-05-14 — Auto-assign unique per-member dive numbers.
// `assignDiveNumber` runs on every new student_logbook_entries doc and
// pulls the next available number from an atomic counter in the member's
// settings. `backfillMyDiveNumbers` is a callable Mon Carnet invokes the
// first time it loads, to retroactively number any legacy entries that
// were created before the trigger shipped.
exportFunctions(
  () => require('./src/training/assignDiveNumber'),
  'assignDiveNumber',
  'backfillMyDiveNumbers',
);

// Private reference-data lookup used by both CalyMob and CalyCompta.
// It returns only a conservative coordinate match, never the source dataset.
exportFunctions(
  () => require('./src/referenceData/resolveReferenceDiveSiteLocation'),
  'resolveReferenceDiveSiteLocation',
  'confirmReferenceDiveSiteLocation',
  'listReferenceDiveSites',
);
exportFunctions(
  () => require('./src/referenceData/mergeDiveLocations'),
  'previewDiveLocationMerge',
  'mergeDiveLocations',
);
exportFunctions(() => require('./src/referenceData/deleteDiveLocationSafely'), 'deleteDiveLocationSafely');
exportFunctions(
  () => require('./src/referenceData/previewDiveLocationReconciliation'),
  'previewDiveLocationReconciliation',
);
exportFunctions(
  () => require('./src/referenceData/resolveCanonicalDiveLocation'),
  'resolveCanonicalDiveLocation',
);

// Buddy confirmation flow for Mon Carnet: when a diver adds Calypso members as
// binômes, those members confirm the shared dive and copy/compare it.
exportFunctions(
  () => require('./src/training/logbookDiveConfirmations'),
  'onLogbookDiveBuddiesChanged',
  'respondToLogbookDiveConfirmation',
);

// Paper logbook OCR/AI import.
exportFunctions(() => require('./src/logbookOcr/analyzeLogbookPage'), 'analyzeLogbookPage');

// Free dictation AI extraction for new logbook entries.
exportFunctions(() => require('./src/logbookDictation/analyzeLogbookDictation'), 'analyzeLogbookDictation');

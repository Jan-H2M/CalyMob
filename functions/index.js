/**
 * Cloud Functions for CalyMob (Gen2)
 * Payment management via Noda (Open Banking) and Push Notifications
 */

// Load environment variables from .env file (for local development)
require('dotenv').config();

const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

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

// =============================================================================
// BOUTIQUE V2 / LOANS / COTISATIONS (Gen2)
// =============================================================================

// Boutique v2
exports.createOrder = require('./src/boutique/createOrder').createOrder;
exports.markOrderPaidFromBankTx = require('./src/boutique/markOrderPaid').markOrderPaidFromBankTx;
exports.notifySupplier = require('./src/boutique/notifySupplier').notifySupplier;
exports.notifySupplierScheduler = require('./src/boutique/notifySupplier').notifySupplierScheduler;
exports.generateBoutiqueReceipt = require('./src/boutique/generateReceipt').generateBoutiqueReceipt;

// Loans
exports.onLoanCreated = require('./src/loans/onLoanCreated').onLoanCreated;

// Cotisations
exports.createCotisationPayment = require('./src/cotisations/createCotisationPayment').createCotisationPayment;

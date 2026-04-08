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

// Push notification when a new outdoor event/dive is created
const { onNewOperation } = require('./src/notifications/onNewOperation');
exports.onNewOperation = onNewOperation;

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

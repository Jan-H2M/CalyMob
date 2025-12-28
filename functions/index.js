/**
 * Cloud Functions for CalyMob (Gen2)
 * Payment management via Mollie & Noda (Open Banking) and Push Notifications
 */

// Load environment variables from .env file (for local development)
require('dotenv').config();

const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

// =============================================================================
// NODA PAYMENT FUNCTIONS (Gen2)
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
// MOLLIE PAYMENT FUNCTIONS (Gen2)
// =============================================================================

// Import Mollie payment functions
const { createMolliePayment } = require('./src/payment/createMolliePayment');
const { mollieWebhook } = require('./src/payment/mollieWebhook');
const { checkMolliePaymentStatus } = require('./src/payment/checkMollieStatus');

// Export Mollie functions
exports.createMolliePayment = createMolliePayment;
exports.mollieWebhook = mollieWebhook;
exports.checkMolliePaymentStatus = checkMolliePaymentStatus;

// =============================================================================
// PUSH NOTIFICATIONS (Gen2)
// =============================================================================

// Push notifications for event messages
const { onNewEventMessage } = require('./src/notifications/onNewEventMessage');
exports.onNewEventMessage = onNewEventMessage;

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

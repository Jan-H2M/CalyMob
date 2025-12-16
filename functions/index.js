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

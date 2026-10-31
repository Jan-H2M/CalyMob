'use strict';
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { logger } = require('firebase-functions');
const { sendNotificationsWithBadge } = require('../utils/badge-helper');
const { runMedicalExpiryReminders } = require('./medicalExpiryRunner');

exports.dailyMedicalExpiryReminder = onSchedule({ schedule: '0 10 * * *',
  timeZone: 'Europe/Brussels', region: 'europe-west1', retryCount: 0,
}, async () => {
  const totals = await runMedicalExpiryReminders({ db: admin.firestore(), now: new Date(),
    timestamp: () => admin.firestore.FieldValue.serverTimestamp(), send: sendNotificationsWithBadge });
  logger.info('Medical expiry reminder counts', totals);
  return totals;
});

/**
 * Gedeelde constanten voor Cloud Functions
 */

module.exports = {
  /** Aantal dagen na date_fin waarbinnen event-berichten nog unread counts incrementeren */
  EVENT_EXPIRY_GRACE_DAYS: 5,

  /** Retentieperioden voor chat cleanup */
  TEAM_MESSAGE_RETENTION_DAYS: 365,
  EVENT_MESSAGE_RETENTION_DAYS: 180,
  SESSION_MESSAGE_RETENTION_DAYS: 90,

  /** Maximum aantal operaties per Firestore batch write */
  FIRESTORE_BATCH_LIMIT: 500,
};

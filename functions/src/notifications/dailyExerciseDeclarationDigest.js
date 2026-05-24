/**
 * Cloud Function: Daily digest of pending self-declared LIFRAS exercises.
 *
 * Replaces the realtime push that `onExerciceDeclared.js` used to send on
 * every single declaration (which spammed encadrants — kill-switched on
 * 2026-04-30, see CLAUDE.md).
 *
 * Runs daily at 19:00 Europe/Brussels. For each club, counts how many
 * `exercices_valides` documents are still in `status='pending'` with
 * `declared_by_member=true` (excluding backfill/migration imports), and
 * sends ONE push to every encadrant — only if the count is > 0.
 *
 * Preference key: `notification_preferences.exercise_declarations`
 * (members can opt out from the app's notification settings screen).
 *
 * Uses Firebase Functions v2 API (Gen2).
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const {
  collectTokensAndMembers,
  sendNotificationsWithBadge,
  filterByPreference,
} = require('../utils/badge-helper');

const TIME_ZONE = 'Europe/Brussels';
const DIGEST_LOOKBACK_DAYS = 7;
const DIGEST_LOOKBACK_MS = DIGEST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

/**
 * Normalize LIFRAS roles (mirror of onExerciceDeclared.normalizeRoles).
 */
function normalizeRoles(roles) {
  if (!Array.isArray(roles)) return [];
  return roles
    .filter((r) => typeof r === 'string')
    .map((r) => r.trim().toLowerCase())
    .map((role) => {
      switch (role) {
        case 'e':
        case 'encadrant':
        case 'encadrants':
          return 'encadrant';
        default:
          return role;
      }
    });
}

function memberIsEncadrant(memberData = {}) {
  const appRole = String(memberData.app_role || '').toLowerCase();
  if (appRole === 'admin' || appRole === 'superadmin') return true;
  const normalized = new Set(normalizeRoles(memberData.clubStatuten || []));
  return normalized.has('encadrant');
}

/**
 * A pending declaration document is "real" (= worth notifying about) if it
 * isn't a backfill/migration import. Same heuristics as onExerciceDeclared.
 */
function toDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isRecentEnoughForDigest(data, now = new Date()) {
  const referenceDate =
    toDate(data.created_at) ||
    toDate(data.updated_at) ||
    toDate(data.date_validation);

  if (!referenceDate) return false;
  const ageMs = now.getTime() - referenceDate.getTime();
  return ageMs >= 0 && ageMs <= DIGEST_LOOKBACK_MS;
}

function isRealPendingDeclaration(data, now = new Date()) {
  if (!data) return false;
  if (data.status !== 'pending') return false;
  if (data.declared_by_member !== true) return false;
  if (data.migration_source) return false;
  if (data._backfill === true) return false;
  if (data.source === 'backfill') return false;
  const notes = String(data.notes || '');
  if (notes.includes('Importé depuis')) return false;
  if (!isRecentEnoughForDigest(data, now)) return false;
  return true;
}

async function countPendingForClub(clubRef, membersDocs) {
  let total = 0;
  const now = new Date();
  for (const memberDoc of membersDocs) {
    try {
      const pendingSnap = await memberDoc.ref
        .collection('exercices_valides')
        .where('status', '==', 'pending')
        .where('declared_by_member', '==', true)
        .get();

      for (const doc of pendingSnap.docs) {
        if (isRealPendingDeclaration(doc.data(), now)) {
          total += 1;
        }
      }
    } catch (error) {
      logger.warn(
        `[exerciceDeclarationDigest] count failed for ${clubRef.id}/${memberDoc.id}: ${error.message}`,
      );
    }
  }
  return total;
}

exports.dailyExerciseDeclarationDigest = onSchedule(
  {
    schedule: '0 19 * * *',
    timeZone: TIME_ZONE,
    region: 'europe-west1',
  },
  async () => {
    const startedAt = new Date().toISOString();
    logger.info(`[exerciceDeclarationDigest] starting at ${startedAt}`);

    const db = admin.firestore();
    let clubsProcessed = 0;
    let totalNotificationsSent = 0;

    try {
      const clubsSnap = await db.collection('clubs').get();

      for (const clubDoc of clubsSnap.docs) {
        const clubId = clubDoc.id;

        try {
          const membersSnap = await clubDoc.ref.collection('members').get();
          if (membersSnap.empty) {
            logger.info(`[exerciceDeclarationDigest] club=${clubId}: no members`);
            continue;
          }

          // 1. Count pending declarations across the whole club
          // Only recent pending declarations are included. Older pending
          // items stay visible in the validation screen but no longer create
          // a daily "ghost" push forever.
          const totalPending = await countPendingForClub(
            clubDoc.ref,
            membersSnap.docs,
          );

          if (totalPending === 0) {
            logger.info(
              `[exerciceDeclarationDigest] club=${clubId}: 0 pending — skip push`,
            );
            continue;
          }

          // 2. Find encadrants who have the app installed
          const encadrantDocs = membersSnap.docs.filter((d) => {
            const data = d.data() || {};
            return data.app_installed === true && memberIsEncadrant(data);
          });

          if (encadrantDocs.length === 0) {
            logger.info(
              `[exerciceDeclarationDigest] club=${clubId}: pending=${totalPending} but no encadrants with app installed`,
            );
            continue;
          }

          // 3. Respect notification preferences
          const preferredDocs = filterByPreference(
            encadrantDocs,
            'exercise_declarations',
          );

          if (preferredDocs.length === 0) {
            logger.info(
              `[exerciceDeclarationDigest] club=${clubId}: pending=${totalPending} but all encadrants opted out`,
            );
            continue;
          }

          // 4. Collect tokens (no sender to exclude — this is a digest)
          const { tokens, memberTokenGroups, recipientIds } =
            collectTokensAndMembers(preferredDocs, null);

          if (tokens.length === 0) {
            logger.info(
              `[exerciceDeclarationDigest] club=${clubId}: pending=${totalPending} but no FCM tokens`,
            );
            continue;
          }

          // 5. Build payload (low priority — daily reminder, not realtime)
          const title = `🎓 Déclarations d'exercices à valider`;
          const body =
            totalPending === 1
              ? `1 déclaration en attente de validation`
              : `${totalPending} déclarations en attente de validation`;

          const basePayload = {
            notification: { title, body },
            data: {
              type: 'exercice_digest',
              club_id: clubId,
              pending_count: String(totalPending),
              click_action: 'FLUTTER_NOTIFICATION_CLICK',
            },
            android: {
              priority: 'normal',
              notification: {
                channelId: 'exercise_declarations',
                priority: 'default',
                sound: 'default',
              },
            },
            apns: {
              headers: {
                'apns-priority': '5',
                'apns-expiration': '0',
              },
              payload: {
                aps: {
                  alert: { title, body },
                  sound: 'default',
                },
              },
            },
          };

          // 6. Send (no unread-count increment — digest doesn't bump in-app badge)
          const { successCount, failureCount } =
            await sendNotificationsWithBadge(
              clubId,
              memberTokenGroups,
              basePayload,
              'exercise_declarations',
            );

          totalNotificationsSent += successCount;
          clubsProcessed += 1;

          logger.info(
            `[exerciceDeclarationDigest] club=${clubId} pending=${totalPending} ` +
              `encadrants=${recipientIds.length} sent=${successCount} failed=${failureCount}`,
          );
        } catch (clubError) {
          logger.error(
            `[exerciceDeclarationDigest] club=${clubId} fatal:`,
            clubError,
          );
        }
      }

      logger.info(
        `[exerciceDeclarationDigest] done: ${clubsProcessed} clubs notified, ${totalNotificationsSent} pushes sent`,
      );
    } catch (error) {
      logger.error('[exerciceDeclarationDigest] unrecoverable:', error);
      throw error;
    }
  },
);

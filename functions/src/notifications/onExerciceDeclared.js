/**
 * Cloud Function: Send push notification to encadrants when a member
 * self-declares a LIFRAS exercise from CalyMob (Mockup D flow).
 *
 * Triggers on: clubs/{clubId}/members/{memberId}/exercices_valides/{docId}
 *
 * Only fires when:
 *   - status === 'pending'
 *   - declared_by_member === true
 *   - not a migration/backfill import (see A3 incident 2026-04-17)
 *
 * Target audience: club members with `clubStatuten` containing 'encadrant'
 * (or 'Encadrants' — normalized, same pattern as onNewTeamMessage.js).
 *
 * Uses Firebase Functions v2 API (Gen2).
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const {
  incrementUnreadCounts,
  collectTokensAndMembers,
  sendNotificationsWithBadge,
  filterByPreference,
} = require('../utils/badge-helper');

/**
 * Normalize LIFRAS roles (mirror of onNewTeamMessage.js normalizeRoles).
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

exports.onExerciceDeclared = onDocumentCreated(
  {
    document: 'clubs/{clubId}/members/{memberId}/exercices_valides/{docId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, memberId, docId } = event.params;
    const snap = event.data;
    if (!snap) {
      logger.warn('[onExerciceDeclared] No data in event');
      return null;
    }
    const data = snap.data();

    try {
      // 1. Only fire on pending self-declarations
      const status = data.status;
      const declaredByMember = data.declared_by_member === true;
      if (status !== 'pending' || !declaredByMember) {
        logger.info(
          `[onExerciceDeclared] Skip: status=${status}, declaredByMember=${declaredByMember}`,
        );
        return null;
      }

      // 2. Backfill/migration guard (see A3 incident 2026-04-17)
      const notes = String(data.notes || '');
      if (
        data.migration_source ||
        data._backfill === true ||
        notes.includes('Importé depuis') ||
        data.source === 'backfill'
      ) {
        logger.info(
          `[onExerciceDeclared] Skip push: document looks like a backfill/migration import`,
        );
        return null;
      }

      // Also skip if date_validation is more than 7 days old — those are
      // almost certainly historical imports, not fresh declarations.
      const dateValRaw = data.date_validation;
      const dateValidation = dateValRaw && dateValRaw.toDate
        ? dateValRaw.toDate()
        : dateValRaw;
      const triggerTime = event.time ? new Date(event.time) : new Date();
      if (dateValidation) {
        const diffMs = triggerTime.getTime() - new Date(dateValidation).getTime();
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        if (diffMs > sevenDaysMs) {
          logger.info(
            `[onExerciceDeclared] Skip push: date_validation ${new Date(dateValidation).toISOString()} is >7d before trigger ${triggerTime.toISOString()} (likely historical)`,
          );
          return null;
        }
      }

      const exerciceCode = data.exercice_code || '';
      const exerciceDesc = data.exercice_description || '';
      const exerciceNiveau = data.exercice_niveau || '';

      if (!exerciceCode) {
        logger.warn('[onExerciceDeclared] Missing exercice_code, skipping');
        return null;
      }

      // 3. Resolve the declaring member's display name
      const db = admin.firestore();
      const declaringMemberSnap = await db
        .collection('clubs')
        .doc(clubId)
        .collection('members')
        .doc(memberId)
        .get();

      let memberName = 'Un membre';
      if (declaringMemberSnap.exists) {
        const md = declaringMemberSnap.data() || {};
        const fullName = `${md.prenom || ''} ${md.nom || ''}`.trim();
        memberName = fullName || md.displayName || 'Un membre';
      }

      // 4. Find all encadrants in the club who have the app installed
      const membersSnapshot = await db
        .collection('clubs')
        .doc(clubId)
        .collection('members')
        .where('app_installed', '==', true)
        .get();

      if (membersSnapshot.empty) {
        logger.info('[onExerciceDeclared] No members with app installed');
        return null;
      }

      const encadrantDocs = membersSnapshot.docs.filter((d) => memberIsEncadrant(d.data() || {}));
      if (encadrantDocs.length === 0) {
        logger.info('[onExerciceDeclared] No encadrants found in club');
        return null;
      }

      // 5. Respect notification preferences
      const memberDocs = filterByPreference(encadrantDocs, 'exercise_declarations');

      // Exclude the declaring member themselves (an encadrant who also
      // declares one of their own remaining exercises shouldn't self-notify).
      const { tokens, memberTokenGroups, recipientIds } = collectTokensAndMembers(
        memberDocs,
        memberId,
      );

      if (tokens.length === 0) {
        logger.info('[onExerciceDeclared] No FCM tokens for encadrants');
        return null;
      }

      logger.info(
        `[onExerciceDeclared] Sending to ${tokens.length} devices for ${recipientIds.length} encadrants (exercice=${exerciceCode}, member=${memberId})`,
      );

      // 6. Build the notification payload
      const niveauSuffix = exerciceNiveau ? ` · ${exerciceNiveau.toUpperCase()}` : '';
      const notificationTitle = `🎓 Nouvelle déclaration d'exercice`;
      const shortDesc = exerciceDesc.length > 80
        ? `${exerciceDesc.substring(0, 77)}...`
        : exerciceDesc;
      const notificationBody = shortDesc
        ? `${memberName} · ${exerciceCode}${niveauSuffix} — ${shortDesc}`
        : `${memberName} · ${exerciceCode}${niveauSuffix}`;

      const basePayload = {
        notification: {
          title: notificationTitle,
          body: notificationBody,
        },
        data: {
          type: 'exercice_declared',
          club_id: clubId,
          member_id: memberId,
          exercice_valide_id: docId,
          exercice_code: exerciceCode,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'exercise_declarations',
            priority: 'high',
            sound: 'default',
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
            'apns-expiration': '0',
          },
          payload: {
            aps: {
              alert: {
                title: notificationTitle,
                body: notificationBody,
              },
              sound: 'default',
              'content-available': 1,
            },
          },
        },
      };

      // 7. Bump unread counts + send
      await incrementUnreadCounts(clubId, recipientIds, 'exercise_declarations');

      const { successCount, failureCount } = await sendNotificationsWithBadge(
        clubId,
        memberTokenGroups,
        basePayload,
        'exercise_declarations',
      );

      logger.info(
        `[onExerciceDeclared] Push sent: ${successCount} success, ${failureCount} failures`,
      );
      return { success: successCount, failure: failureCount };
    } catch (error) {
      logger.error('[onExerciceDeclared] Error:', error);
      throw error;
    }
  },
);

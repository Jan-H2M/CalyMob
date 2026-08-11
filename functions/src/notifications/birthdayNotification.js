'use strict';

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { isActiveMember } = require('../utils/memberStatus');
const {
  collectTokensAndMembers,
  sendNotificationsWithBadge,
} = require('../utils/badge-helper');
const { memberFirstName } = require('../utils/memberName');

const TIME_ZONE = 'Europe/Brussels';
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function dateParts(value) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    dateFormatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return { year: parts.year, month: parts.month, day: parts.day };
}

function hasBirthdayToday(data, now = new Date()) {
  const birthDate = data.birth_date || data.date_naissance;
  if (!birthDate) return false;
  const birth = dateParts(birthDate);
  const today = dateParts(now);
  return Boolean(birth && today && birth.month === today.month && birth.day === today.day);
}

function formatNames(names) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} et ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

function buildBirthdayMessage(names) {
  if (names.length === 1) {
    return {
      title: `🎂 Joyeux anniversaire à ${names[0]} !`,
      body: 'Toute la famille Calypso lui souhaite une merveilleuse journée ! 🥳',
    };
  }
  return {
    title: '🎂 Joyeux anniversaire !',
    body: `Aujourd’hui, nous fêtons ${formatNames(names)}. Toute la famille Calypso leur souhaite une merveilleuse journée ! 🥳`,
  };
}

exports.birthdayNotification = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: TIME_ZONE,
    region: 'europe-west1',
  },
  async () => {
    const db = admin.firestore();
    const today = dateParts(new Date());
    const dispatchId = `birthday-${today.year}-${today.month}-${today.day}`;
    const clubs = await db.collection('clubs').get();

    for (const clubDoc of clubs.docs) {
      const members = await clubDoc.ref.collection('members').get();
      const activeMembers = members.docs.filter((doc) => isActiveMember(doc.data()));
      const birthdayMembers = activeMembers.filter((doc) => hasBirthdayToday(doc.data()));

      if (birthdayMembers.length === 0) {
        logger.info(`[birthdayNotification] club=${clubDoc.id}: no birthdays today`);
        continue;
      }

      const dispatchRef = clubDoc.ref.collection('notification_dispatches').doc(dispatchId);
      if ((await dispatchRef.get()).exists) {
        logger.info(`[birthdayNotification] club=${clubDoc.id}: ${dispatchId} already sent`);
        continue;
      }

      const recipients = activeMembers.filter((doc) => doc.data().app_installed === true);
      const { tokens, memberTokenGroups } = collectTokensAndMembers(recipients, null);
      if (tokens.length === 0) {
        logger.info(`[birthdayNotification] club=${clubDoc.id}: birthdays found but no recipients`);
        continue;
      }

      const names = birthdayMembers
        .map((doc) => memberFirstName(doc.data()))
        .filter(Boolean);
      if (names.length === 0) {
        logger.warn(`[birthdayNotification] club=${clubDoc.id}: birthdays found but no first names`);
        continue;
      }

      const { title, body } = buildBirthdayMessage(names);
      const basePayload = {
        notification: { title, body },
        data: {
          type: 'birthday',
          club_id: clubDoc.id,
          notification_date: `${today.year}-${today.month}-${today.day}`,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          priority: 'normal',
          notification: {
            channelId: 'announcements',
            priority: 'default',
            sound: 'default',
            tag: dispatchId,
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
            'apns-collapse-id': dispatchId,
          },
          payload: {
            aps: { sound: 'default' },
          },
        },
      };

      const result = await sendNotificationsWithBadge(
        clubDoc.id,
        memberTokenGroups,
        basePayload,
        'announcements',
      );

      await dispatchRef.set({
        type: 'birthday',
        birthday_member_ids: birthdayMembers.map((doc) => doc.id),
        recipient_count: memberTokenGroups.size,
        success_count: result.successCount,
        failure_count: result.failureCount,
        sent_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      logger.info(
        `[birthdayNotification] club=${clubDoc.id}: sent=${result.successCount}, failed=${result.failureCount}`,
      );
    }
  },
);

exports._test = {
  dateParts,
  isActiveMember,
  hasBirthdayToday,
  formatNames,
  buildBirthdayMessage,
};

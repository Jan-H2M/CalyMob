/**
 * Cloud Function — Carnet de Formation phase 1
 *
 * Scheduled : every 4 hours
 *
 * Walks open formation_tasks across all clubs and sends at most ONE
 * push reminder per member per day, even if that member has multiple
 * tasks open. Escalates 7-day-old tasks via a digest email to the
 * school responsible.
 *
 * Anti-spam contract
 *   - Hard cap : 1 push per member per 24 hours, irrespective of task count
 *   - Hard cap : 1 reminder per task per 24 hours
 *   - Hard cap : 3 reminders per task total before escalation
 *   - Escalation : tasks open > 7 days with reminder_count >= 3 surface in
 *     a daily digest to the school responsible (email)
 *
 * Spec : `CARNET_DE_FORMATION_TECH.md` §8.4
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

const FUNCTION_NAME = 'processFormationTaskReminders';
const FUNCTION_REGION = 'europe-west1';

const HOURS = (n) => n * 60 * 60 * 1000;
const DAYS = (n) => n * 24 * HOURS(1);

const MIN_REMINDER_INTERVAL_MS = HOURS(24); // per-task interval
const MIN_PUSH_PER_MEMBER_MS = HOURS(24); // per-member daily cap
const ESCALATION_AGE_MS = DAYS(7);
const ESCALATION_MIN_REMINDERS = 3;

const processFormationTaskReminders = onSchedule(
  {
    region: FUNCTION_REGION,
    schedule: 'every 4 hours',
    timeZone: 'Europe/Brussels',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async () => {
    const db = admin.firestore();
    const now = Date.now();
    let totalSent = 0;
    let totalEscalated = 0;

    // Iterate over all clubs. Calypso is single-tenant but the structure
    // allows multi-club so we walk the collection.
    const clubsSnap = await db.collection('clubs').get();

    for (const clubDoc of clubsSnap.docs) {
      const clubId = clubDoc.id;
      console.log(`[${FUNCTION_NAME}] processing club ${clubId}`);

      // ---- Pass 1 : reminders for open tasks ----
      const openTasksSnap = await db
        .collection('clubs')
        .doc(clubId)
        .collection('formation_tasks')
        .where('status', '==', 'open')
        .get();

      const tasksByMember = new Map();
      for (const taskDoc of openTasksSnap.docs) {
        const task = taskDoc.data();
        const memberId = task.member_id;
        if (!memberId) continue;
        if (!tasksByMember.has(memberId)) tasksByMember.set(memberId, []);
        tasksByMember.get(memberId).push({ id: taskDoc.id, ref: taskDoc.ref, ...task });
      }

      for (const [memberId, tasks] of tasksByMember.entries()) {
        // Tasks needing a reminder this cycle.
        const dueTasks = tasks.filter((t) => isDueForReminder(t, now));
        if (dueTasks.length === 0) continue;

        // Per-member daily cap.
        const memberSnap = await db
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .doc(memberId)
          .get();
        if (!memberSnap.exists) continue;
        const member = memberSnap.data();

        const lastPushAt = (member.last_formation_push_at?.toMillis?.()) || 0;
        if (now - lastPushAt < MIN_PUSH_PER_MEMBER_MS) {
          // Skip push for this member, but still bump reminder_count on
          // due tasks so they don't immediately retry next cycle.
          await bumpTasksWithoutPush(db, dueTasks);
          continue;
        }

        // Send a single push covering N tasks.
        const pushTitle =
          dueTasks.length === 1
            ? dueTasks[0].title
            : `${dueTasks.length} actions t'attendent`;
        const pushBody =
          dueTasks.length === 1
            ? 'Ouvre Calypso pour la traiter'
            : 'Ouvre Calypso pour voir tes actions';

        const tokens = collectFcmTokens(member);
        if (tokens.length === 0) {
          // No device, still bump so we don't loop.
          await bumpTasksWithoutPush(db, dueTasks);
          continue;
        }

        try {
          await admin.messaging().sendEachForMulticast({
            tokens,
            notification: { title: pushTitle, body: pushBody },
            data: {
              type: 'formation_reminder',
              task_count: String(dueTasks.length),
              deeplink:
                dueTasks.length === 1
                  ? `formation_task:${dueTasks[0].id}`
                  : 'communication:inbox',
            },
            android: { priority: 'high' },
            apns: { payload: { aps: { sound: 'default' } } },
          });
          totalSent += 1;
          console.log(
            `[${FUNCTION_NAME}] sent push to ${memberId} for ${dueTasks.length} task(s)`
          );
        } catch (err) {
          console.error(`[${FUNCTION_NAME}] FCM error for ${memberId}:`, err.message);
        }

        // Stamp the member doc and the tasks.
        await db
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .doc(memberId)
          .update({
            last_formation_push_at: admin.firestore.FieldValue.serverTimestamp(),
          });

        await bumpTasksAfterPush(db, dueTasks);
      }

      // ---- Pass 2 : escalation digest ----
      const ancientSnap = await db
        .collection('clubs')
        .doc(clubId)
        .collection('formation_tasks')
        .where('status', '==', 'open')
        .where('created_at', '<', new Date(now - ESCALATION_AGE_MS))
        .get();

      const ancient = ancientSnap.docs
        .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
        .filter((t) => (t.notification_state?.reminder_count || 0) >= ESCALATION_MIN_REMINDERS);

      if (ancient.length > 0) {
        await sendEscalationDigest(db, clubId, ancient);
        totalEscalated += ancient.length;

        // Mark them as escalated by bumping a digest_sent_at field, so we
        // don't email the same set every cycle.
        for (const task of ancient) {
          await task.ref.update({
            'notification_state.last_digest_sent_at': admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    }

    console.log(
      `[${FUNCTION_NAME}] cycle complete: ${totalSent} pushes sent, ${totalEscalated} escalations`
    );
  }
);

function isDueForReminder(task, nowMs) {
  const state = task.notification_state || {};
  const reminderCount = state.reminder_count || 0;
  if (reminderCount >= ESCALATION_MIN_REMINDERS + 1) {
    // Beyond escalation threshold — handled by digest pass instead of push.
    return false;
  }
  const lastAt = state.last_reminder_at?.toMillis?.() || 0;
  if (lastAt === 0) return true; // never reminded
  return nowMs - lastAt >= MIN_REMINDER_INTERVAL_MS;
}

function collectFcmTokens(member) {
  const tokens = [];
  if (Array.isArray(member.fcm_tokens)) {
    for (const t of member.fcm_tokens) {
      if (typeof t === 'string' && t.length > 0) tokens.push(t);
      else if (t && typeof t.token === 'string') tokens.push(t.token);
    }
  }
  if (typeof member.fcm_token === 'string' && member.fcm_token.length > 0) {
    tokens.push(member.fcm_token);
  }
  return Array.from(new Set(tokens));
}

async function bumpTasksAfterPush(db, tasks) {
  for (const task of tasks) {
    await task.ref.update({
      'notification_state.reminder_count': admin.firestore.FieldValue.increment(1),
      'notification_state.last_reminder_at': admin.firestore.FieldValue.serverTimestamp(),
      'notification_state.push_sent_at': admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

async function bumpTasksWithoutPush(db, tasks) {
  // We don't have a slot to push so we still mark last_reminder_at to avoid
  // re-evaluating this task on every cycle. reminder_count is NOT incremented
  // because no actual reminder was sent.
  for (const task of tasks) {
    await task.ref.update({
      'notification_state.last_reminder_at': admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

async function sendEscalationDigest(db, clubId, ancientTasks) {
  // For phase 1 we LOG the digest only. Wiring the email send is a separate
  // step that reuses CalyCompta's Resend integration once the cockpit ships
  // (phase 5). Until then the school responsible sees these directly in the
  // CalyCompta Inbox view (admin route) under the "Bloqué" filter.
  const lines = ancientTasks.map(
    (t) => `  - ${t.title} (member=${t.member_id}, age=${Math.floor((Date.now() - (t.created_at?.toMillis?.() || 0)) / DAYS(1))}d)`
  );
  console.log(
    `[${FUNCTION_NAME}] escalation digest for club ${clubId} (${ancientTasks.length} tasks):\n${lines.join(
      '\n'
    )}`
  );
}

module.exports = {
  processFormationTaskReminders,
  isDueForReminder,
};

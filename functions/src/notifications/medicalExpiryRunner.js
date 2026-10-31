'use strict';
const { reminderPlan } = require('./medicalExpiryPolicy');
const SELECT = ['member_status', 'actif', 'is_test_account', 'notifications_enabled',
  'notification_preferences', 'has_pending_medical', 'fcm_tokens', 'fcm_token',
  'certificat_medical_date', 'certificat_medical_validite'];

/** No automatic retry after an ambiguous FCM outcome: a consumed claim needs
 * operator inspection, not another push. Never logs member/token/medical data. */
async function dispatchMedicalReminder({ db, memberRef, clubId, now, timestamp, send }) {
  const claim = await db.runTransaction(async tx => {
    const member = await tx.get(memberRef);
    if (!member.exists) return null;
    const plan = reminderPlan(member.data(), now);
    if (!plan) return null;
    const ref = memberRef.collection('medical_reminder_deliveries').doc(plan.key);
    if ((await tx.get(ref)).exists) return null;
    tx.create(ref, { status: 'claimed', band: plan.band, expires_on: plan.expiresOn,
      claimed_at: timestamp() });
    return { plan, ref };
  });
  if (!claim) return 'skipped';
  // Revalidate after the claim in case of renewal, opt-out or account change.
  const member = await memberRef.get();
  const latest = member.exists && reminderPlan(member.data(), now);
  if (!latest || latest.key !== claim.plan.key) {
    await claim.ref.update({ status: 'obsolete', updated_at: timestamp() });
    return 'obsolete';
  }
  try {
    const result = await send(clubId, new Map([[memberRef.id, latest.tokens]]), {
      notification: { title: 'Rappel administratif Calypso',
        body: 'Un document arrive à échéance. Consultez votre profil pour le renouveler.' },
      data: { type: 'medical_certificate', club_id: clubId, member_id: memberRef.id,
        status: 'expiring', click_action: 'FLUTTER_NOTIFICATION_CLICK' },
      android: { notification: { channelId: 'medical_certificates' } },
      apns: { payload: { aps: { sound: 'default' } } },
    }, 'Médical');
    const status = result.successCount > 0 ? 'sent' : 'failed_no_retry';
    await claim.ref.update({ status, updated_at: timestamp() });
    return status;
  } catch (_) {
    await claim.ref.update({ status: 'unknown_no_retry', updated_at: timestamp() });
    return 'unknown_no_retry';
  }
}
async function runMedicalExpiryReminders({ db, now, timestamp, send, pageSize = 200 }) {
  const totals = { checked: 0, sent: 0, skipped: 0, obsolete: 0, failed_no_retry: 0, unknown_no_retry: 0 };
  const clubs = await db.collection('clubs').select().get();
  for (const club of clubs.docs) {
    let cursor;
    while (true) {
      let query = club.ref.collection('members').orderBy('__name__').limit(pageSize).select(...SELECT);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      for (const member of page.docs) {
        totals.checked++;
        if (!reminderPlan(member.data(), now)) { totals.skipped++; continue; }
        const result = await dispatchMedicalReminder({ db, memberRef: member.ref,
          clubId: club.id, now, timestamp, send });
        totals[result]++;
      }
      if (page.docs.length < pageSize) break;
      cursor = page.docs[page.docs.length - 1];
    }
  }
  return totals;
}
module.exports = { dispatchMedicalReminder, runMedicalExpiryReminders };

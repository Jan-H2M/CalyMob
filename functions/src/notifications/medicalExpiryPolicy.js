'use strict';
const { createHash } = require('node:crypto');
const DAY = 86400000;
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit',
});
function day(value) {
  if (!value) return null;
  let y, m, d;
  const legacy = typeof value === 'string' && value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (legacy) {
    [, d, m, y] = legacy.map(Number);
  } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    [y, m, d] = value.split('-').map(Number);
  } else {
    const date = value?.toDate ? value.toDate() : value instanceof Date ? value :
      typeof value === 'string' ? new Date(value) : null;
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
    const parts = Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]));
    y = Number(parts.year); m = Number(parts.month); d = Number(parts.day);
  }
  const result = new Date(Date.UTC(y, m - 1, d));
  return result.getUTCFullYear() === y && result.getUTCMonth() === m - 1 &&
    result.getUTCDate() === d ? result : null;
}
function medicalValidity(member, now = new Date()) {
  const today = day(now);
  const rawIssued = member.certificat_medical_date;
  const rawUntil = member.certificat_medical_validite;
  const issued = day(rawIssued), until = day(rawUntil);
  const unknown = { status: 'unknown', expiresOn: null, daysRemaining: null };
  if (!today || (rawIssued != null && !issued) || (rawUntil != null && !until)) return unknown;
  if (issued && issued > today) return unknown;
  let expiry = until;
  if (issued) {
    const y = issued.getUTCFullYear() + 1, m = issued.getUTCMonth();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const annual = new Date(Date.UTC(y, m, Math.min(issued.getUTCDate(), last)));
    if (!expiry || annual < expiry) expiry = annual;
    if (expiry < issued) return unknown;
  }
  if (!expiry) return unknown;
  const daysRemaining = Math.round((expiry - today) / DAY);
  return { status: daysRemaining < 0 ? 'expired' : daysRemaining <= 30 ? 'expiringSoon' : 'valid',
    expiresOn: expiry.toISOString().slice(0, 10), daysRemaining };
}
function reminderPlan(member, now = new Date()) {
  const active = member.member_status === 'active' ||
    (member.member_status == null && member.actif === true);
  if (!active || member.is_test_account === true || member.notifications_enabled === false ||
      member.notification_preferences?.medical_certificates === false ||
      member.has_pending_medical === true) return null;
  const validity = medicalValidity(member, now);
  if (validity.status !== 'expiringSoon' || validity.daysRemaining < 1) return null;
  const tokens = [...new Set([...(Array.isArray(member.fcm_tokens) ? member.fcm_tokens : []),
    member.fcm_token].filter(t => typeof t === 'string' && t.trim()))];
  if (!tokens.length) return null;
  // Catch missed days, but never replay the 30-day band after entering the last week.
  const band = validity.daysRemaining <= 7 ? '7' : '30';
  const key = createHash('sha256').update(`annual-v1|${validity.expiresOn}|${band}`).digest('hex');
  return { ...validity, band, key, tokens };
}
module.exports = { day, medicalValidity, reminderPlan };

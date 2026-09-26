const { EVENT_EXPIRY_GRACE_DAYS } = require('../utils/constants');

const BRUSSELS = 'Europe/Brussels';

function asDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  return value instanceof Date ? value : null;
}

// Calendar addition, rather than 24-hour addition, preserves the Brussels
// wall-clock time across daylight-saving transitions.
function eventUnreadUntil(dateFin) {
  const date = asDate(dateFin);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BRUSSELS, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
  const localUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1,
    Number(parts.day) + EVENT_EXPIRY_GRACE_DAYS, Number(parts.hour), Number(parts.minute), Number(parts.second));
  const offsetAt = (instant) => {
    const rendered = new Intl.DateTimeFormat('en-CA', {
      timeZone: BRUSSELS, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant)).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
    return Date.UTC(rendered.year, rendered.month - 1, rendered.day,
      rendered.hour, rendered.minute, rendered.second) - instant;
  };
  let result = localUtc - offsetAt(localUtc);
  result = localUtc - offsetAt(result);
  return new Date(result + date.getMilliseconds());
}

function isUnreadEligibleEvent(operation = {}, now = new Date()) {
  const type = String(operation.type || '').trim().toLowerCase();
  const category = String(operation.event_category || operation.categorie || '').trim().toLowerCase();
  const status = String(operation.statut || '').trim().toLowerCase();
  if (type !== 'evenement' || category === 'piscine'
    || operation.deleted_at != null
    || !['ouvert', 'ferme', 'annule'].includes(status)) return false;
  const until = eventUnreadUntil(operation.date_fin);
  return !until || now.getTime() <= until.getTime();
}

module.exports = { asDate, eventUnreadUntil, isUnreadEligibleEvent, BRUSSELS };

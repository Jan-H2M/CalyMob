function isEligibleEventMessageRegistration(registration = {}) {
  const status = String(registration.registration_status || '').trim().toLowerCase();
  return !['canceled', 'waitlisted', 'withdrawn'].includes(status);
}

function shouldNotifyForOperation(operation = {}, now = new Date()) {
  return isUnreadEligibleEvent(operation, now);
}

module.exports = { isEligibleEventMessageRegistration, shouldNotifyForOperation };
const { isUnreadEligibleEvent } = require('./eventUnreadPolicy');

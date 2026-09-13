function isEligibleEventMessageRegistration(registration = {}) {
  return registration.registration_status !== 'canceled';
}

function shouldNotifyForOperation(operation = {}) {
  return operation.statut !== 'supprime';
}

module.exports = { isEligibleEventMessageRegistration, shouldNotifyForOperation };

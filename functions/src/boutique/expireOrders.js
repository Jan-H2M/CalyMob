const { onSchedule } = require('firebase-functions/v2/scheduler');
const { REGION } = require('./shared');

// Boutique orders are a persistent personal cart: an unpaid order remains
// payable until the member or an administrator explicitly cancels it.
// Keep this scheduled entrypoint as a harmless no-op so an already deployed
// scheduler cannot reintroduce the old 72-hour auto-cancellation behaviour.
exports.expireBoutiqueOrders = onSchedule(
  {
    region: REGION,
    schedule: 'every 60 minutes',
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async () => {
    console.log('[expireBoutiqueOrders] Désactivé : les commandes Boutique impayées restent disponibles.');
  },
);

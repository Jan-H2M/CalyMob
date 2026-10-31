'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();
// Explicit per-dispatch context, never a global console override. Other
// concurrent notification categories retain their existing diagnostics.
const notificationLog = Object.fromEntries(['log', 'warn', 'error'].map(method =>
  [method, (...args) => { if (context.getStore() !== true) console[method](...args); }]));
const withPrivateNotificationLogs = task => context.run(true, task);
module.exports = { notificationLog, withPrivateNotificationLogs };

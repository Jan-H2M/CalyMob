'use strict';

const { onCall } = require('firebase-functions/v2/https');
const { assertQaEnvironment, captureSideEffect } = require('./side_effect_capture');
assertQaEnvironment(process.env);

exports.qaCaptureSideEffect = onCall({
  region: 'europe-west1',
  cors: [
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://localhost:5173',
    'http://localhost:5174',
  ],
}, (request) => {
  const entry = captureSideEffect(request.data?.kind, request.data?.payload);
  return { captured: true, kind: entry.kind };
});

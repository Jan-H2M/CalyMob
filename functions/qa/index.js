'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { assertQaEnvironment, captureSideEffect } = require('./side_effect_capture');
assertQaEnvironment(process.env);

exports.qaCaptureSideEffect = onRequest({ region: 'europe-west1' }, (request, response) => {
  const kind = request.body?.data?.kind;
  const entry = captureSideEffect(kind, request.body?.data?.payload);
  response.status(202).json({ data: { captured: true, kind: entry.kind } });
});

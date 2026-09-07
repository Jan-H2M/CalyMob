'use strict';

const fs = require('node:fs');
const path = require('node:path');
const QA_PROJECT_ID = 'demo-calycompta-qa';
const QA_HOST = '127.0.0.1';
const ALLOWED_KINDS = new Set(['email', 'sms', 'fcm', 'ponto', 'bank', 'payment', 'http']);
const SENSITIVE_KEY = /(authorization|token|secret|password|cookie|iban|account|email|phone|body|html)/i;
const CREDENTIAL_KEYS = [
  'FIREBASE_SERVICE_ACCOUNT_KEY', 'FIREBASE_SERVICE_ACCOUNT',
  'GOOGLE_APPLICATION_CREDENTIALS', 'GCLOUD_ACCESS_TOKEN',
  'RESEND_API_KEY', 'TWILIO_AUTH_TOKEN', 'PONTO_CLIENT_SECRET',
  'PONTO_TLS_KEY', 'MOLLIE_API_KEY', 'NODA_API_KEY',
];

function assertQaEnvironment(env = process.env) {
  if (env.CALYPSO_QA_EMULATOR !== 'true') throw new Error('QA emulator flag required');
  if (env.NODE_ENV === 'production') throw new Error('QA capture refuses production mode');
  const credentials = CREDENTIAL_KEYS.filter((key) => Boolean(env[key]));
  if (credentials.length) throw new Error(`QA capture refuses credentials: ${credentials.join(', ')}`);
  for (const key of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) {
    if (env[key] !== QA_PROJECT_ID) throw new Error(`QA capture refuses project in ${key}`);
  }
  const endpoints = {
    FIRESTORE_EMULATOR_HOST: 8080,
    FIREBASE_AUTH_EMULATOR_HOST: 9099,
    FIREBASE_STORAGE_EMULATOR_HOST: 9199,
    STORAGE_EMULATOR_HOST: 9199,
    FUNCTIONS_EMULATOR_HOST: 5001,
  };
  for (const [key, port] of Object.entries(endpoints)) {
    if (env[key] !== `${QA_HOST}:${port}`) throw new Error(`QA capture refuses endpoint in ${key}`);
  }
  return true;
}

function redact(value, key = '') {
  if (SENSITIVE_KEY.test(key)) {
    return { redacted: true, type: Array.isArray(value) ? 'array' : typeof value, length: String(value ?? '').length };
  }
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]));
  }
  return typeof value === 'string' && value.length > 256
    ? { redacted: true, type: 'string', length: value.length }
    : value;
}

function assertRunId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{5,79}$/i.test(value) || value.includes('..')) {
    throw new Error('Unsafe QA run ID');
  }
  return value;
}

function captureSideEffect(kind, payload, options = {}) {
  assertQaEnvironment(options.env || process.env);
  if (!ALLOWED_KINDS.has(kind)) throw new Error(`Unsupported side effect kind: ${kind}`);
  const runId = assertRunId(options.runId || process.env.CALYPSO_QA_RUN_ID);
  const root = path.resolve(options.rootDir || process.env.CALYPSO_QA_ROOT || process.cwd());
  const artifactRoot = path.join(root, '.qa-artifacts');
  const runDir = path.join(artifactRoot, runId);
  for (const candidate of [artifactRoot, runDir]) {
    if (fs.existsSync(candidate) && fs.lstatSync(candidate).isSymbolicLink()) {
      throw new Error('QA capture refuses symlinked artifact directory');
    }
  }
  fs.mkdirSync(runDir, { recursive: true });
  const realRoot = fs.realpathSync(root);
  const realRunDir = fs.realpathSync(runDir);
  if (!realRunDir.startsWith(`${path.join(realRoot, '.qa-artifacts')}${path.sep}`)) {
    throw new Error('QA capture directory escaped repository root');
  }
  const output = path.join(runDir, 'calymob-transport.ndjson');
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) {
    throw new Error('QA capture refuses symlinked output');
  }
  const entry = {
    schemaVersion: 1,
    projectId: QA_PROJECT_ID,
    runId,
    kind,
    capturedAt: (options.now || (() => new Date().toISOString()))(),
    payload: redact(payload || {}),
  };
  fs.appendFileSync(output, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  return entry;
}

module.exports = { QA_PROJECT_ID, assertQaEnvironment, captureSideEffect, redact };

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  assertQaEnvironment,
  captureSideEffect,
} = require('../../qa/side_effect_capture');

const qaEnvironment = {
  CALYPSO_QA_EMULATOR: 'true',
  GCLOUD_PROJECT: 'demo-calycompta-qa',
  GOOGLE_CLOUD_PROJECT: 'demo-calycompta-qa',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
  STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
  FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5001',
};

describe('QA side-effect capture', () => {
  test('fails closed outside the exact emulator environment', () => {
    expect(() => assertQaEnvironment({})).toThrow();
    expect(() => assertQaEnvironment({...qaEnvironment, GCLOUD_PROJECT: 'calycompta'})).toThrow();
    expect(() => assertQaEnvironment({...qaEnvironment, FIRESTORE_EMULATOR_HOST: 'example.com:8080'})).toThrow();
    expect(() => assertQaEnvironment({...qaEnvironment, NODE_ENV: 'production'})).toThrow();
    expect(() => assertQaEnvironment({...qaEnvironment, PONTO_CLIENT_SECRET: 'not-allowed'})).toThrow();
  });

  test('redacts sensitive values before writing the local capture', () => {
    const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'calymob-qa-capture-'));
    const token = 'secret-device-token-value';
    try {
      const captured = captureSideEffect(
        'fcm',
        {
          token,
          email: 'fixture.user@example.invalid',
          title: 'Fixture notification',
        },
        {
          rootDir: artifactRoot,
          runId: 'com094-test',
          env: qaEnvironment,
        },
      );

      expect(captured.payload.token).toEqual({
        redacted: true,
        type: 'string',
        length: token.length,
      });
      expect(captured.payload.email.redacted).toBe(true);
      expect(captured.payload.title).toBe('Fixture notification');

      const file = fs.readFileSync(
        path.join(artifactRoot, '.qa-artifacts', 'com094-test', 'calymob-transport.ndjson'),
        'utf8',
      );
      expect(file).not.toContain(token);
      expect(file).not.toContain('fixture.user@example.invalid');
    } finally {
      fs.rmSync(artifactRoot, {recursive: true, force: true});
    }
  });
});

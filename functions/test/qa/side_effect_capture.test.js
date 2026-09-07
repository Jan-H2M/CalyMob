'use strict';

const fs = require('fs');
const express = require('express');
const {once} = require('events');
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

  test('exports a Firebase callable handler with local browser CORS', async () => {
    const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'calymob-qa-callable-'));
    const keys = {...qaEnvironment, CALYPSO_QA_ROOT: artifactRoot, CALYPSO_QA_RUN_ID: 'com094-callable'};
    const previous = Object.fromEntries(Object.keys(keys).map((key) => [key, process.env[key]]));
    try {
      Object.assign(process.env, keys);
      jest.resetModules();
      const callable = require('../../qa/index').qaCaptureSideEffect;
      expect(callable.__endpoint.callableTrigger).toBeDefined();
      await expect(callable.run({data: {kind: 'fcm', payload: {fixture: true}}}))
        .resolves.toEqual({captured: true, kind: 'fcm'});

      const app = express();
      app.use(express.json());
      app.all('/callable', callable);
      const server = app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      try {
        const address = server.address();
        const url = `http://127.0.0.1:${address.port}/callable`;
        const origin = 'http://127.0.0.1:5174';
        const preflight = await fetch(url, {
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type',
          },
        });
        expect(preflight.ok).toBe(true);
        expect(preflight.headers.get('access-control-allow-origin')).toBe(origin);

        const response = await fetch(url, {
          method: 'POST',
          headers: {'Content-Type': 'application/json', Origin: origin},
          body: JSON.stringify({data: {kind: 'fcm', payload: {fixture: true}}}),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          result: {captured: true, kind: 'fcm'},
        });
      } finally {
        if (server.listening) {
          await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        }
      }
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      fs.rmSync(artifactRoot, {recursive: true, force: true});
    }
  });
});

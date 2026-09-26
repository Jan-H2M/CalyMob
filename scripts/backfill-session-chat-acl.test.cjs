'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  assertSafety,
  parseArgs,
  planSessions,
  run,
} = require('./backfill-session-chat-acl.cjs');

function snapshot(id, data) {
  return {
    data: () => data,
    ref: { path: `clubs/calypso/piscine_sessions/${id}` },
  };
}

test('defaults to dry-run and protects production apply', () => {
  assert.equal(parseArgs(['--project', 'p']).mode, 'dry-run');
  assert.throws(
    () => assertSafety({ mode: 'apply', project: 'p' }, {}),
    /confirm-production/,
  );
  assert.doesNotThrow(() => assertSafety({
    mode: 'apply', project: 'p', confirmProduction: 'p',
  }, {}));
  assert.throws(() => parseArgs(['--restore']), /manifest/);
  assert.equal(parseArgs([
    '--restore', '--manifest', 'backup.json', '--resume-run-id', 'run-1',
  ]).resumeRunId, 'run-1');
});

test('derives accueil, all encadrants and exact level ACL', () => {
  const changes = planSessions([snapshot('s', {
    accueil: [{ membre_id: 'a' }, { membre_id: 'a' }],
    baptemes: [{ membre_id: 'b' }],
    niveaux: {
      '5★': {
        encadrants: [{ membre_id: 'level' }],
        courses_by_hour: {
          '20:00': [{ encadrants: [{ membre_id: 'course-only' }] }],
        },
      },
    },
  })]);
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].after, {
    accueil: ['a'],
    encadrants: ['b', 'course-only', 'level'],
    niveaux: { '5★': ['course-only', 'level'] },
  });
  assert.deepEqual(changes[0].before, { state: 'absent' });
});

test('an exact ACL is idempotent while stale or malformed ACL is repaired', () => {
  const base = {
    accueil: [{ membre_id: 'a' }],
    baptemes: [],
    niveaux: {},
  };
  assert.equal(planSessions([snapshot('exact', {
    ...base,
    chat_acl: { accueil: ['a'], encadrants: [], niveaux: {} },
  })]).length, 0);
  const stale = planSessions([snapshot('stale', {
    ...base,
    chat_acl: { accueil: ['other'], encadrants: [], niveaux: {} },
  })]);
  assert.equal(stale.length, 1);
  assert.deepEqual(stale[0].before, {
    state: 'value',
    value: { accueil: ['other'], encadrants: [], niveaux: {} },
  });
});

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function fakeFirestore(initial) {
  const values = new Map(Object.entries(initial).map(
    ([key, value]) => [key, clone(value)],
  ));

  function document(pathname) {
    return {
      path: pathname,
      async get() {
        const exists = values.has(pathname);
        return {
          exists,
          ref: document(pathname),
          id: pathname.split('/').at(-1),
          data: () => exists ? clone(values.get(pathname)) : undefined,
        };
      },
      async set(value) {
        values.set(pathname, clone(value));
      },
      async delete() {
        values.delete(pathname);
      },
    };
  }

  function applyUpdate(ref, patch) {
    if (!values.has(ref.path)) throw new Error(`Missing ${ref.path}`);
    const next = clone(values.get(ref.path));
    for (const [key, value] of Object.entries(patch)) {
      const looksLikeDelete = value && typeof value === 'object'
        && value.constructor?.name === 'DeleteTransform';
      if (looksLikeDelete) delete next[key];
      else next[key] = clone(value);
    }
    values.set(ref.path, next);
  }

  return {
    values,
    doc: document,
    collection(name) {
      return {
        doc(id) {
          return {
            collection(child) {
              const prefix = `${name}/${id}/${child}/`;
              return {
                async get() {
                  const docs = [...values.entries()]
                    .filter(([key]) => key.startsWith(prefix)
                      && !key.slice(prefix.length).includes('/'))
                    .map(([key]) => ({
                      id: key.slice(prefix.length),
                      path: key,
                      ref: document(key),
                      data: () => clone(values.get(key)),
                    }));
                  return { docs };
                },
              };
            },
          };
        },
      };
    },
    batch() {
      const writes = [];
      return {
        update(ref, patch) {
          writes.push([ref, patch]);
        },
        async commit() {
          writes.forEach(([ref, patch]) => applyUpdate(ref, patch));
        },
      };
    },
  };
}

function applyOptions(backupDir) {
  return {
    mode: 'apply',
    club: 'calypso',
    project: 'demo-session-acl',
    confirmProduction: 'demo-session-acl',
    backupDir,
    batchSize: 1,
  };
}

test('partial apply is resumable by exact run id, idempotent, and restorable', async () => {
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-acl-test-'));
  const db = fakeFirestore({
    'clubs/calypso/piscine_sessions/one': {
      accueil: [{ membre_id: 'a' }], niveaux: {}, baptemes: [],
    },
    'clubs/calypso/piscine_sessions/two': {
      accueil: [],
      niveaux: { '5★': { encadrants: [{ membre_id: 'level' }] } },
      baptemes: [],
    },
  });
  const options = applyOptions(backupDir);
  assert.equal(await run({ ...options, mode: 'verify' }, {
    firestore: db,
    environment: { FIRESTORE_EMULATOR_HOST: 'fake' },
  }), 2);
  await assert.rejects(
    run(options, {
      firestore: db,
      environment: { FIRESTORE_EMULATOR_HOST: 'fake' },
      afterBatch: ({ batchNumber }) => {
        if (batchNumber === 1) throw new Error('simulated interruption');
      },
    }),
    /simulated interruption/,
  );
  const markerPath =
    'clubs/calypso/settings/session_chat_acl_v1_migration';
  const running = db.values.get(markerPath);
  assert.equal(running.status, 'running');
  assert.equal(typeof running.manifest, 'string');
  assert.deepEqual(
    db.values.get('clubs/calypso/piscine_sessions/one').chat_acl,
    { accueil: ['a'], encadrants: [], niveaux: {} },
  );
  assert.equal(
    db.values.get('clubs/calypso/piscine_sessions/two').chat_acl,
    undefined,
  );
  assert.equal(await run({ ...options, mode: 'verify' }, {
    firestore: db,
    environment: { FIRESTORE_EMULATOR_HOST: 'fake' },
  }), 2);

  await assert.rejects(
    run({ ...options, resumeRunId: 'wrong-run' }, {
      firestore: db,
      environment: { FIRESTORE_EMULATOR_HOST: 'fake' },
    }),
    /exact run id/,
  );
  assert.equal(await run({ ...options, resumeRunId: running.run_id }, {
    firestore: db,
    environment: { FIRESTORE_EMULATOR_HOST: 'fake' },
  }), 0);
  const complete = db.values.get(markerPath);
  assert.equal(complete.status, 'complete');
  assert.equal(complete.resumed, true);
  assert.deepEqual(
    db.values.get('clubs/calypso/piscine_sessions/two').chat_acl,
    { accueil: [], encadrants: ['level'], niveaux: { '5★': ['level'] } },
  );
  assert.equal(await run({ ...options, mode: 'verify' }, {
    firestore: db,
    environment: { FIRESTORE_EMULATOR_HOST: 'fake' },
  }), 0);

  assert.equal(await run(options, {
    firestore: db,
    environment: { FIRESTORE_EMULATOR_HOST: 'fake' },
  }), 0);

  const restoreOptions = {
    ...options,
    mode: 'restore',
    manifest: complete.manifest,
  };
  assert.equal(await run(restoreOptions, {
    firestore: db,
    environment: { FIRESTORE_EMULATOR_HOST: 'fake' },
  }), 0);
  assert.equal(db.values.has(markerPath), false);
  assert.equal(
    db.values.get('clubs/calypso/piscine_sessions/one').chat_acl,
    undefined,
  );
  assert.equal(
    db.values.get('clubs/calypso/piscine_sessions/two').chat_acl,
    undefined,
  );
  assert.equal(await run(restoreOptions, {
    firestore: db,
    environment: { FIRESTORE_EMULATOR_HOST: 'fake' },
  }), 0);
});

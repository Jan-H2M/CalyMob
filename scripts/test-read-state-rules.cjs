#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} = require('firebase/firestore');

const clubPath = 'clubs/calypso';
const cursorPath = `${clubPath}/members/member-a/read_state/events`;

function sectionPayload(section) {
  if (section === 'announcements') {
    return {
      schema_version: 1,
      last_seen_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    };
  }
  return {
    schema_version: 1,
    global_last_seen_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };
}

function scopePayload() {
  return {
    last_seen_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };
}

async function main() {
  const env = await initializeTestEnvironment({
    projectId: 'calymob-read-state-rules',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8'),
    },
  });

  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, `${clubPath}/members/member-a`), {app_role: 'user'});
      await setDoc(doc(db, `${clubPath}/members/member-b`), {app_role: 'user'});
      await setDoc(doc(db, `${clubPath}/members/member-admin`), {app_role: 'admin'});
      await setDoc(doc(db, `${clubPath}/settings/feature_flags`), {
        unreadCursorV1Enabled: false,
        unreadCursorV1Mode: 'off',
      });
      await setDoc(doc(db, `${clubPath}/settings/unread_cursor_v1_migration`), {
        schema_version: 1,
        status: 'roots-seeded',
        baseline_at: new Date('2026-09-25T08:26:55.038Z'),
      });
      await setDoc(doc(
        db,
        `${clubPath}/members/member-a/read_state_bootstraps/unread_cursor_v1`,
      ), {
        schema_version: 1,
        status: 'complete',
        bootstrapped_at: new Date('2026-09-26T10:00:00.000Z'),
      });
      await setDoc(doc(db, `${clubPath}/operations/event-1/messages/message-1`), {
        sender_id: 'member-b',
        message: 'Legacy read_by compatibility check',
        read_by: [],
      });
    });

    const ownDb = env.authenticatedContext('member-a').firestore();
    const otherDb = env.authenticatedContext('member-b').firestore();
    const anonymousDb = env.unauthenticatedContext().firestore();
    const adminDb = env.authenticatedContext('member-admin').firestore();

    const ownCursor = doc(ownDb, cursorPath);
    const otherCursor = doc(otherDb, cursorPath);
    const ownScope = doc(
      ownDb,
      `${cursorPath}/conversations/event-1`,
    );

    await assertSucceeds(setDoc(ownCursor, sectionPayload('events')));
    await assertSucceeds(getDoc(ownCursor));
    await assertSucceeds(updateDoc(ownCursor, sectionPayload('events')));
    await assertSucceeds(setDoc(ownScope, scopePayload()));
    await assertSucceeds(updateDoc(ownScope, scopePayload()));

    await assertFails(getDoc(otherCursor));
    await assertFails(updateDoc(otherCursor, sectionPayload('events')));
    await assertFails(getDoc(doc(anonymousDb, cursorPath)));
    await assertFails(setDoc(doc(anonymousDb, cursorPath), sectionPayload('events')));

    await assertFails(setDoc(
      doc(ownDb, `${clubPath}/members/member-a/read_state/unknown`),
      sectionPayload('events'),
    ));
    await assertFails(setDoc(
      doc(ownDb, `${cursorPath}/channels/not-an-event-scope`),
      scopePayload(),
    ));
    await assertFails(setDoc(ownCursor, {
      ...sectionPayload('events'),
      forged: true,
    }));
    await assertFails(setDoc(
      doc(ownDb, `${clubPath}/members/member-a/read_state/announcements`),
      {
        schema_version: 1,
        last_seen_at: new Date('2020-01-01T00:00:00Z'),
        updated_at: new Date('2030-01-01T00:00:00Z'),
      },
    ));
    await assertFails(setDoc(
      doc(ownDb, `${clubPath}/members/member-a/read_state/teams`),
      {
        ...sectionPayload('teams'),
        schema_version: 2,
      },
    ));
    await assertFails(deleteDoc(ownCursor));

    // Cursor-v1 must not widen announcement writes: field maintenance is
    // server-only so old/new clients cannot forge visibility/activity.
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), `${clubPath}/announcements/announcement-a`), {
        title: 'Existing announcement', created_at: new Date(), reply_count: 0,
      });
    });
    await assertFails(updateDoc(
      doc(ownDb, `${clubPath}/announcements/announcement-a`),
      { last_activity_at: serverTimestamp() },
    ));
    await assertFails(updateDoc(
      doc(ownDb, `${clubPath}/announcements/announcement-a`),
      { visibility: 'published' },
    ));

    const flags = doc(ownDb, `${clubPath}/settings/feature_flags`);
    await assertSucceeds(getDoc(flags));
    await assertFails(updateDoc(flags, {unreadCursorV1Enabled: true}));
    await assertSucceeds(updateDoc(
      doc(adminDb, `${clubPath}/settings/feature_flags`),
      {unreadCursorV1Enabled: true},
    ));

    const migrationMarker = doc(
      ownDb,
      `${clubPath}/settings/unread_cursor_v1_migration`,
    );
    await assertSucceeds(getDoc(migrationMarker));
    await assertFails(updateDoc(migrationMarker, {status: 'forged'}));
    await assertFails(updateDoc(
      doc(adminDb, `${clubPath}/settings/unread_cursor_v1_migration`),
      {status: 'forged'},
    ));

    // The per-member bootstrap marker coordinates trusted server writes and
    // must remain invisible and immutable to every client, including admins.
    const ownBootstrapMarkerPath =
      `${clubPath}/members/member-a/read_state_bootstraps/unread_cursor_v1`;
    const ownBootstrapMarker = doc(ownDb, ownBootstrapMarkerPath);
    const adminBootstrapMarker = doc(adminDb, ownBootstrapMarkerPath);
    for (const marker of [ownBootstrapMarker, adminBootstrapMarker]) {
      await assertFails(getDoc(marker));
      await assertFails(setDoc(marker, {
        schema_version: 1,
        status: 'complete',
        bootstrapped_at: serverTimestamp(),
      }));
      await assertFails(updateDoc(marker, {status: 'forged'}));
      await assertFails(deleteDoc(marker));
    }

    // Phase 1 intentionally leaves existing message/read_by permissions intact.
    await assertSucceeds(updateDoc(
      doc(ownDb, `${clubPath}/operations/event-1/messages/message-1`),
      {read_by: ['member-a']},
    ));

    console.log(
      'PASS read-state rules: self-only server-timestamp cursors, server-only bootstrap markers, strict schema, feature flag protection, and legacy read_by compatibility',
    );
  } finally {
    await env.cleanup();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

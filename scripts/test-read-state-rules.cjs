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
      const members = {
        'member-a': {app_role: 'user'},
        'member-b': {app_role: 'user'},
        'member-admin': {app_role: 'admin'},
        'member-bs': {app_role: 'user', clubStatuten: ['BS']},
        'member-ca': {app_role: 'user', clubStatuten: ['CA']},
        'member-gonflage': {app_role: 'user', clubStatuten: [' gOnFlAgE ']},
        'member-accueil': {app_role: 'user', clubStatuten: ['A']},
        'member-encadrant': {app_role: 'user', clubStatuten: ['Encadrant']},
        'member-formation-active': {
          app_role: 'user',
          formation_active: true,
          target_formation_level: 'P1',
        },
        'member-formation-inactive': {
          app_role: 'user',
          formation_active: false,
          target_formation_level: 'P1',
        },
        'member-formation-fuzzy': {
          app_role: 'user',
          formation_active: true,
          target_formation_level: 'niveau 1',
        },
        'member-session-accueil': {app_role: 'user'},
        'member-session-encadrant': {app_role: 'user'},
        'member-session-level': {app_role: 'user'},
        'member-session-course': {app_role: 'user'},
        'member-outsider': {app_role: 'user'},
      };
      await Promise.all(Object.entries(members).map(([id, data]) =>
        setDoc(doc(db, `${clubPath}/members/${id}`), data)));
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
      await setDoc(doc(db, `${clubPath}/announcements/announcement-a`), {
        title: 'Existing announcement',
        created_at: new Date('2026-09-25T10:00:00.000Z'),
        reply_count: 0,
      });
      await setDoc(doc(db, `${clubPath}/team_channels/general`), {
        name: 'General', type: 'general',
      });
      await setDoc(doc(db, `${clubPath}/team_channels/bureau`), {
        name: 'Bureau', type: 'bureau',
      });
      await setDoc(doc(db, `${clubPath}/team_channels/equipe_ca`), {
        name: 'CA', type: 'ca',
      });
      await setDoc(doc(db, `${clubPath}/team_channels/equipe_encadrants`), {
        name: 'Encadrants', type: 'encadrants',
      });
      await setDoc(doc(db, `${clubPath}/team_channels/formation_1_etoile`), {
        name: 'Formation 1', type: 'formation_1_etoile',
      });
      await setDoc(doc(db, `${clubPath}/team_channels/bureau/messages/seed`), {
        sender_id: 'member-bs', message: 'Confidentiel', read_by: [],
      });
      await setDoc(doc(db, `${clubPath}/piscine_sessions/session-1`), {
        type: 'piscine',
        statut: 'publiee',
        chat_acl: {
          accueil: ['member-session-accueil'],
          encadrants: ['member-session-encadrant', 'member-session-course'],
          niveaux: {
            '5★': ['member-session-level', 'member-session-course'],
          },
        },
      });
      await setDoc(doc(db, `${clubPath}/piscine_sessions/session-1/messages/accueil-seed`), {
        sender_id: 'member-session-accueil',
        group_type: 'accueil',
        group_level: '',
        message: 'Accueil',
      });
      await setDoc(doc(db, `${clubPath}/piscine_sessions/session-1/messages/encadrants-seed`), {
        sender_id: 'member-session-encadrant',
        group_type: 'encadrants',
        group_level: '',
        message: 'Encadrants',
      });
      await setDoc(doc(db, `${clubPath}/piscine_sessions/session-1/messages/level-seed`), {
        sender_id: 'member-session-level',
        group_type: 'niveau',
        group_level: '5★',
        message: 'Niveau',
      });
      await setDoc(doc(db, `${clubPath}/inventory_loans/loan-a`), {
        memberId: 'member-a', status: 'active',
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

    // Timestamp v2 is additive while the server-only marker is absent. This
    // keeps live 1.22.4 writers working during the staged rollout, while new
    // writers may already submit an exact request.time canonical timestamp.
    await assertSucceeds(setDoc(
      doc(ownDb, `${clubPath}/operations/event-1/messages/event-legacy-optional`),
      {sender_id: 'member-a', message: 'legacy'},
    ));
    await assertSucceeds(setDoc(
      doc(ownDb, `${clubPath}/operations/event-1/messages/event-modern-optional`),
      {
        sender_id: 'member-a',
        message: 'modern',
        unread_created_at: serverTimestamp(),
      },
    ));
    for (const forgedValue of [
      new Date('2000-01-01T00:00:00.000Z'),
      new Date('2100-01-01T00:00:00.000Z'),
      'not-a-timestamp',
    ]) {
      await assertFails(setDoc(
        doc(ownDb, `${clubPath}/operations/event-1/messages/forged-${String(forgedValue)}`),
        {
          sender_id: 'member-a',
          message: 'forged',
          unread_created_at: forgedValue,
        },
      ));
    }

    await assertSucceeds(setDoc(
      doc(ownDb, `${clubPath}/team_channels/general/messages/team-legacy-optional`),
      {sender_id: 'member-a', message: 'legacy'},
    ));
    await assertSucceeds(setDoc(
      doc(ownDb, `${clubPath}/team_channels/general/messages/team-modern-optional`),
      {sender_id: 'member-a', message: 'modern', unread_created_at: serverTimestamp()},
    ));

    const sessionAccueilDb = env.authenticatedContext(
      'member-session-accueil',
    ).firestore();
    await assertSucceeds(setDoc(
      doc(sessionAccueilDb, `${clubPath}/piscine_sessions/session-1/messages/session-legacy-optional`),
      {
        sender_id: 'member-session-accueil',
        group_type: 'accueil',
        group_level: '',
        message: 'legacy',
      },
    ));
    await assertSucceeds(setDoc(
      doc(sessionAccueilDb, `${clubPath}/piscine_sessions/session-1/messages/session-modern-optional`),
      {
        sender_id: 'member-session-accueil',
        group_type: 'accueil',
        group_level: '',
        message: 'modern',
        unread_created_at: serverTimestamp(),
      },
    ));

    await assertSucceeds(setDoc(
      doc(adminDb, `${clubPath}/announcements/announcement-legacy-optional`),
      {title: 'legacy', sender_id: 'member-admin'},
    ));
    await assertSucceeds(setDoc(
      doc(adminDb, `${clubPath}/announcements/announcement-modern-optional`),
      {
        title: 'modern',
        sender_id: 'member-admin',
        unread_created_at: serverTimestamp(),
        unread_activity_at: serverTimestamp(),
      },
    ));
    await assertFails(setDoc(
      doc(adminDb, `${clubPath}/announcements/announcement-forged-sender`),
      {
        title: 'forged sender',
        sender_id: 'member-a',
        unread_created_at: serverTimestamp(),
        unread_activity_at: serverTimestamp(),
      },
    ));
    await assertSucceeds(setDoc(
      doc(ownDb, `${clubPath}/announcements/announcement-a/replies/reply-legacy-optional`),
      {sender_id: 'member-a', message: 'legacy'},
    ));
    await assertSucceeds(setDoc(
      doc(ownDb, `${clubPath}/announcements/announcement-a/replies/reply-modern-optional`),
      {sender_id: 'member-a', message: 'modern', unread_created_at: serverTimestamp()},
    ));

    const timestampMarkerPath =
      `${clubPath}/settings/unread_timestamp_v2_migration`;
    const timestampMarker = doc(ownDb, timestampMarkerPath);
    const adminTimestampMarker = doc(adminDb, timestampMarkerPath);
    await assertFails(setDoc(timestampMarker, {
      schema_version: 2, status: 'complete', writer_contract: 'required',
    }));
    await assertFails(setDoc(adminTimestampMarker, {
      schema_version: 2, status: 'complete', writer_contract: 'required',
    }));
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), timestampMarkerPath), {
        schema_version: 2,
        status: 'enforcing',
        writer_contract: 'required',
      });
    });
    await assertSucceeds(getDoc(timestampMarker));
    await assertFails(updateDoc(timestampMarker, {status: 'forged'}));
    await assertFails(updateDoc(adminTimestampMarker, {status: 'forged'}));

    // Once the writer contract enters enforcing, missing timestamps from old
    // clients fail closed. Exact server timestamps continue to work in every
    // canonical unread domain.
    await assertFails(setDoc(
      doc(ownDb, `${clubPath}/operations/event-1/messages/event-missing-required`),
      {sender_id: 'member-a', message: 'missing'},
    ));
    await assertSucceeds(setDoc(
      doc(ownDb, `${clubPath}/operations/event-1/messages/event-modern-required`),
      {sender_id: 'member-a', message: 'modern', unread_created_at: serverTimestamp()},
    ));
    await assertFails(setDoc(
      doc(ownDb, `${clubPath}/team_channels/general/messages/team-missing-required`),
      {sender_id: 'member-a', message: 'missing'},
    ));
    await assertSucceeds(setDoc(
      doc(ownDb, `${clubPath}/team_channels/general/messages/team-modern-required`),
      {sender_id: 'member-a', message: 'modern', unread_created_at: serverTimestamp()},
    ));
    await assertFails(setDoc(
      doc(sessionAccueilDb, `${clubPath}/piscine_sessions/session-1/messages/session-missing-required`),
      {
        sender_id: 'member-session-accueil', group_type: 'accueil',
        group_level: '', message: 'missing',
      },
    ));
    await assertSucceeds(setDoc(
      doc(sessionAccueilDb, `${clubPath}/piscine_sessions/session-1/messages/session-modern-required`),
      {
        sender_id: 'member-session-accueil', group_type: 'accueil',
        group_level: '', message: 'modern', unread_created_at: serverTimestamp(),
      },
    ));
    await assertFails(setDoc(
      doc(adminDb, `${clubPath}/announcements/announcement-missing-required`),
      {title: 'missing', sender_id: 'member-admin'},
    ));
    await assertSucceeds(setDoc(
      doc(adminDb, `${clubPath}/announcements/announcement-modern-required`),
      {
        title: 'modern',
        sender_id: 'member-admin',
        unread_created_at: serverTimestamp(),
        unread_activity_at: serverTimestamp(),
      },
    ));
    await assertFails(setDoc(
      doc(ownDb, `${clubPath}/announcements/announcement-a/replies/reply-missing-required`),
      {sender_id: 'member-a', message: 'missing'},
    ));
    await assertSucceeds(setDoc(
      doc(ownDb, `${clubPath}/announcements/announcement-a/replies/reply-modern-required`),
      {sender_id: 'member-a', message: 'modern', unread_created_at: serverTimestamp()},
    ));
    await assertFails(updateDoc(
      doc(ownDb, `${clubPath}/operations/event-1/messages/event-modern-required`),
      {unread_created_at: serverTimestamp()},
    ));
    await assertFails(updateDoc(
      doc(adminDb, `${clubPath}/operations/event-1/messages/event-modern-required`),
      {unread_created_at: serverTimestamp()},
    ));
    await assertFails(updateDoc(
      doc(adminDb, `${clubPath}/announcements/announcement-modern-required`),
      {unread_activity_at: serverTimestamp()},
    ));

    await env.withSecurityRulesDisabled(async context => {
      await updateDoc(doc(context.firestore(), timestampMarkerPath), {
        status: 'complete',
      });
    });
    await assertFails(setDoc(
      doc(ownDb, `${clubPath}/operations/event-1/messages/event-missing-complete`),
      {sender_id: 'member-a', message: 'missing'},
    ));
    await assertSucceeds(setDoc(
      doc(ownDb, `${clubPath}/operations/event-1/messages/event-modern-complete`),
      {sender_id: 'member-a', message: 'modern', unread_created_at: serverTimestamp()},
    ));

    // Bureau is confidential and has no admin/CA bypass. Exact BS holders can
    // read and write; an ordinary member, CA, and admin-without-BS cannot.
    const bsDb = env.authenticatedContext('member-bs').firestore();
    const caDb = env.authenticatedContext('member-ca').firestore();
    await assertSucceeds(getDoc(doc(bsDb, `${clubPath}/team_channels/bureau`)));
    await assertSucceeds(getDoc(doc(bsDb, `${clubPath}/team_channels/bureau/messages/seed`)));
    await assertSucceeds(setDoc(
      doc(bsDb, `${clubPath}/team_channels/bureau/messages/bs-write`),
      {sender_id: 'member-bs', message: 'ok', unread_created_at: serverTimestamp()},
    ));
    for (const deniedDb of [ownDb, caDb, adminDb]) {
      await assertFails(getDoc(doc(deniedDb, `${clubPath}/team_channels/bureau`)));
      await assertFails(getDoc(doc(deniedDb, `${clubPath}/team_channels/bureau/messages/seed`)));
    }

    // Team visibility uses the exact same role/formation contract as the app
    // and notification counter. Fuzzy targets and inactive formations fail.
    const activeFormationDb = env.authenticatedContext(
      'member-formation-active',
    ).firestore();
    const inactiveFormationDb = env.authenticatedContext(
      'member-formation-inactive',
    ).firestore();
    const fuzzyFormationDb = env.authenticatedContext(
      'member-formation-fuzzy',
    ).firestore();
    const encadrantDb = env.authenticatedContext('member-encadrant').firestore();
    const formationPath = `${clubPath}/team_channels/formation_1_etoile`;
    await assertSucceeds(getDoc(doc(activeFormationDb, formationPath)));
    await assertFails(getDoc(doc(inactiveFormationDb, formationPath)));
    await assertFails(getDoc(doc(fuzzyFormationDb, formationPath)));
    await assertFails(getDoc(doc(encadrantDb, formationPath)));
    await assertSucceeds(getDoc(doc(adminDb, formationPath)));
    await assertSucceeds(getDoc(doc(encadrantDb, `${clubPath}/team_channels/equipe_encadrants`)));
    await assertFails(getDoc(doc(activeFormationDb, `${clubPath}/team_channels/equipe_encadrants`)));
    await assertFails(setDoc(
      doc(adminDb, `${clubPath}/team_channels/equipe_accueil`),
      {name: 'bad', type: 'ca'},
    ));
    await assertSucceeds(setDoc(
      doc(adminDb, `${clubPath}/team_channels/equipe_accueil`),
      {name: 'Accueil', type: 'accueil'},
    ));
    await assertFails(updateDoc(
      doc(adminDb, `${clubPath}/team_channels/equipe_accueil`),
      {type: 'ca'},
    ));

    // Session chat access is tied to the concrete assignment and message
    // group. Global roles and admins do not bypass this server-derived ACL.
    const sessionEncadrantDb = env.authenticatedContext(
      'member-session-encadrant',
    ).firestore();
    const sessionLevelDb = env.authenticatedContext(
      'member-session-level',
    ).firestore();
    const sessionCourseDb = env.authenticatedContext(
      'member-session-course',
    ).firestore();
    const outsiderDb = env.authenticatedContext('member-outsider').firestore();
    const sessionMessages = `${clubPath}/piscine_sessions/session-1/messages`;
    await assertSucceeds(getDoc(doc(sessionAccueilDb, `${sessionMessages}/accueil-seed`)));
    await assertFails(getDoc(doc(sessionAccueilDb, `${sessionMessages}/encadrants-seed`)));
    await assertSucceeds(getDoc(doc(sessionEncadrantDb, `${sessionMessages}/encadrants-seed`)));
    await assertSucceeds(getDoc(doc(sessionLevelDb, `${sessionMessages}/level-seed`)));
    await assertSucceeds(getDoc(doc(sessionCourseDb, `${sessionMessages}/level-seed`)));
    await assertFails(getDoc(doc(outsiderDb, `${sessionMessages}/accueil-seed`)));
    await assertFails(getDoc(doc(adminDb, `${sessionMessages}/accueil-seed`)));
    await assertFails(setDoc(doc(sessionAccueilDb, `${sessionMessages}/malformed-group`), {
      sender_id: 'member-session-accueil',
      group_type: 'unknown',
      group_level: '',
      message: 'no',
      unread_created_at: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(sessionLevelDb, `${sessionMessages}/wrong-level`), {
      sender_id: 'member-session-level',
      group_type: 'niveau',
      group_level: '4★',
      message: 'no',
      unread_created_at: serverTimestamp(),
    }));
    const sessionAclMarkerPath =
      `${clubPath}/settings/session_chat_acl_v1_migration`;
    await assertFails(setDoc(doc(ownDb, sessionAclMarkerPath), {
      schema_version: 1, status: 'complete',
    }));
    await assertFails(setDoc(doc(adminDb, sessionAclMarkerPath), {
      schema_version: 1, status: 'complete',
    }));
    await assertFails(updateDoc(
      doc(adminDb, `${clubPath}/piscine_sessions/session-1`),
      {chat_acl: {accueil: ['member-admin'], encadrants: [], niveaux: {}}},
    ));
    await env.withSecurityRulesDisabled(async context => {
      await updateDoc(
        doc(context.firestore(), `${clubPath}/piscine_sessions/session-1`),
        {
          'chat_acl.accueil': [],
        },
      );
    });
    await assertFails(getDoc(doc(sessionAccueilDb, `${sessionMessages}/accueil-seed`)));

    // Gonflage role parsing is case/space insensitive, but neither CA nor an
    // administrator without Gonflage may operate a physical material loan.
    const gonflageDb = env.authenticatedContext('member-gonflage').firestore();
    await assertSucceeds(setDoc(
      doc(gonflageDb, `${clubPath}/inventory_loans/loan-gonflage`),
      {memberId: 'member-a', status: 'active'},
    ));
    await assertFails(setDoc(
      doc(caDb, `${clubPath}/inventory_loans/loan-ca`),
      {memberId: 'member-a', status: 'active'},
    ));
    await assertFails(setDoc(
      doc(adminDb, `${clubPath}/inventory_loans/loan-admin`),
      {memberId: 'member-a', status: 'active'},
    ));
    await assertSucceeds(getDoc(doc(ownDb, `${clubPath}/inventory_loans/loan-a`)));

    // Event discussion ACL is intentionally unchanged in this unread repair:
    // every club member still has the existing read/send permission. A future
    // participant-only narrowing needs separate product/security approval.
    await assertSucceeds(getDoc(
      doc(outsiderDb, `${clubPath}/operations/event-1/messages/message-1`),
    ));
    await assertSucceeds(setDoc(
      doc(outsiderDb, `${clubPath}/operations/event-1/messages/outsider-existing-policy`),
      {
        sender_id: 'member-outsider',
        message: 'existing broad member policy',
        unread_created_at: serverTimestamp(),
      },
    ));

    console.log(
      'PASS unread rules: cursor ownership, server-only markers, timestamp staging, Bureau/formation/team parity, assignment-scoped sessions, Gonflage parity, and unchanged event ACL',
    );
  } finally {
    await env.cleanup();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

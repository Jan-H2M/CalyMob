const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { isActiveMember } = require('../utils/memberStatus');
const {
  hasTeamAccess,
  isCountableRegistration,
  readStateSessionScopeId,
  sessionScopesForMember,
} = require('./canonicalUnreadBadge');
const {
  compareTimestamps,
  timestampParts,
  timestampToMillis,
} = require('./unreadTimestampAuthority');

const REGION = 'europe-west1';
const VALID_SECTIONS = new Set(['announcements', 'events', 'teams', 'sessions']);

function fail(code, message) {
  throw new HttpsError(code, message);
}

function validId(value) {
  return typeof value === 'string' && value.length > 0
    && value.length <= 500 && value !== '.' && value !== '..'
    && !value.includes('/');
}

function visibleSourcePath(input) {
  const { clubId, section, scopeId, visibleMessageId } = input;
  if (!validId(clubId) || !VALID_SECTIONS.has(section) || !validId(scopeId)) {
    fail('invalid-argument', 'Destination de lecture invalide.');
  }
  if (section === 'announcements') {
    return visibleMessageId == null
      ? `clubs/${clubId}/announcements/${scopeId}`
      : validId(visibleMessageId)
        ? `clubs/${clubId}/announcements/${scopeId}/replies/${visibleMessageId}`
        : fail('invalid-argument', 'Réponse visible invalide.');
  }
  if (!validId(visibleMessageId)) {
    fail('invalid-argument', 'Message visible requis.');
  }
  if (section === 'events') {
    return `clubs/${clubId}/operations/${scopeId}/messages/${visibleMessageId}`;
  }
  if (section === 'teams') {
    return `clubs/${clubId}/team_channels/${scopeId}/messages/${visibleMessageId}`;
  }
  if (!validId(input.sessionId)
    || !['accueil', 'encadrants', 'niveau'].includes(input.groupType)
    || (input.groupType === 'niveau' && !validId(input.groupLevel))) {
    fail('invalid-argument', 'Discussion de séance invalide.');
  }
  const expectedScope = readStateSessionScopeId(
    input.sessionId,
    input.groupType,
    input.groupLevel,
  );
  if (expectedScope !== scopeId) {
    fail('invalid-argument', 'Portée de séance incohérente.');
  }
  return `clubs/${clubId}/piscine_sessions/${input.sessionId}/messages/${visibleMessageId}`;
}

function visibleCreateTime(snapshot) {
  const timestamp = timestampParts(snapshot?.createTime)
    ? snapshot.createTime
    : snapshot?.data()?.__test_create_time;
  if (!timestampParts(timestamp)) {
    fail('failed-precondition', 'Horodatage serveur du contenu indisponible.');
  }
  return timestamp;
}

async function acknowledgeVisibleUnreadCursor({
  db,
  uid,
  input,
  serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp(),
}) {
  if (input?.memberId !== uid) {
    fail('permission-denied', 'Le membre demandé ne correspond pas à la session.');
  }
  const sourcePath = visibleSourcePath(input);
  const memberPath = `clubs/${input.clubId}/members/${uid}`;
  const memberRef = db.doc(memberPath);
  const sourceRef = db.doc(sourcePath);
  const scopeCollection = {
    announcements: 'items',
    events: 'conversations',
    teams: 'channels',
    sessions: 'chats',
  }[input.section];
  const cursorRef = db.doc(
    `${memberPath}/read_state/${input.section}/${scopeCollection}/${input.scopeId}`,
  );

  let audienceRef = null;
  let registrationsQuery = null;
  if (input.section === 'teams') {
    audienceRef = db.doc(`clubs/${input.clubId}/team_channels/${input.scopeId}`);
  } else if (input.section === 'sessions') {
    audienceRef = db.doc(`clubs/${input.clubId}/piscine_sessions/${input.sessionId}`);
  } else if (input.section === 'events') {
    audienceRef = db.doc(`clubs/${input.clubId}/operations/${input.scopeId}`);
    registrationsQuery = db.collection(
      `clubs/${input.clubId}/operations/${input.scopeId}/inscriptions`,
    ).where('membre_id', '==', uid);
  }

  return db.runTransaction(async transaction => {
    const reads = await Promise.all([
      transaction.get(memberRef),
      transaction.get(sourceRef),
      transaction.get(cursorRef),
      audienceRef ? transaction.get(audienceRef) : Promise.resolve(null),
      registrationsQuery ? transaction.get(registrationsQuery) : Promise.resolve(null),
    ]);
    const [member, source, cursor, audience, registrations] = reads;
    if (!member.exists || !isActiveMember(member.data() || {})) {
      fail('permission-denied', 'Un membre actif du club est requis.');
    }
    if (!source.exists) fail('not-found', 'Le contenu visible n’existe plus.');

    const memberData = member.data() || {};
    if (input.section === 'teams') {
      const channel = audience?.exists ? audience.data() || {} : {};
      if (!hasTeamAccess(memberData, { ...channel, id: input.scopeId })) {
        fail('permission-denied', 'Accès à cette équipe refusé.');
      }
    }
    if (input.section === 'events') {
      const eligible = (registrations?.docs || [])
        .some(doc => isCountableRegistration(doc.data() || {}));
      if (!audience?.exists || !eligible) {
        fail('permission-denied', 'Participation à cet événement requise.');
      }
    }
    if (input.section === 'sessions') {
      const allowed = audience?.exists
        && sessionScopesForMember(audience.data() || {}, uid)
          .some(([type, level]) => type === input.groupType
            && (type !== 'niveau' || level === input.groupLevel));
      if (!allowed) {
        fail('permission-denied', 'Affectation à cette discussion requise.');
      }
    }

    const sourceData = source.data() || {};
    if (input.section === 'sessions'
      && (sourceData.group_type !== input.groupType
        || (input.groupType === 'niveau'
          && sourceData.group_level !== input.groupLevel))) {
      fail('permission-denied', 'Le message ne correspond pas à cette discussion.');
    }
    const target = visibleCreateTime(source);
    const existing = cursor.data()?.last_seen_at;
    if (timestampParts(existing) && compareTimestamps(existing, target) >= 0) {
      return {
        status: 'already-seen',
        visibleThroughMs: timestampToMillis(existing),
      };
    }
    transaction.set(cursorRef, {
      last_seen_at: target,
      updated_at: serverTimestamp(),
    });
    return {
      status: 'acknowledged',
      visibleThroughMs: timestampToMillis(target),
    };
  });
}

const acknowledgeVisibleUnreadCursorV1 = onCall(
  { region: REGION, timeoutSeconds: 15, memory: '256MiB', maxInstances: 40 },
  async request => {
    if (!request.auth?.uid) fail('unauthenticated', 'Authentification requise.');
    return acknowledgeVisibleUnreadCursor({
      db: admin.firestore(),
      uid: request.auth.uid,
      input: request.data || {},
    });
  },
);

module.exports = {
  acknowledgeVisibleUnreadCursorV1,
  acknowledgeVisibleUnreadCursor,
  visibleSourcePath,
  visibleCreateTime,
};

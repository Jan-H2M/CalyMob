const { usesUnreadTimestampV2 } = require('./unreadTimestampFeatureFlag');
const { eventUnreadUntil, isUnreadEligibleEvent } = require('./eventUnreadPolicy');
const {
  compareTimestamps,
  newestTimestamp,
  timestampParts,
} = require('./unreadTimestampAuthority');

const MAX_CONCURRENCY = 8;

function newest(...values) {
  return newestTimestamp(...values);
}

function readStateSessionScopeId(sessionId, groupType, groupLevel) {
  return groupLevel ? `${sessionId}__${groupType}__${groupLevel}` : `${sessionId}__${groupType}`;
}

function isCountableRegistration(data = {}) {
  const status = String(data.registration_status || '').trim().toLowerCase();
  return !['canceled', 'waitlisted', 'withdrawn'].includes(status);
}

function normalizedRoles(member = {}) {
  return new Set((member.clubStatuten || []).map((raw) => String(raw || '').trim().toLowerCase()).map((role) => {
    if (['e', 'encadrant', 'encadrants', 'encadrant carrière'].includes(role)) return 'encadrant';
    if (['ca', 'conseil administration', 'comite', 'comité'].includes(role)) return 'ca';
    if (['a', 'accueil'].includes(role)) return 'accueil';
    if (['g', 'gonflage'].includes(role)) return 'gonflage';
    if (['bs', 'banque signature'].includes(role)) return 'bs';
    return role;
  }));
}

const TEAM_CHANNEL_TYPE_BY_ID = Object.freeze({
  general: 'general',
  equipe_ca: 'ca',
  equipe_accueil: 'accueil',
  equipe_encadrants: 'encadrants',
  equipe_gonflage: 'gonflage',
  bureau: 'bureau',
  formation_1_etoile: 'formation_1_etoile',
  formation_2_etoiles: 'formation_2_etoiles',
  formation_3_etoiles: 'formation_3_etoiles',
  formation_4_etoiles: 'formation_4_etoiles',
  formation_AM: 'formation_AM',
});

function teamChannelTypeForId(channelId) {
  return TEAM_CHANNEL_TYPE_BY_ID[channelId] || 'unknown';
}

function hasTeamAccess(member = {}, channel = {}) {
  const channelId = String(channel.id || channel.channel_id || '');
  const type = (channelId
    ? teamChannelTypeForId(channelId)
    : String(channel.type || channel.channel_type || 'unknown')).toLowerCase();
  const roles = normalizedRoles(member);
  const rawRoles = new Set(Array.isArray(member.clubStatuten) ? member.clubStatuten : []);
  const admin = ['admin', 'superadmin'].includes(String(member.app_role || '').toLowerCase());
  if (type === 'bureau') {
    return ['BS', 'bs', 'Banque Signature', 'banque signature']
      .some(role => rawRoles.has(role));
  }
  if (admin) return true;
  if (type === 'general') return true;
  if (type === 'ca') {
    return ['ca', 'CA', 'comite', 'Comite', 'comité', 'Comité']
      .some(role => rawRoles.has(role));
  }
  if (type === 'accueil') {
    return ['accueil', 'Accueil', 'A'].some(role => rawRoles.has(role));
  }
  if (type === 'gonflage') return roles.has('gonflage');
  if (type.startsWith('formation_')) {
    if (member.formation_active !== true) return false;
    const target = formationTargetForMember(member);
    return (type.includes('1') && target === '1*') || (type.includes('2') && target === '2*') ||
      (type.includes('3') && target === '3*') || (type.includes('4') && target === '4*') ||
      (type.includes('am') && target === 'AM');
  }
  return type === 'encadrants' && [
    'encadrant', 'Encadrant', 'encadrants', 'Encadrants', 'E',
    'encadrant carrière', 'Encadrant Carrière',
  ].some(role => rawRoles.has(role));
}

function normalizeFormationTarget(value) {
  if (['1*', '1', 'P1'].includes(value)) return '1*';
  if (['2*', '2', 'P2'].includes(value)) return '2*';
  if (['3*', '3', 'P3'].includes(value)) return '3*';
  if (['4*', '4', 'P4'].includes(value)) return '4*';
  return value === 'AM' ? 'AM' : null;
}

function formationTargetForMember(member = {}) {
  const explicit = normalizeFormationTarget(member.target_formation_level);
  if (explicit) return explicit;
  const code = member.plongeur_code;
  if (code === 'NB') return '1*';
  if (['P1', '1', '1*'].includes(code)) return '2*';
  if (['P2', '2', '2*'].includes(code)) return '3*';
  if (['P3', '3', '3*'].includes(code)) return '4*';
  if (['P4', '4', '4*'].includes(code)) return 'AM';
  return null;
}

const TEAM_CHANNEL_DEFAULTS = [
  ['general', 'general'], ['equipe_ca', 'ca'], ['equipe_accueil', 'accueil'],
  ['equipe_encadrants', 'encadrants'], ['equipe_gonflage', 'gonflage'], ['bureau', 'bureau'],
  ['formation_1_etoile', 'formation_1_etoile'], ['formation_2_etoiles', 'formation_2_etoiles'],
  ['formation_3_etoiles', 'formation_3_etoiles'], ['formation_4_etoiles', 'formation_4_etoiles'],
  ['formation_AM', 'formation_AM'],
];

function visibleTeamChannelDefaults(member = {}) {
  return TEAM_CHANNEL_DEFAULTS.filter(([, type]) => hasTeamAccess(member, { type }));
}

async function teamChannelsForMember(club, member) {
  const collection = club.collection('team_channels');
  const stored = await collection.get();
  const channels = new Map(stored.docs
    .filter((channel) => hasTeamAccess(member, { ...channel.data(), id: channel.id }))
    .map((channel) => [channel.id, { id: channel.id, ref: channel.ref }]));
  // TeamChannelService emits default/fallback channels before the parent docs
  // exist. Firestore permits messages in those subcollections, so include the
  // same IDs for canonical counting (onNewTeamMessage uses the same fallback).
  visibleTeamChannelDefaults(member).forEach(([id]) => {
    if (!channels.has(id)) channels.set(id, { id, ref: collection.doc(id) });
  });
  return [...channels.values()];
}

function assignmentContains(raw, memberId) {
  return Array.isArray(raw) && raw.some(item => item && String(item.membre_id || '') === memberId);
}

function sessionScopesForMember(session = {}, memberId = '') {
  const scopes = [];
  if (assignmentContains(session.accueil, memberId)) scopes.push(['accueil', null]);
  let anyEncadrant = assignmentContains(session.baptemes, memberId);
  Object.entries(session.niveaux || {}).forEach(([levelId, level]) => {
    let assigned = assignmentContains(level?.encadrants, memberId);
    Object.values(level?.courses_by_hour || level?.coursesByHour || {}).forEach(courses => {
      (Array.isArray(courses) ? courses : []).forEach(course => {
        assigned ||= assignmentContains(course?.encadrants, memberId);
      });
    });
    if (assigned) {
      anyEncadrant = true;
      scopes.push(['niveau', levelId]);
    }
  });
  if (anyEncadrant) scopes.splice(scopes[0]?.[0] === 'accueil' ? 1 : 0, 0, ['encadrants', null]);
  return scopes;
}

async function bounded(items, mapper) {
  const results = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      results.push(await mapper(item));
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, items.length) }, worker));
  return results;
}

async function countMessages(ref, cursor, timestampV2) {
  if (!cursor) throw new Error('Canonical unread cursor is missing');
  const query = ref.where(timestampV2 ? 'unread_created_at' : 'created_at', '>', cursor);
  const aggregate = await query.count().get();
  return aggregate.data().count || 0;
}

async function getCanonicalUnreadBreakdown({ db, clubId, memberId, now = new Date() }) {
  const club = db.collection('clubs').doc(clubId);
  const memberSnapshot = await club.collection('members').doc(memberId).get();
  if (!memberSnapshot.exists) return { events: 0, announcements: 0, teams: 0, sessions: 0, communication: 0, total: 0 };
  const member = memberSnapshot.data() || {};
  const timestampV2 = await usesUnreadTimestampV2(db, clubId, memberId);
  const state = memberSnapshot.ref.collection('read_state');
  const [announcementCursor, eventsRoot, teamsRoot, sessionsRoot] = await Promise.all([
    state.doc('announcements').get(), state.doc('events').get(), state.doc('teams').get(), state.doc('sessions').get(),
  ]);
  const announcementLastSeen = newest(announcementCursor.data()?.last_seen_at);
  const rootCursor = (snapshot) => newest(snapshot.data()?.global_last_seen_at);

  if (!announcementCursor.exists || !announcementLastSeen
    || !eventsRoot.exists || !rootCursor(eventsRoot)
    || !teamsRoot.exists || !rootCursor(teamsRoot)
    || !sessionsRoot.exists || !rootCursor(sessionsRoot)) {
    throw new Error('Canonical unread roots are incomplete');
  }

  let announcements = 0;
  const allAnnouncements = club.collection('announcements');
  const snapshot = await allAnnouncements.get();
  const values = await bounded(snapshot.docs.filter((doc) => {
    const data = doc.data() || {};
    return data.deleted_at == null && data.visibility !== 'deleted';
  }), async (doc) => {
    const data = doc.data() || {};
    const activity = timestampV2
      ? newest(data.unread_activity_at)
      : newest(data.last_activity_at, data.last_reply_at, data.created_at);
    if (!activity) throw new Error(`Announcement ${doc.id} has no valid activity`);
    const scoped = await announcementCursor.ref.collection('items').doc(doc.id).get();
    const cursor = newest(announcementLastSeen, scoped.data()?.last_seen_at);
    return compareTimestamps(activity, cursor) > 0 ? 1 : 0;
  });
  announcements = values.reduce((sum, count) => sum + count, 0);

  const inscriptions = await db.collectionGroup('inscriptions').where('membre_id', '==', memberId).get();
  const uniqueOperations = new Map();
  inscriptions.docs.filter((doc) => isCountableRegistration(doc.data() || {})).forEach((inscription) => {
    const operationRef = inscription.ref.parent.parent;
    if (operationRef && operationRef.parent.parent.id === clubId) {
      uniqueOperations.set(operationRef.path, operationRef);
    }
  });
  const eventItems = await bounded([...uniqueOperations.values()], async (operationRef) => {
    const operation = await operationRef.get();
    if (!operation.exists || !isUnreadEligibleEvent(operation.data(), now)) return 0;
    const scoped = await eventsRoot.ref.collection('conversations').doc(operation.id).get();
    return countMessages(operationRef.collection('messages'), newest(rootCursor(eventsRoot), scoped.data()?.last_seen_at), timestampV2);
  });
  const events = eventItems.reduce((sum, count) => sum + count, 0);

  const channels = await teamChannelsForMember(club, member);
  const teamItems = await bounded(channels, async (channel) => {
    const scoped = await teamsRoot.ref.collection('channels').doc(channel.id).get();
    return countMessages(channel.ref.collection('messages'), newest(rootCursor(teamsRoot), scoped.data()?.last_seen_at), timestampV2);
  });
  const teams = teamItems.reduce((sum, count) => sum + count, 0);

  const sessionsSnapshot = await club.collection('piscine_sessions').where('statut', '==', 'publie').get();
  const sessionItems = await bounded(sessionsSnapshot.docs.flatMap((session) => sessionScopesForMember(session.data() || {}, memberId)
    .map(([groupType, groupLevel]) => ({ session, groupType, groupLevel }))), async ({ session, groupType, groupLevel }) => {
    const scopeId = readStateSessionScopeId(session.id, groupType, groupLevel);
    const scoped = await sessionsRoot.ref.collection('chats').doc(scopeId).get();
    const messages = session.ref.collection('messages').where('group_type', '==', groupType);
    const query = groupLevel ? messages.where('group_level', '==', groupLevel) : messages;
    return countMessages(query, newest(rootCursor(sessionsRoot), scoped.data()?.last_seen_at), timestampV2);
  });
  const sessions = sessionItems.reduce((sum, count) => sum + count, 0);
  const communication = announcements + teams + sessions;
  return { events, announcements, teams, sessions, communication, total: events + communication };
}

module.exports = { getCanonicalUnreadBreakdown, eventUnreadUntil, isUnreadEligibleEvent, isCountableRegistration, readStateSessionScopeId, newest, hasTeamAccess, teamChannelTypeForId, formationTargetForMember, visibleTeamChannelDefaults, sessionScopesForMember, assignmentContains };

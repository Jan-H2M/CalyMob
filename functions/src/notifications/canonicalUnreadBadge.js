const { EVENT_EXPIRY_GRACE_DAYS } = require('../utils/constants');

const MAX_CONCURRENCY = 8;
const BRUSSELS = 'Europe/Brussels';

function asDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  return value instanceof Date ? value : null;
}

function newest(...values) {
  const dates = values.map(asDate).filter(Boolean);
  return dates.length ? new Date(Math.max(...dates.map((value) => value.getTime()))) : null;
}

function readStateSessionScopeId(sessionId, groupType, groupLevel) {
  return groupLevel ? `${sessionId}__${groupType}__${groupLevel}` : `${sessionId}__${groupType}`;
}

// Calendar addition, rather than 24-hour addition, preserves the Europe/Brussels
// date across DST transitions.
function eventUnreadUntil(dateFin) {
  const date = asDate(dateFin);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BRUSSELS, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
  const localUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1,
    Number(parts.day) + EVENT_EXPIRY_GRACE_DAYS, Number(parts.hour), Number(parts.minute), Number(parts.second));
  // Convert the intended Brussels wall-clock time back to UTC. A second pass
  // handles a DST transition between the provisional UTC instant and local time.
  const offsetAt = (instant) => {
    const rendered = new Intl.DateTimeFormat('en-CA', {
      timeZone: BRUSSELS, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant)).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
    return Date.UTC(rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute, rendered.second) - instant;
  };
  let result = localUtc - offsetAt(localUtc);
  result = localUtc - offsetAt(result);
  return new Date(result + date.getMilliseconds());
}

function isUnreadEligibleEvent(operation = {}, now = new Date()) {
  if (operation.statut === 'supprime') return false;
  const until = eventUnreadUntil(operation.date_fin);
  return !until || now.getTime() <= until.getTime();
}

function isCountableRegistration(data = {}) {
  return !['canceled', 'waitlisted', 'withdrawn'].includes(data.registration_status);
}

function normalizedRoles(member = {}) {
  return new Set((member.clubStatuten || []).map((raw) => String(raw || '').trim().toLowerCase()).map((role) => {
    if (['e', 'encadrant', 'encadrants', 'encadrant carrière'].includes(role)) return 'encadrant';
    if (['a', 'accueil'].includes(role)) return 'accueil';
    if (['g', 'gonflage'].includes(role)) return 'gonflage';
    if (['bs', 'banque signature'].includes(role)) return 'bs';
    return role;
  }));
}

function hasTeamAccess(member = {}, channel = {}) {
  const type = String(channel.type || channel.channel_type || channel.id || 'general').toLowerCase();
  const roles = normalizedRoles(member);
  const admin = ['admin', 'superadmin'].includes(String(member.app_role || '').toLowerCase()) || roles.has('admin');
  if (type === 'bureau') return roles.has('bs'); // matches Dart's no-admin override
  if (admin) return true;
  if (type === 'general') return true;
  if (type === 'ca') return roles.has('ca');
  if (type === 'accueil') return roles.has('accueil');
  if (type === 'gonflage') return roles.has('gonflage');
  if (type.startsWith('formation_')) {
    if (roles.has('encadrant')) return true;
    // Keep server counts aligned with Flutter ClubRoleUtils: an explicit
    // target grants formation-channel access even when formation_active is
    // false; otherwise derive the target from plongeur_code.
    // See lib/utils/club_role_utils.dart#getVisibleTeamChannelTypes.
    const target = formationTargetForMember(member);
    return (type.includes('1') && target === '1*') || (type.includes('2') && target === '2*') ||
      (type.includes('3') && target === '3*') || (type.includes('4') && target === '4*') ||
      (type.includes('am') && target === 'AM');
  }
  return roles.has('encadrant');
}

function normalizeFormationTarget(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/★/g, '*').replace(/_/g, ' ');
  if (!raw) return null;
  if (raw.includes('AM') || raw === 'AIDE MONITEUR') return 'AM';
  if (raw.includes('1') || raw.includes('P1')) return '1*';
  if (raw.includes('2') || raw.includes('P2')) return '2*';
  if (raw.includes('3') || raw.includes('P3')) return '3*';
  if (raw.includes('4') || raw.includes('P4')) return '4*';
  return null;
}

function formationTargetForMember(member = {}) {
  const explicit = normalizeFormationTarget(member.target_formation_level);
  if (explicit) return explicit;
  const code = String(member.plongeur_code || '').trim().toUpperCase().replace(/★/g, '*')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (code === 'NB' || code.includes('NON BREVETE') || code.includes('SANS BREVET')
    || code.includes('DEBUTANT') || code.includes('BAPTEME') || code.includes('INITIATION')) return '1*';
  if (code === 'P1' || code === '1' || code === '1*' || code.includes('PLONGEUR 1')) return '2*';
  if (code === 'P2' || code === '2' || code === '2*' || code.includes('PLONGEUR 2')) return '3*';
  if (code === 'P3' || code === '3' || code === '3*' || code.includes('PLONGEUR 3')) return '4*';
  if (code === 'P4' || code === '4' || code === '4*' || code.includes('PLONGEUR 4')) return 'AM';
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

function sessionScopesForMember(member = {}) {
  const scopes = [];
  const roles = normalizedRoles(member);
  if (roles.has('accueil')) scopes.push(['accueil', null]);
  if (roles.has('encadrant')) scopes.push(['encadrants', null], ['niveau', null]);
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

async function countMessages(ref, cursor) {
  if (!cursor) return 0; // migrated/first-use roots prevent historical fallback
  const query = ref.where('created_at', '>', cursor);
  const aggregate = await query.count().get();
  return aggregate.data().count || 0;
}

async function getCanonicalUnreadBreakdown({ db, clubId, memberId, now = new Date() }) {
  const club = db.collection('clubs').doc(clubId);
  const memberSnapshot = await club.collection('members').doc(memberId).get();
  if (!memberSnapshot.exists) return { events: 0, announcements: 0, teams: 0, sessions: 0, communication: 0, total: 0 };
  const member = memberSnapshot.data() || {};
  const state = memberSnapshot.ref.collection('read_state');
  const [announcementCursor, eventsRoot, teamsRoot, sessionsRoot] = await Promise.all([
    state.doc('announcements').get(), state.doc('events').get(), state.doc('teams').get(), state.doc('sessions').get(),
  ]);
  const announcementLastSeen = newest(announcementCursor.data()?.last_seen_at);
  const rootCursor = (snapshot) => newest(snapshot.data()?.global_last_seen_at);

  let announcements = 0;
  if (announcementLastSeen) {
    const allAnnouncements = club.collection('announcements');
    const canonical = await allAnnouncements.where('visibility', '==', 'published')
      .where('last_activity_at', '>', announcementLastSeen).count().get();
    const legacySnapshots = await Promise.all([
      allAnnouncements.where('created_at', '>', announcementLastSeen).get(),
      allAnnouncements.where('last_reply_at', '>', announcementLastSeen).get(),
    ]);
    const legacyIds = new Set();
    legacySnapshots.forEach((snapshot) => snapshot.docs.forEach((doc) => {
      const data = doc.data() || {};
      const activity = newest(data.last_activity_at);
      // During coexistence, field maintenance may lag a writer. Include
      // legacy docs and published documents whose indexed activity is still
      // at/before the cursor, without double-counting canonical results.
      if (data.deleted_at == null && data.visibility !== 'deleted'
        && (data.visibility == null || !activity || activity <= announcementLastSeen)) {
        legacyIds.add(doc.id);
      }
    }));
    announcements = (canonical.data().count || 0) + legacyIds.size;
  }

  const inscriptions = await db.collectionGroup('inscriptions').where('membre_id', '==', memberId).get();
  const eventItems = await bounded(inscriptions.docs.filter((doc) => isCountableRegistration(doc.data() || {})), async (inscription) => {
    const operationRef = inscription.ref.parent.parent;
    if (!operationRef || operationRef.parent.parent.id !== clubId) return 0;
    const operation = await operationRef.get();
    if (!operation.exists || !isUnreadEligibleEvent(operation.data(), now)) return 0;
    const scoped = await eventsRoot.ref.collection('conversations').doc(operation.id).get();
    return countMessages(operationRef.collection('messages'), newest(rootCursor(eventsRoot), scoped.data()?.last_seen_at));
  });
  const events = eventItems.reduce((sum, count) => sum + count, 0);

  const channels = await teamChannelsForMember(club, member);
  const teamItems = await bounded(channels, async (channel) => {
    const scoped = await teamsRoot.ref.collection('channels').doc(channel.id).get();
    return countMessages(channel.ref.collection('messages'), newest(rootCursor(teamsRoot), scoped.data()?.last_seen_at));
  });
  const teams = teamItems.reduce((sum, count) => sum + count, 0);

  const sessionsSnapshot = await club.collection('piscine_sessions').where('statut', '==', 'publie').get();
  const sessionItems = await bounded(sessionsSnapshot.docs.flatMap((session) => sessionScopesForMember(member)
    .flatMap(([groupType, groupLevel]) => (groupType === 'niveau' ? Object.keys(session.data().niveaux || {}).map((level) => ({ session, groupType, groupLevel: level })) : [{ session, groupType, groupLevel }]))), async ({ session, groupType, groupLevel }) => {
    const scopeId = readStateSessionScopeId(session.id, groupType, groupLevel);
    const scoped = await sessionsRoot.ref.collection('chats').doc(scopeId).get();
    const messages = session.ref.collection('messages').where('group_type', '==', groupType);
    const query = groupLevel ? messages.where('group_level', '==', groupLevel) : messages;
    return countMessages(query, newest(rootCursor(sessionsRoot), scoped.data()?.last_seen_at));
  });
  const sessions = sessionItems.reduce((sum, count) => sum + count, 0);
  const communication = announcements + teams + sessions;
  return { events, announcements, teams, sessions, communication, total: events + communication };
}

module.exports = { getCanonicalUnreadBreakdown, eventUnreadUntil, isUnreadEligibleEvent, isCountableRegistration, readStateSessionScopeId, newest, hasTeamAccess, formationTargetForMember, visibleTeamChannelDefaults, sessionScopesForMember };

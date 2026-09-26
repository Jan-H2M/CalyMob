function assignmentIds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(item => String(item?.membre_id || '').trim())
    .filter(Boolean);
}

function levelEncadrantIds(level = {}) {
  const ids = new Set(assignmentIds(level.encadrants));
  Object.values(level.courses_by_hour || level.coursesByHour || {}).forEach(courses => {
    (Array.isArray(courses) ? courses : []).forEach(course => {
      assignmentIds(course?.encadrants).forEach(id => ids.add(id));
    });
  });
  return [...ids];
}

function sessionChatAcl(session = {}) {
  const accueil = [...new Set(assignmentIds(session.accueil))].sort();
  const encadrants = new Set(assignmentIds(session.baptemes));
  const niveaux = {};
  Object.entries(session.niveaux || {}).forEach(([levelId, level]) => {
    const ids = levelEncadrantIds(level).sort();
    niveaux[levelId] = ids;
    ids.forEach(id => encadrants.add(id));
  });
  return {
    accueil,
    encadrants: [...encadrants].sort(),
    niveaux,
  };
}

function sessionMessageRecipientIds(session, groupType, groupLevel, senderId) {
  const acl = sessionChatAcl(session);
  let candidates = [];
  if (groupType === 'accueil') candidates = acl.accueil;
  if (groupType === 'encadrants') candidates = acl.encadrants;
  if (groupType === 'niveau' && groupLevel) {
    candidates = acl.niveaux[groupLevel] || [];
  }
  return [...new Set(candidates)].filter(id => id !== senderId);
}

function sameSessionChatAcl(left, right) {
  return JSON.stringify(left || null) === JSON.stringify(right || null);
}

module.exports = {
  assignmentIds,
  levelEncadrantIds,
  sessionChatAcl,
  sessionMessageRecipientIds,
  sameSessionChatAcl,
};

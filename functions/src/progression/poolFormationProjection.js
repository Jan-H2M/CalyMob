'use strict';

const POOL_FORMATION_ROLES = new Set([
  'encadrant',
  'encadrants',
  'e',
  'encadrant carrière',
  'piscine',
  'p',
  'encadrants et assistants',
  'encadrant piscine',
]);

function normalizedText(value) {
  return String(value || '').trim().toLowerCase();
}

function isPoolExercise(code, description) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  const normalizedDescription = normalizedText(description);
  return normalizedCode.endsWith('.EXP') ||
    normalizedDescription.includes('piscine') ||
    normalizedDescription.includes('pool');
}

function targetCode(targetLevel) {
  switch (String(targetLevel || '').trim().toUpperCase()) {
    case '1':
    case '1*':
    case 'P1':
    case 'NB':
      return 'NB';
    case '2':
    case '2*':
    case 'P2':
      return 'P2';
    case '3':
    case '3*':
    case 'P3':
      return 'P3';
    case '4':
    case '4*':
    case 'P4':
      return 'P4';
    case 'AM':
    case 'MC':
    case 'MF':
    case 'MN':
      return String(targetLevel).trim().toUpperCase();
    default:
      return null;
  }
}

function matchesTarget(exercise, target) {
  if (!target) return true;
  const niveau = String(exercise && exercise.niveau || '').trim().toUpperCase();
  if (niveau) return niveau === target;
  const code = String(exercise && exercise.code || '').trim().toUpperCase();
  if (target === 'NB') return code.startsWith('P1.');
  if (target === 'P2' && code === 'P1.EXP') return true;
  return code.startsWith(`${target}.`);
}

function buildPoolFormationProjection(snapshot) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const exercises = source.exercises && typeof source.exercises === 'object'
    ? source.exercises
    : {};
  const target = targetCode(source.target_level);
  const states = new Map();

  function add(items, state, { filterTarget = true } = {}) {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      if (filterTarget && !matchesTarget(item, target)) continue;
      const code = String(item.code || '').trim().toUpperCase();
      const description = String(item.description || item.label || '').trim();
      if (!code || !isPoolExercise(code, description)) continue;
      const current = states.get(code);
      if (current == null || state < current) states.set(code, state);
    }
  }

  add(exercises.validated, 0);
  add(exercises.pending, 1);
  add(exercises.pending_claims, 1);
  add(exercises.remaining, 2, { filterTarget: false });

  let validated = 0;
  let pending = 0;
  let remaining = 0;
  for (const state of states.values()) {
    if (state === 0) validated += 1;
    if (state === 1) pending += 1;
    if (state === 2) remaining += 1;
  }
  const total = validated + pending + remaining;
  return {
    schema_version: 1,
    member_id: String(source.member_id || ''),
    piscine: {
      validated,
      pending,
      remaining,
      total,
      pct: total === 0 ? 0 : Math.round((validated / total) * 100),
    },
  };
}

function safeIdentity(directory) {
  const source = directory && typeof directory === 'object' ? directory : {};
  const consentInternalPhoto = source.consent_internal_photo === true;
  return {
    first_name: String(source.first_name || source.prenom || '').trim(),
    last_name: String(source.last_name || source.nom || '').trim(),
    photo_url: consentInternalPhoto && typeof source.photo_url === 'string'
      ? source.photo_url.trim() || null
      : null,
    consent_internal_photo: consentInternalPhoto,
  };
}

function buildPoolFormationDto(snapshot, directory) {
  return {
    ...buildPoolFormationProjection(snapshot),
    identity: safeIdentity(directory),
  };
}

function hasPoolFormationAccess(member) {
  const source = member && typeof member === 'object' ? member : {};
  const appRole = normalizedText(source.app_role);
  if (appRole === 'admin' || appRole === 'superadmin') return true;
  const roles = Array.isArray(source.clubStatuten) ? source.clubStatuten : [];
  return roles.some((role) => POOL_FORMATION_ROLES.has(normalizedText(role)));
}

module.exports = {
  buildPoolFormationDto,
  buildPoolFormationProjection,
  hasPoolFormationAccess,
  isPoolExercise,
};

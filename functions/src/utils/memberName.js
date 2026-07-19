'use strict';

function readString(data, keys) {
  for (const key of keys) {
    const value = data?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function memberFirstName(data = {}) {
  return readString(data, ['first_name', 'firstName', 'prenom']);
}

function memberLastName(data = {}) {
  return readString(data, ['last_name', 'lastName', 'nom']);
}

function memberDisplayName(data = {}, fallback = 'Membre') {
  const explicit = readString(data, ['display_name', 'displayName']);
  if (explicit) return explicit;
  const constructed = `${memberFirstName(data)} ${memberLastName(data)}`.trim();
  return constructed || readString(data, ['email']) || fallback;
}

module.exports = {
  memberDisplayName,
  memberFirstName,
  memberLastName,
};

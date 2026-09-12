/**
 * Privacy boundary for member data consumed by CalyMob.
 *
 * `members/{uid}` remains the private source of truth. This trigger projects
 * only the fields needed by the club directory and by authorised activity
 * staff into two separate collections. The function never logs member data.
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { memberDisplayName } = require('../utils/memberName');
const { resolveMemberStatus } = require('../utils/memberStatus');

const FUNCTION_REGION = 'europe-west1';
const CLUB_TIME_ZONE = 'Europe/Brussels';
const birthdayDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLUB_TIME_ZONE,
  month: '2-digit',
  day: '2-digit',
});

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim())
        .map((item) => item.trim())
    : [];
}

function asDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function birthdayParts(data) {
  if (data.share_birthday === false) {
    return { birth_month: null, birth_day: null };
  }
  const date = asDate(data.birth_date) || asDate(data.date_naissance);
  if (!date) return { birth_month: null, birth_day: null };
  const parts = Object.fromEntries(
    birthdayDateFormatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return { birth_month: Number(parts.month), birth_day: Number(parts.day) };
}

function resolvedMemberStatus(data) {
  return resolveMemberStatus(data, { defaultStatus: 'active' });
}

function buildMemberDirectoryProjection(data) {
  const firstName = nonEmptyString(data.first_name) ||
    nonEmptyString(data.prenom) || nonEmptyString(data.firstName) || '';
  const lastName = nonEmptyString(data.last_name) ||
    nonEmptyString(data.nom) || nonEmptyString(data.lastName) || '';
  const displayName = memberDisplayName(data, `${firstName} ${lastName}`.trim());
  const shareEmail = data.share_email === true;
  const sharePhone = data.share_phone === true;
  const consentInternalPhoto = data.consent_internal_photo === true;

  return {
    first_name: firstName,
    last_name: lastName,
    display_name: displayName,
    // Legacy aliases remain for older mobile readers during the rollout.
    prenom: firstName,
    nom: lastName,
    displayName,
    plongeur_code: nonEmptyString(data.plongeur_code),
    plongeur_niveau: nonEmptyString(data.plongeur_niveau) ||
      nonEmptyString(data.niveau_plongee),
    fonction_defaut: nonEmptyString(data.fonction_defaut),
    clubStatuten: stringList(data.clubStatuten),
    formation_active: data.formation_active === true,
    target_formation_level: nonEmptyString(data.target_formation_level),
    member_status: resolvedMemberStatus(data),
    is_test_account: data.is_test_account === true,
    share_email: shareEmail,
    share_phone: sharePhone,
    share_birthday: data.share_birthday !== false,
    consent_internal_photo: consentInternalPhoto,
    email: shareEmail ? nonEmptyString(data.email) : null,
    phone_number: sharePhone ? nonEmptyString(data.phone_number) : null,
    photo_url: consentInternalPhoto ? nonEmptyString(data.photo_url) : null,
    ...birthdayParts(data),
    updated_at: FieldValue.serverTimestamp(),
  };
}

function buildOperationalStatusProjection(data) {
  return {
    member_status: resolvedMemberStatus(data),
    cotisation_validite: data.cotisation_validite || null,
    certificat_medical_validite: data.certificat_medical_validite || null,
    assurance_validite: data.assurance_validite || null,
    membership_category_code: nonEmptyString(data.membership_category_code),
    has_pending_medical: data.has_pending_medical === true,
    updated_at: FieldValue.serverTimestamp(),
  };
}

const syncMemberProjections = onDocumentWritten(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/members/{memberId}',
  },
  async (event) => {
    const { clubId, memberId } = event.params;
    const db = admin.firestore();
    const clubRef = db.collection('clubs').doc(clubId);
    const memberRef = clubRef.collection('members').doc(memberId);
    const directoryRef = clubRef.collection('member_directory').doc(memberId);
    const statusRef = clubRef.collection('member_operational_status').doc(memberId);

    // Firestore events are delivered at least once and are not ordered. Read
    // the canonical member again in a transaction so an older trigger can
    // never restore a stale public birthday after an atomic opt-out.
    await db.runTransaction(async transaction => {
      const current = await transaction.get(memberRef);
      if (!current.exists) {
        transaction.delete(directoryRef);
        transaction.delete(statusRef);
        return;
      }

      const data = current.data() || {};
      transaction.set(directoryRef, buildMemberDirectoryProjection(data));
      transaction.set(statusRef, buildOperationalStatusProjection(data));
    });
  }
);

module.exports = {
  syncMemberProjections,
  buildMemberDirectoryProjection,
  buildOperationalStatusProjection,
  birthdayParts,
  resolvedMemberStatus,
};

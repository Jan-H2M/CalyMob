'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue, Filter } = require('firebase-admin/firestore');
const { normalizeGroupKey } = require('../utils/groupKey');

const fields = ['assignedLevel', 'assignedCourseId', 'assignedToMemberId',
  'groupAssignment', 'hoursReport', 'outcome', 'sentToReserve'];
const hours = ['1ere_heure', '2eme_heure'];
function normalized(value) {
  if (value == null) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (Array.isArray(value)) return value.map(normalized);
  if (typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, normalized(value[key])])
  );
  return value;
}
function assignmentState(value) {
  return Object.fromEntries(fields.map(key => [key, normalized(value[key])]));
}
function mayCorrect(member) {
  const roles = (member.clubStatuten || []).map(v => String(v).trim().toLowerCase());
  if (['admin', 'superadmin'].includes(member.app_role)) return true;
  return ['MC', 'MF', 'MN'].includes(String(member.plongeur_code || '').trim().toUpperCase()) &&
    roles.some(v => ['encadrant', 'encadrants', 'e', 'encadrant carrière'].includes(v));
}
function choices(session) {
  const result = [];
  for (const [level, plan] of Object.entries(session.niveaux || {})) {
    const byHour = plan.courses_by_hour || plan.coursesByHour;
    if (byHour) {
      for (const hour of hours) {
        const courses = byHour[hour] || [];
        courses.forEach((course, index) => {
          if (!course.id) return;
          result.push({ level, hour, courseId: course.id,
            groupNumber: Number.isInteger(course.order) ? course.order + 1 : index + 1,
            theme: course.theme || '', monitors: course.encadrants || [] });
        });
      }
    } else {
      for (const hour of hours) {
        const theme = plan[hour === hours[0] ? 'theme_1ere_heure' : 'theme_2eme_heure'] || plan.theme || '';
        const monitors = (plan.encadrants || []).filter(p => p.heure === hour);
        if (theme || monitors.length) result.push({ level, hour,
          courseId: `${level}_legacy`, groupNumber: 1, theme, monitors });
      }
    }
  }
  return result;
}
function buildPatch(attendance, option) {
  const group = {
    level: option.level, groupNumber: option.groupNumber,
    groupKey: normalizeGroupKey(`${option.level}-${option.groupNumber}`),
    course_id: option.courseId, hourKey: option.hour,
    themeSnapshot: option.theme,
    moniteurIds: [...new Set(option.monitors.map(p => p.membre_id).filter(Boolean))],
    moniteurNames: option.monitors.map(p => `${p.membre_prenom || ''} ${p.membre_nom || ''}`.trim()).filter(Boolean),
    validatorId: option.validatorId || null,
  };
  const report = { ...(attendance.hoursReport || {}) };
  if (attendance.outcome && attendance.outcome !== 'training' && report[option.hour]?.role !== 'eleve') {
    throw new HttpsError('failed-precondition', 'Cette présence ne comporte pas de participation élève à cette heure.');
  }
  if (report[option.hour]?.role && report[option.hour].role !== 'eleve') {
    throw new HttpsError('failed-precondition', 'Cette heure comporte déjà un rôle différent.');
  }
  report[option.hour] = { ...(report[option.hour] || {}), activity: 'formation', role: 'eleve', group };
  // Keep the independent other hour intact, and retain a coherent legacy view.
  const first = hours.map(hour => report[hour]).find(entry => entry?.role === 'eleve' && entry.group);
  return { assignedLevel: option.level, assignedCourseId: option.courseId,
    assignedToMemberId: null, sentToReserve: false,
    hoursReport: report, groupAssignment: first.group };
}
function validId(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value); }

async function executeCorrection(db, uid, data) {
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  const { clubId, memberId, sessionId, operationId, level, hour, courseId, expectedState } = data || {};
  if (![clubId, memberId, sessionId, operationId].every(validId) ||
      !hours.includes(hour) || typeof level !== 'string' || typeof courseId !== 'string' ||
      !expectedState || typeof expectedState !== 'object' || Array.isArray(expectedState)) {
    throw new HttpsError('invalid-argument', 'Séance, groupe et état initial valides requis.');
  }
  const club = db.collection('clubs').doc(clubId);
  const sessionRef = club.collection('piscine_sessions').doc(sessionId);
  const attendees = sessionRef.collection('attendees');
  const auditRef = sessionRef.collection('group_corrections').doc(operationId);
  const requested = { memberId, level, hour, courseId };
  return db.runTransaction(async tx => {
    const actor = await tx.get(club.collection('members').doc(uid));
    if (!actor.exists || !mayCorrect(actor.data())) throw new HttpsError('permission-denied', 'Moniteur encadrant requis.');
    const audit = await tx.get(auditRef);
    if (audit.exists) {
      const previous = audit.data();
      if (previous.actorUid !== uid || JSON.stringify(normalized(previous.requested)) !== JSON.stringify(normalized(requested))) {
        throw new HttpsError('already-exists', 'Identifiant de correction déjà utilisé.');
      }
      return { corrected: true, replay: true };
    }
    const session = await tx.get(sessionRef);
    if (!session.exists || !session.data().date?.toMillis || session.data().type === 'theorie') {
      throw new HttpsError('failed-precondition', 'Séance piscine datée requise.');
    }
    const options = choices(session.data()).filter(o => o.level === level && o.hour === hour && o.courseId === courseId);
    if (options.length !== 1) throw new HttpsError('failed-precondition', 'Groupe absent ou ambigu dans cette séance.');
    const option = options[0];
    const groupKey = normalizeGroupKey(`${option.level}-${option.groupNumber}`);
    const groupDoc = await tx.get(sessionRef.collection('groups').doc(groupKey));
    const override = groupDoc.exists ? groupDoc.data() : {};
    const overrideMatches = (!override.level || override.level === level) &&
      (!override.hourKey || override.hourKey === hour) && (!override.heure || override.heure === hour) &&
      (!override.course_id || override.course_id === courseId);
    const explicit = overrideMatches ? override.supervisorId || override.validatorId : null;
    option.monitors = option.monitors.filter(p => p.membre_id !== memberId);
    option.validatorId = (explicit && explicit !== memberId ? explicit : null) ||
      option.monitors.map(p => p.membre_id).find(Boolean) || null;
    const matches = await tx.get(attendees.where(Filter.or(
      Filter.where('memberId', '==', memberId), Filter.where('membre_id', '==', memberId), Filter.where('member_id', '==', memberId)
    )));
    const canonical = await tx.get(attendees.doc(memberId));
    const records = new Map(matches.docs.map(doc => [doc.id, doc]));
    if (canonical.exists) records.set(canonical.id, canonical);
    if (!records.size || ![...records.values()].some(doc => doc.data().scannedAt || doc.data().checkinCompletedAt)) {
      throw new HttpsError('failed-precondition', 'Présence enregistrée requise.');
    }
    const before = {};
    for (const doc of records.values()) {
      const value = doc.data();
      const identity = value.memberId || value.membre_id || value.member_id || doc.id;
      if (identity !== memberId || value.isGuest) throw new HttpsError('failed-precondition', 'Identité de participation ambiguë.');
      before[doc.id] = assignmentState(value);
    }
    if (JSON.stringify(normalized(before)) !== JSON.stringify(normalized(expectedState))) {
      throw new HttpsError('aborted', 'La participation a changé. Rechargez la séance.');
    }
    const after = {};
    for (const doc of records.values()) {
      const patch = buildPatch(doc.data(), option);
      after[doc.id] = assignmentState({ ...doc.data(), ...patch });
      tx.update(doc.ref, patch);
    }
    tx.create(auditRef, { actorUid: uid, createdAt: FieldValue.serverTimestamp(),
      sessionDate: session.data().date, memberId, requested, before, after,
      source: 'calymob_monitor_group_correction' });
    return { corrected: true, replay: false };
  });
}

exports.correctPoolStudentGroup = onCall({ region: 'europe-west1' },
  request => executeCorrection(admin.firestore(), request.auth?.uid, request.data));
exports.executeCorrection = executeCorrection;
exports.choices = choices;
exports.buildPatch = buildPatch;
exports.assignmentState = assignmentState;
exports.mayCorrect = mayCorrect;

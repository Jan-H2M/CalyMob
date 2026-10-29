'use strict';
const { buildPatch } = require('./correctPoolStudentGroup');

// Reuse the same per-hour pupil report contract as SCUBA. This preserves the
// independent other hour and refuses a conflicting non-pupil activity.
function apneeCourseAttendancePatch(attendee, lesson, courseId, number = 1) {
  return buildPatch(attendee, {
    level: lesson.track, hour: lesson.hour, courseId, groupNumber: number,
    theme: lesson.theme || '',
    monitors: (lesson.instructor_ids || []).map(id => ({ membre_id: id })),
  });
}
exports.apneeCourseAttendancePatch = apneeCourseAttendancePatch;

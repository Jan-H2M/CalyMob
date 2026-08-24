/**
 * Shared helper for the member-level carnet opt-out (MOB-020).
 *
 * Default is ON: a missing `uses_carnet` field means the member still
 * receives logbook invitations. Only an explicit `false` opts out.
 */
function usesCarnet(member) {
  if (!member || typeof member !== 'object') return true;
  return member.uses_carnet !== false;
}

const CARNET_TASK_TYPES = new Set([
  'logbook_completion',
  'buddy_confirmation',
]);

function isCarnetTaskType(type) {
  return CARNET_TASK_TYPES.has(String(type || ''));
}

module.exports = {
  usesCarnet,
  isCarnetTaskType,
  CARNET_TASK_TYPES,
};

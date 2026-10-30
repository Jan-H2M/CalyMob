import '../models/participant_operation.dart';
import '../models/palanquee.dart';

bool isPalanqueeSimulation(ParticipantOperation participant) =>
    participant.registrationStatus == 'simulation';

/// New complete roster first; older documents can still restore group snapshots.
/// A real registration always takes precedence over a planning snapshot.
List<PalanqueeParticipant> savedPalanqueeSimulationRoster(
  PalanqueeAssignments assignments,
  Iterable<String> registeredMemberIds,
) {
  final seen = registeredMemberIds.toSet();
  return [
    ...assignments.simulationParticipants,
    ...assignments.palanquees.expand((group) => group.participants),
  ].where((p) => p.membreId.isNotEmpty && seen.add(p.membreId)).toList();
}

String palanqueeRosterSummary(Iterable<ParticipantOperation> participants) {
  final rows = participants.toList();
  final simulations = rows.where(isPalanqueeSimulation).length;
  final registered = rows.length - simulations;
  return simulations == 0
      ? '$registered plongeurs inscrits'
      : '$registered inscrits / $simulations en simulation';
}

/// Club-directory members deliberately added to a palanquée are simulation
/// participants only.  They are stored with the palanquée assignment and are
/// never turned into an event inscription, so this organiser workflow cannot
/// trigger registration, email, or push-notification flows.
List<Map<String, dynamic>> selectableSimulationMembers({
  required Iterable<Map<String, dynamic>> directoryMembers,
  required Iterable<String> excludedMemberIds,
}) {
  final excluded = excludedMemberIds.toSet();
  final result = directoryMembers.where((member) {
    final id = member['id']?.toString() ?? '';
    final status = member['member_status']?.toString().toLowerCase();
    return id.isNotEmpty &&
        !excluded.contains(id) &&
        (status == null || status.isEmpty || status == 'active');
  }).toList();

  result.sort((left, right) {
    final leftLabel = '${left['nom'] ?? ''} ${left['prenom'] ?? ''}'.trim();
    final rightLabel = '${right['nom'] ?? ''} ${right['prenom'] ?? ''}'.trim();
    return leftLabel.toLowerCase().compareTo(rightLabel.toLowerCase());
  });
  return result;
}

List<ParticipantOperation> simulationParticipantsFromSelection({
  required Iterable<Map<String, dynamic>> selectedMembers,
  required String operationId,
  required DateTime now,
}) =>
    selectedMembers
        .where((member) => (member['id']?.toString() ?? '').isNotEmpty)
        .map(
          (member) => ParticipantOperation(
            id: 'palanquee-simulation:${member['id']}',
            operationId: operationId,
            membreId: member['id'].toString(),
            membreNom: member['nom']?.toString(),
            membrePrenom: member['prenom']?.toString(),
            prix: 0,
            dateInscription: now,
            registrationStatus: 'simulation',
          ),
        )
        .toList();

/// The printable roster must use the same deduplicated list as the planner.
/// This keeps silently selected club members visible in a saved/printed
/// palanquée without creating a registration for them.
List<ParticipantOperation> palanqueeRosterParticipants({
  required Iterable<ParticipantOperation> registeredParticipants,
  required Iterable<ParticipantOperation> simulationParticipants,
}) {
  final participantIds = <String>{};
  return [...registeredParticipants, ...simulationParticipants]
      .where((participant) => participantIds.add(participant.membreId))
      .toList();
}

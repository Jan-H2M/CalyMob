import 'package:calymob/utils/palanquee_simulation_selection.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('palanquée simulation selection', () {
    test(
      'only exposes active directory members that are not already present',
      () {
        final members = selectableSimulationMembers(
          directoryMembers: [
            {
              'id': 'already',
              'nom': 'Already',
              'prenom': 'Ada',
              'member_status': 'active',
            },
            {
              'id': 'active',
              'nom': 'Zephyr',
              'prenom': 'Zoé',
              'member_status': 'active',
            },
            {'id': 'legacy', 'nom': 'Alpha', 'prenom': 'Ana'},
            {
              'id': 'inactive',
              'nom': 'Inactive',
              'prenom': 'Ian',
              'member_status': 'inactive',
            },
          ],
          excludedMemberIds: const ['already'],
        );

        expect(members.map((member) => member['id']), ['legacy', 'active']);
      },
    );

    test('creates assignment-only snapshots, never event registrations', () {
      final participants = simulationParticipantsFromSelection(
        selectedMembers: [
          {'id': 'member-1', 'nom': 'Longrée', 'prenom': 'Denis'},
          {'id': 'member-2', 'nom': 'Dupont', 'prenom': 'Alice'},
        ],
        operationId: 'operation-1',
        now: DateTime.utc(2026, 10, 26),
      );

      expect(participants, hasLength(2));
      expect(participants.first.id, 'palanquee-simulation:member-1');
      expect(participants.first.operationId, 'operation-1');
      expect(participants.first.registrationStatus, 'simulation');
      expect(
        participants.every((participant) => participant.prix == 0),
        isTrue,
      );
    });

    test(
        'includes silent selected members in the deduplicated printable roster',
        () {
      final selected = simulationParticipantsFromSelection(
        selectedMembers: [
          {'id': 'member-2', 'nom': 'Dupont', 'prenom': 'Alice'},
        ],
        operationId: 'operation-1',
        now: DateTime.utc(2026, 10, 26),
      );
      final roster = palanqueeRosterParticipants(
        registeredParticipants: [
          selected.single.copyWith(
            id: 'registration:member-2',
            registrationStatus: 'registered',
          ),
        ],
        simulationParticipants: [
          ...selected,
          ...simulationParticipantsFromSelection(
            selectedMembers: [
              {'id': 'member-3', 'nom': 'Longrée', 'prenom': 'Denis'},
            ],
            operationId: 'operation-1',
            now: DateTime.utc(2026, 10, 26),
          ),
        ],
      );

      expect(roster.map((participant) => participant.membreId), [
        'member-2',
        'member-3',
      ]);
      expect(roster.last.registrationStatus, 'simulation');
    });
  });
}

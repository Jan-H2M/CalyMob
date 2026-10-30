import 'package:calymob/models/participant_operation.dart';
import 'package:calymob/models/palanquee.dart';
import 'package:calymob/screens/operations/palanquee_screen.dart';
import 'package:calymob/services/lifras_validation_service.dart';
import 'package:calymob/widgets/guest_diving_level_field.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('guest level selector offers the levels used by palanquees',
      (tester) async {
    String? selected;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: GuestDivingLevelField(
          value: null,
          onChanged: (value) => selected = value,
        ),
      ),
    ));

    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('2★').last);
    await tester.pumpAndSettle();

    expect(selected, '2');
  });

  test('guest inscription retains its validated diving-level snapshot',
      () async {
    final firestore = FakeFirebaseFirestore();
    final ref = firestore.doc(
      'clubs/calypso/operations/event-1/inscriptions/guest-1',
    );
    await ref.set({
      'operation_id': 'event-1',
      'membre_id': 'guest_guest-1',
      'membre_nom': 'Invitée',
      'membre_prenom': 'Vinciane',
      'prix': 0,
      'date_inscription': Timestamp.fromDate(DateTime(2026, 10, 9)),
      'is_guest': true,
      'plongeur_code': '2',
    });

    final participant = ParticipantOperation.fromFirestore(await ref.get());
    expect(participant.isGuest, isTrue);
    expect(participant.plongeurCode, '2');
    expect(participant.toFirestore()['plongeur_code'], '2');
  });

  test('palanquee organization only uses guest level snapshots', () {
    final participants = [
      ParticipantOperation(
        id: 'guest-registration-1',
        operationId: 'event-1',
        membreId: 'guest_guest-registration-1',
        membreNom: 'Invitée',
        membrePrenom: 'Vinciane',
        prix: 0,
        dateInscription: DateTime(2026, 10, 9),
        isGuest: true,
        plongeurCode: '2*',
      ),
      ParticipantOperation(
        id: 'legacy-guest',
        operationId: 'event-1',
        membreId: 'guest_legacy',
        membreNom: 'Sans niveau',
        membrePrenom: 'Invité',
        prix: 0,
        dateInscription: DateTime(2026, 10, 9),
        isGuest: true,
      ),
      ParticipantOperation(
        id: 'member-registration',
        operationId: 'event-1',
        membreId: 'member-1',
        membreNom: 'Membre',
        membrePrenom: 'Marie',
        prix: 0,
        dateInscription: DateTime(2026, 10, 9),
        plongeurCode: '4',
      ),
    ];

    // The legacy guest has no snapshot, while the member's inscription-level
    // value must be ignored: member_directory is authoritative for members.
    expect(participantLevelSnapshots(participants), {
      'guest_guest-registration-1': '2',
    });
  });

  test('saved guest assignments use the current authoritative snapshot', () {
    const savedAssignments = [
      Palanquee(
        numero: 1,
        participants: [
          PalanqueeParticipant(
            membreId: 'guest_changed',
            membreNom: 'Invitée',
            membrePrenom: 'Vinciane',
            niveau: '2',
          ),
          PalanqueeParticipant(
            membreId: 'member_monitor',
            membreNom: 'Moniteur',
            membrePrenom: 'Marie',
            niveau: 'MC',
          ),
        ],
      ),
      Palanquee(
        numero: 2,
        participants: [
          PalanqueeParticipant(
            membreId: 'guest_legacy',
            membreNom: 'Invité',
            membrePrenom: 'Sans niveau',
            niveau: '3',
          ),
        ],
      ),
    ];

    final hydrated = rehydratePalanqueeParticipantLevels(
      savedAssignments,
      const {'guest_changed': 'NB', 'member_monitor': 'MC'},
    );

    expect(hydrated[0].participants[0].niveau, 'NB');
    expect(hydrated[1].participants.single.niveau, isEmpty);
    expect(savedAssignments[0].participants[0].niveau, '2');
    expect(validateAllPalanquees(hydrated)[1]!.maxDepth, 15);
  });
}

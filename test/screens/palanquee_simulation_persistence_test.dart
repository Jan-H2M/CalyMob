import 'dart:io';
import 'package:calymob/models/exercice_lifras.dart';
import 'package:calymob/models/member_observation.dart';
import 'package:calymob/models/operation.dart';
import 'package:calymob/models/palanquee.dart';
import 'package:calymob/screens/operations/palanquee_screen.dart';
import 'package:calymob/services/lifras_service.dart';
import 'package:calymob/services/member_observation_service.dart';
import 'package:calymob/services/member_service.dart';
import 'package:calymob/services/palanquee_service.dart';
import 'package:calymob/utils/fiche_palanquee_pdf.dart';
import 'package:calymob/utils/palanquee_simulation_selection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';

const snapshot = PalanqueeParticipant(
    membreId: 'synthetic',
    membreNom: 'Example',
    membrePrenom: 'Planning',
    niveau: '2');

void main() {
  // Install the fake FieldValue delegate before any serialization uses it.
  setUpAll(() {
    FakeFirebaseFirestore();
  });
  test('complete unassigned roster roundtrips with zero groups', () {
    const saved = PalanqueeAssignments(simulationParticipants: [snapshot]);
    final data = saved.toFirestore()..remove('updated_at');
    final restored = PalanqueeAssignments.fromFirestore(data);
    expect(restored.palanquees, isEmpty);
    expect(savedPalanqueeSimulationRoster(restored, []).single.membreId,
        'synthetic');
    expect(savedPalanqueeSimulationRoster(restored, ['synthetic']), isEmpty);
    expect(
        restored
            .copyWith(updatedBy: 'editor')
            .simulationParticipants
            .single
            .niveau,
        '2');
  });
  test('old group-only documents restore and deduplicate simulation snapshots',
      () {
    final old = PalanqueeAssignments.fromFirestore({
      'palanquees': [
        const Palanquee(numero: 1, participants: [snapshot]).toMap(),
        const Palanquee(numero: 2, participants: [snapshot]).toMap(),
      ]
    });
    expect(savedPalanqueeSimulationRoster(old, []), hasLength(1));
    expect(savedPalanqueeSimulationRoster(old, ['synthetic']), isEmpty);
  });

  test('real service writes and reloads the complete roster, not inscriptions',
      () async {
    final firestore = FakeFirebaseFirestore();
    final service = PalanqueeService(firestore: firestore);
    await service.saveAssignments(
        'synthetic',
        'event',
        const PalanqueeAssignments(simulationParticipants: [snapshot]),
        'editor');
    final restored = await service.getAssignments('synthetic', 'event');
    expect(restored!.simulationParticipants.single.membreId, 'synthetic');
    expect(restored.palanquees, isEmpty);
    expect(restored.updatedBy, 'editor');
    expect(
        (await firestore
                .collection('clubs/synthetic/operations/event/inscriptions')
                .get())
            .docs,
        isEmpty);
  });

  testWidgets(
      'picker -> save without assignment -> reopen preserves simulation',
      (tester) async {
    final service = _Assignments();
    await tester.pumpWidget(_host(service));
    await tester.pumpAndSettle();
    await tester
        .tap(find.byTooltip('Ajouter des membres (simulation silencieuse)'));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(CheckboxListTile).first);
    await tester.pump();
    await tester.tap(find.text('Ajouter à la simulation'));
    await tester.pumpAndSettle();
    expect(find.text('Non assignés (1)'), findsOneWidget);
    await tester.tap(find.byTooltip('Sauvegarder'));
    await tester.pumpAndSettle();
    expect(service.writes, 1);
    expect(service.saved!.simulationParticipants.single.membreId, 'synthetic');
    expect(service.saved!.palanquees, isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpWidget(_host(service));
    await tester.pumpAndSettle();
    expect(find.text('Non assignés (1)'), findsOneWidget);
    expect(find.text('EXAMPLE Planning'), findsOneWidget);
    expect(service.writes,
        1); // opening never writes an inscription or assignment.
    expect(tester.takeException(), isNull);
  });

  testWidgets('removing the last group then saving keeps its simulation member',
      (tester) async {
    final service = _Assignments()
      ..saved = const PalanqueeAssignments(palanquees: [
        Palanquee(numero: 1, participants: [snapshot])
      ]);
    await tester.pumpWidget(_host(service));
    await tester.pumpAndSettle();
    // Legacy group snapshots are restored to the complete planning roster.
    final delete = find.byIcon(Icons.delete_outline);
    expect(delete, findsWidgets);
    await tester.tap(delete.first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Supprimer').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Sauvegarder'));
    await tester.pumpAndSettle();
    expect(service.saved!.palanquees, isEmpty);
    expect(service.saved!.simulationParticipants.single.membreId, 'synthetic');
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpWidget(_host(service));
    await tester.pumpAndSettle();
    expect(find.text('Non assignés (1)'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('actual PDF distinguishes simulation from registration and payment',
      () async {
    final simulation = simulationParticipantsFromSelection(selectedMembers: [
      {'id': 'synthetic', 'nom': 'Example', 'prenom': 'Planning'}
    ], operationId: 'event', now: DateTime.utc(2026, 10, 28))
        .single;
    final registered = simulation.copyWith(
        id: 'real-registration',
        membreId: 'registered',
        registrationStatus: 'registered');
    expect(palanqueeRosterSummary([registered, simulation]),
        '1 inscrits / 1 en simulation');
    final bytes = await FichePalanqueePdf.buildBytes(
        operation: _operation(),
        participants: [registered, simulation],
        memberLevels: {'synthetic': '2*'});
    expect(String.fromCharCodes(bytes.take(4)), '%PDF');
    final output = Platform.environment['MOB043_QA_PDF'];
    if (output != null) await File(output).writeAsBytes(bytes);
  });
}

Operation _operation() => Operation(
    id: 'event',
    type: 'evenement',
    titre: 'Synthetic planning QA',
    montantPrevu: 0,
    statut: 'ouvert',
    createdAt: DateTime.utc(2026, 10, 28),
    updatedAt: DateTime.utc(2026, 10, 28));

Widget _host(_Assignments service) => MaterialApp(
    home: PalanqueeScreen(
        operation: _operation(),
        participants: const [],
        clubId: 'synthetic',
        userId: 'editor',
        canEdit: true,
        canReadAllObservations: false,
        observationService: _Observations(),
        lifrasService: _Lifras(),
        palanqueeService: service,
        memberService: _Members()));

class _Assignments extends Mock implements PalanqueeService {
  PalanqueeAssignments? saved;
  int writes = 0;
  @override
  Future<PalanqueeAssignments?> getAssignments(
          String club, String operation) async =>
      saved;
  @override
  Future<void> saveAssignments(String club, String operation,
      PalanqueeAssignments assignments, String uid) async {
    writes++;
    final data = assignments.toFirestore()..remove('updated_at');
    saved = PalanqueeAssignments.fromFirestore(data);
  }
}

class _Members extends Mock implements MemberService {
  @override
  Future<List<Map<String, dynamic>>> getAllMembers(String clubId) async => [
        {
          'id': 'synthetic',
          'nom': 'Example',
          'prenom': 'Planning',
          'plongeur_code': '2'
        }
      ];
}

class _Lifras extends Mock implements LifrasService {
  @override
  Future<List<ExerciceLIFRAS>> getAllExercices(String clubId,
          {bool strict = false}) async =>
      [];
}

class _Observations extends Mock implements MemberObservationService {
  @override
  Stream<List<MemberObservation>> watchOwnSessionObservations(
          String club, String member, String session) =>
      Stream.value([]);
}

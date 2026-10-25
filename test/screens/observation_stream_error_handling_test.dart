import 'dart:async';

import 'package:calymob/models/exercice_lifras.dart';
import 'package:calymob/models/formation_snapshot_doc.dart';
import 'package:calymob/models/member_observation.dart';
import 'package:calymob/models/operation.dart';
import 'package:calymob/models/palanquee.dart';
import 'package:calymob/models/piscine_attendee.dart';
import 'package:calymob/models/piscine_session.dart';
import 'package:calymob/providers/auth_provider.dart';
import 'package:calymob/providers/member_provider.dart';
import 'package:calymob/screens/formation/my_progression_screen.dart';
import 'package:calymob/screens/operations/palanquee_screen.dart';
import 'package:calymob/screens/piscine/session_evaluation_screen.dart';
import 'package:calymob/services/formation_snapshot_reader.dart';
import 'package:calymob/services/lifras_service.dart';
import 'package:calymob/services/member_observation_service.dart';
import 'package:calymob/services/palanquee_service.dart';
import 'package:calymob/services/piscine_session_service.dart';
import 'package:calymob/utils/permission_helper.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' show User;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';

const _roles = [
  _Role('admin', [], 'P4', 'admin', true),
  _Role('MC Encadrant', ['Encadrant'], 'MC', 'membre', true),
  _Role('MF Encadrant', ['Encadrant'], 'MF', 'membre', true),
  _Role('MN Encadrant', ['Encadrant'], 'MN', 'membre', true),
  _Role('P4 Encadrant', ['Encadrant'], 'P4', 'membre', false),
  _Role('AM Encadrant', ['Encadrant'], 'AM', 'membre', false),
  _Role('member', ['Membre'], 'P2', 'membre', false),
  _Role('MC without Encadrant', ['Membre'], 'MC', 'membre', false),
];

void main() {
  late _Observations observations;
  late _Sessions sessions;
  late _Snapshots snapshots;

  setUp(() {
    observations = _Observations();
    sessions = _Sessions();
    snapshots = _Snapshots();
  });
  tearDown(() async {
    for (final controller in observations.controllers) {
      await controller.close();
    }
    for (final controller in sessions.controllers) {
      await controller.close();
    }
  });

  for (final role in _roles) {
    test('LIFRAS permission: ${role.name}', () {
      expect(role.canReadAll, role.allowed);
    });
    for (final screen in ['session', 'palanquee']) {
      testWidgets('$screen selects the permitted stream for ${role.name}',
          (tester) async {
        await tester.pumpWidget(
            _host(_screen(screen, observations, sessions, role), role: role));
        await _flush(tester);
        expect(observations.calls,
            [role.allowed ? 'full:session' : 'own:viewer:session']);
        await tester.pumpWidget(const SizedBox.shrink());
        expect(observations.cancellations, 1);
        if (screen == 'session') expect(sessions.cancellations, 1);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets(
      'progression retains data, handles denied snapshot/stream, retries and cancels',
      (tester) async {
    snapshots.fail = true;
    await tester.pumpWidget(_host(MyProgressionScreen(
      observationService: observations,
      snapshotReader: snapshots,
    )));
    await _flush(tester);
    observations.controllers.single.add([_observation()]);
    await _flush(tester);
    expect(find.text('Observation conservée'), findsOneWidget);
    observations.controllers.single.addError(_denied(), StackTrace.current);
    await _flush(tester);
    expect(find.text('Les observations sont indisponibles pour le moment.'),
        findsOneWidget);
    expect(find.text('Observation conservée'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Réessayer'));
    await _flush(tester);
    expect(observations.controllers, hasLength(2));
    expect(observations.cancellations, 1);
    observations.controllers.last.add([_observation()]);
    await _flush(tester);
    expect(find.text('Réessayer'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    expect(observations.cancellations, 2);
    expect(tester.takeException(), isNull);
  });

  for (final uid in <String?>[null, '']) {
    testWidgets(
        'progression without a member ($uid) stops loading without queries',
        (tester) async {
      await tester.pumpWidget(_host(
          MyProgressionScreen(
            observationService: observations,
            snapshotReader: snapshots,
          ),
          uid: uid));
      await _flush(tester);
      expect(observations.calls, isEmpty);
      expect(snapshots.calls, 0);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
      'progression ignores stale snapshots and a rejected future after disposal',
      (tester) async {
    final first = Completer<FormationSnapshotDoc?>();
    final second = Completer<FormationSnapshotDoc?>();
    snapshots.pending.addAll([first.future, second.future]);
    await tester.pumpWidget(_host(MyProgressionScreen(
      observationService: observations,
      snapshotReader: snapshots,
    )));
    await _flush(tester);
    observations.controllers.single.addError(_denied(), StackTrace.current);
    await _flush(tester);
    await tester.tap(find.text('Réessayer'));
    await _flush(tester);
    observations.controllers.last.add([_observation()]);
    second.complete(FormationSnapshotDoc.fromMap('viewer', {
      'attention_points': ['NEW']
    }));
    await _flush(tester);
    first.complete(FormationSnapshotDoc.fromMap('viewer', {
      'attention_points': ['OLD']
    }));
    await _flush(tester);
    expect(find.textContaining('NEW'), findsOneWidget);
    expect(find.textContaining('OLD'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    expect(observations.cancellations, 2);
    expect(tester.takeException(), isNull);

    final lateSnapshot = Completer<FormationSnapshotDoc?>();
    snapshots.pending.add(lateSnapshot.future);
    await tester.pumpWidget(_host(MyProgressionScreen(
      observationService: observations,
      snapshotReader: snapshots,
    )));
    await _flush(tester);
    await tester.pumpWidget(const SizedBox.shrink());
    lateSnapshot.completeError(_denied(), StackTrace.current);
    await _flush(tester);
    expect(observations.cancellations, 3);
    expect(tester.takeException(), isNull);
  });

  for (final screen in ['session', 'palanquee']) {
    testWidgets(
        '$screen contains permission errors, retries once and cancels on dispose',
        (tester) async {
      const role = _Role('validator', ['Encadrant'], 'MC', 'membre', true);
      await tester.pumpWidget(
          _host(_screen(screen, observations, sessions, role), role: role));
      await _flush(tester);
      observations.controllers.single.add([_observation()]);
      if (screen == 'session') sessions.controllers.single.add([_attendee()]);
      await _flush(tester);
      observations.controllers.single.addError(_denied(), StackTrace.current);
      await _flush(tester);
      expect(
          find.text(screen == 'session'
              ? 'Les données d’évaluation sont indisponibles pour le moment.'
              : 'Les observations sont indisponibles pour le moment.'),
          findsOneWidget);
      expect(find.text('Réessayer'), findsOneWidget);
      expect(tester.takeException(), isNull);
      if (screen == 'session') {
        expect(find.text('Participant conservé'), findsOneWidget);
        expect(find.text('1 obs.'), findsOneWidget);
      }
      await tester.tap(find.text('Réessayer'));
      await _flush(tester);
      expect(observations.cancellations, 1);
      expect(observations.controllers, hasLength(2));
      observations.controllers.last.add([]);
      await _flush(tester);
      await tester.pumpWidget(const SizedBox.shrink());
      expect(observations.cancellations, 2);
      if (screen == 'session') expect(sessions.cancellations, 2);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
      'session participant rows cannot evaluate without LIFRAS permission',
      (tester) async {
    final role = _roles[4]; // P4 Encadrant from the reported event.
    await tester.pumpWidget(
        _host(_screen('session', observations, sessions, role), role: role));
    await _flush(tester);
    sessions.controllers.single.add([_attendee()]);
    observations.controllers.single.add([]);
    await _flush(tester);
    final row = tester.widget<ListTile>(
        find.widgetWithText(ListTile, 'Participant conservé'));
    expect(row.onTap, isNull);
    expect(observations.calls, ['own:viewer:session']);
  });

  testWidgets('palanquee never queries an empty member id', (tester) async {
    await tester.pumpWidget(_host(PalanqueeScreen(
      operation: _operation(),
      participants: const [],
      clubId: 'calypso',
      userId: '',
      canReadAllObservations: false,
      observationService: observations,
      lifrasService: _Lifras(),
      palanqueeService: _Palanquees(),
    )));
    await _flush(tester);
    expect(observations.calls, isEmpty);
    expect(tester.takeException(), isNull);
  });
}

Widget _screen(
    String screen, _Observations observations, _Sessions sessions, _Role role) {
  if (screen == 'session') {
    return SessionEvaluationScreen(
        session: _session(),
        observationService: observations,
        sessionService: sessions,
        lifrasService: _Lifras());
  }
  return PalanqueeScreen(
      operation: _operation(),
      participants: const [],
      clubId: 'calypso',
      userId: 'viewer',
      canReadAllObservations: role.canReadAll,
      observationService: observations,
      lifrasService: _Lifras(),
      palanqueeService: _Palanquees());
}

Widget _host(Widget child,
        {String? uid = 'viewer',
        _Role role =
            const _Role('member', ['Membre'], 'P2', 'membre', false)}) =>
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: _Auth(uid)),
        ChangeNotifierProvider<MemberProvider>.value(value: _Member(role)),
      ],
      child: MaterialApp(home: child),
    );
Future<void> _flush(WidgetTester tester) async {
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

FirebaseException _denied() =>
    FirebaseException(plugin: 'cloud_firestore', code: 'permission-denied');

class _Observations extends Mock implements MemberObservationService {
  final controllers = <StreamController<List<MemberObservation>>>[];
  final calls = <String>[];
  int cancellations = 0;
  Stream<List<MemberObservation>> _open(String scope) {
    calls.add(scope);
    // Give cancellation a fresh Future in the widget test's fake-async zone.
    final controller =
        StreamController<List<MemberObservation>>(onCancel: () async {
      cancellations++;
    });
    controllers.add(controller);
    return controller.stream;
  }

  @override
  Stream<List<MemberObservation>> getObservationsForMember(
          String clubId, String memberId) =>
      _open('member:$memberId');
  @override
  Stream<List<MemberObservation>> watchFullSessionObservations(
          String clubId, String sessionId) =>
      _open('full:$sessionId');
  @override
  Stream<List<MemberObservation>> watchOwnSessionObservations(
          String clubId, String memberId, String sessionId) =>
      _open('own:$memberId:$sessionId');
}

class _Sessions extends Mock implements PiscineSessionService {
  final controllers = <StreamController<List<PiscineAttendee>>>[];
  int cancellations = 0;
  @override
  Stream<List<PiscineAttendee>> getAttendeesStream(
      String clubId, String sessionId) {
    final controller =
        StreamController<List<PiscineAttendee>>(onCancel: () async {
      cancellations++;
    });
    controllers.add(controller);
    return controller.stream;
  }
}

class _Snapshots extends Mock implements FormationSnapshotReader {
  bool fail = false;
  int calls = 0;
  final pending = <Future<FormationSnapshotDoc?>>[];
  @override
  Future<FormationSnapshotDoc?> getSnapshot(String clubId, String memberId,
      {bool throwOnError = false}) {
    calls++;
    if (pending.isNotEmpty) return pending.removeAt(0);
    return fail ? Future.error(_denied()) : Future.value(null);
  }
}

class _Lifras extends Mock implements LifrasService {
  @override
  Future<List<ExerciceLIFRAS>> getAllExercices(String clubId) async => [];
}

class _Palanquees extends Mock implements PalanqueeService {
  @override
  Future<PalanqueeAssignments?> getAssignments(
          String clubId, String operationId) async =>
      null;
}

class _Auth extends Mock implements AuthProvider {
  _Auth(this.uid);
  final String? uid;
  @override
  User? get currentUser => uid == null ? null : _User(uid!);
}

class _User extends Mock implements User {
  _User(this.id);
  final String id;
  @override
  String get uid => id;
}

class _Member extends Mock implements MemberProvider {
  _Member(this.role);
  final _Role role;
  @override
  List<String> get clubStatuten => role.statuten;
  @override
  String? get plongeurCode => role.code;
  @override
  String? get appRole => role.appRole;
}

class _Role {
  const _Role(this.name, this.statuten, this.code, this.appRole, this.allowed);
  final String name;
  final List<String> statuten;
  final String code;
  final String appRole;
  final bool allowed;
  bool get canReadAll => PermissionHelper.canValidateLifras(
      clubStatuten: statuten, plongeurCode: code, appRole: appRole);
}

PiscineSession _session() => PiscineSession(
    id: 'session',
    operationId: 'operation',
    date: DateTime(2026, 10, 24),
    lieu: 'Piscine',
    horaireDebut: '20:00',
    horaireFin: '21:00',
    accueil: const [],
    baptemes: const [],
    gonflage: const {},
    niveaux: const {},
    statut: 'ouvert',
    createdAt: DateTime(2026),
    updatedAt: DateTime(2026),
    createdBy: 'viewer');
Operation _operation() => Operation(
    id: 'session',
    type: 'evenement',
    categorie: 'plongee',
    titre: 'Plongée',
    montantPrevu: 0,
    statut: 'ouvert',
    createdAt: DateTime(2026),
    updatedAt: DateTime(2026));
MemberObservation _observation() => MemberObservation(
    id: 'observation',
    memberId: 'viewer',
    memberName: 'Participant conservé',
    memberNiveau: 'P2',
    contextType: 'piscine',
    contextId: 'session',
    contextDate: DateTime(2026, 10, 24),
    contextTitle: 'Session',
    category: 'general',
    result: 'en_progres',
    note: 'Observation conservée',
    observerId: 'monitor',
    observerName: 'Moniteur',
    createdAt: DateTime(2026));
PiscineAttendee _attendee() => PiscineAttendee(
    id: 'attendee',
    memberId: 'viewer',
    memberName: 'Participant conservé',
    scannedAt: DateTime(2026),
    scannedBy: 'viewer');

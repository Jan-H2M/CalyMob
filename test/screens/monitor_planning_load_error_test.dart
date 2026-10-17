import 'package:calymob/models/exercice_lifras.dart';
import 'package:calymob/providers/auth_provider.dart';
import 'package:calymob/screens/training/monitor_planning_screen.dart';
import 'package:calymob/services/formation_snapshot_service.dart';
import 'package:calymob/services/lifras_service.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' show User;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';

class _Store extends Mock implements FirebaseFirestore {
  final memory = FakeFirebaseFirestore();
  bool failReads = true;
  int readAttempts = 0;

  @override
  CollectionReference<Map<String, dynamic>> collection(String path) {
    readAttempts += 1;
    if (failReads) throw StateError('synthetic read failure');
    return memory.collection(path);
  }
}

class _User extends Mock implements User {
  @override
  String get uid => 'synthetic-monitor';
}

class _Auth extends Mock implements AuthProvider {
  @override
  User? get currentUser => _User();
}

class _Lifras extends Mock implements LifrasService {
  @override
  Future<List<ExerciceLIFRAS>> getExercicesByIds(
          String clubId, List<String> exerciceIds) async =>
      [];
}

class _Formation extends Mock implements FormationSnapshotService {
  @override
  Future<Map<String, FormationSnapshot>> getFormationSnapshots(
          String clubId, List<FormationMemberInput> members) async =>
      {};
}

void main() {
  Future<void> settleLoad(WidgetTester tester) async {
    // Ocean animations stay active; settle only the finite loader microtasks.
    for (var i = 0; i < 8; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
  }

  Future<void> showScreen(WidgetTester tester, _Store store) async {
    await tester.pumpWidget(ChangeNotifierProvider<AuthProvider>.value(
      value: _Auth(),
      child: MaterialApp(
        home: MonitorPlanningScreen(
          operationId: 'synthetic-outing',
          firestore: store,
          lifrasService: _Lifras(),
          formationService: _Formation(),
        ),
      ),
    ));
    await settleLoad(tester);
  }

  ElevatedButton saveButton(WidgetTester tester) =>
      tester.widget<ElevatedButton>(
          find.widgetWithText(ElevatedButton, 'Sauvegarder le plan'));

  testWidgets('load failure stops the spinner and retry recovers the screen',
      (tester) async {
    final store = _Store();
    await store.memory.doc('clubs/calypso/operations/synthetic-outing').set({
      'titre': 'Synthetic outing',
    });
    await showScreen(tester, store);
    expect(find.text('Impossible de charger la préparation de la sortie.'),
        findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(saveButton(tester).onPressed, isNull);
    expect(tester.takeException(), isNull);

    store.failReads = false;
    await tester.tap(find.text('Réessayer'));
    await settleLoad(tester);
    expect(find.text('Synthetic outing'), findsOneWidget);
    expect(find.text('Réessayer'), findsNothing);
    expect(saveButton(tester).onPressed, isNotNull);
    expect(store.readAttempts, greaterThan(1));
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('a missing outing cannot enable saving an empty plan',
      (tester) async {
    final store = _Store()..failReads = false;
    await showScreen(tester, store);
    expect(find.text('Impossible de charger la préparation de la sortie.'),
        findsOneWidget);
    expect(saveButton(tester).onPressed, isNull);
    expect(tester.takeException(), isNull);
    expect(
        await store.memory.collection('clubs/calypso/operations').get(),
        isA<QuerySnapshot<Map<String, dynamic>>>()
            .having((snapshot) => snapshot.docs, 'operations', isEmpty));
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

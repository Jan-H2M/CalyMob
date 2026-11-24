import 'package:calymob/config/firebase_config.dart';
import 'package:calymob/providers/auth_provider.dart';
import 'package:calymob/providers/expense_provider.dart';
import 'package:calymob/providers/member_provider.dart';
import 'package:calymob/providers/operation_provider.dart';
import 'package:calymob/screens/expenses/create_expense_screen.dart';
import 'package:calymob/services/expense_service.dart';
import 'package:calymob/services/operation_service.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' show User;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

class _User extends Fake implements User {
  @override
  String get uid => 'member';
}

class _Auth extends ChangeNotifier implements AuthProvider {
  @override
  User get currentUser => _User();

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Member extends ChangeNotifier implements MemberProvider {
  @override
  String get displayName => 'Membre DEV';

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

const _club = 'clubs/${FirebaseConfig.defaultClubId}';

// The expense screen's ocean background animates continuously.
Future<void> _finishTransition(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

Future<void> _openForm(WidgetTester tester, FakeFirebaseFirestore db) async {
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>(create: (_) => _Auth()),
        ChangeNotifierProvider<MemberProvider>(create: (_) => _Member()),
        ChangeNotifierProvider(
          create: (_) => ExpenseProvider(
            expenseService: ExpenseService(firestore: db),
          ),
        ),
        ChangeNotifierProvider(
          create: (_) => OperationProvider(
            operationService: OperationService(firestore: db),
          ),
        ),
      ],
      child: MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const CreateExpenseScreen()),
            ),
            child: const Text('Ouvrir'),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('Ouvrir'));
  await _finishTransition(tester);
  await tester.enterText(find.byType(TextFormField).at(0), '24');
  await tester.enterText(find.byType(TextFormField).at(1), 'Entrées du site');
}

Future<Map<String, dynamic>> _submit(
  WidgetTester tester,
  FakeFirebaseFirestore db,
) async {
  final submit = find.text('Soumettre');
  await tester.ensureVisible(submit);
  await tester.tap(submit);
  await _finishTransition(tester);
  return (await db.collection('$_club/expense_claims').get())
      .docs
      .single
      .data();
}

Future<void> _seedActivities(FakeFirebaseFirestore db) async {
  final activities = db.collection('$_club/operations');
  final now = DateTime.now();
  Future<void> add(
    String id,
    String title,
    int daysAgo, {
    String type = 'evenement',
    String organizer = 'other-member',
  }) =>
      activities.doc(id).set({
        'titre': title,
        'type': type,
        'statut': 'ferme',
        'organisateur_id': organizer,
        'date_debut': Timestamp.fromDate(now.subtract(Duration(days: daysAgo))),
      });

  await add('other', 'Sortie récente', 2);
  await add('registered', 'École de plongée', 3);
  await add('organized', 'Carrière', 4, organizer: 'member');
  await add('old', 'Ancienne sortie', 61);
  await add('dues', 'Cotisation', 2, type: 'cotisation');
  await activities.doc('registered').collection('inscriptions').doc('i1').set({
    'membre_id': 'member',
    'registration_status': 'active',
  });
}

void main() {
  setUpAll(() => initializeDateFormatting('fr_FR'));

  testWidgets('submits with no activity and no activity fields',
      (tester) async {
    final db = FakeFirebaseFirestore();
    await _openForm(tester, db);

    expect(find.text('Pas liée à une activité'), findsOneWidget);
    expect(find.text('Nombre de plongeurs'), findsNothing);
    final claim = await _submit(tester, db);
    expect(claim, containsPair('amount', 24));
    for (final key in ['operation_id', 'operation_title', 'nombre_plongeurs']) {
      expect(claim.containsKey(key), isFalse, reason: key);
    }
  });

  for (final count in [null, '4']) {
    testWidgets('searches and submits an activity with count $count',
        (tester) async {
      final db = FakeFirebaseFirestore();
      await _seedActivities(db);
      await _openForm(tester, db);
      await tester.tap(find.text('Activité'));
      await _finishTransition(tester);

      final dialog = find.byType(AlertDialog);
      expect(
        tester.getTopLeft(find.text('École de plongée')).dy,
        lessThan(tester.getTopLeft(find.text('Sortie récente')).dy),
      );
      expect(find.text('Carrière'), findsOneWidget);
      expect(find.text('Ancienne sortie'), findsNothing);
      expect(find.text('Cotisation'), findsNothing);
      await tester.enterText(
        find.descendant(of: dialog, matching: find.byType(TextField)),
        'ecole',
      );
      await tester.pump();
      expect(find.text('Sortie récente'), findsNothing);
      await tester.tap(find.text('École de plongée'));
      await _finishTransition(tester);
      if (count != null) {
        await tester.enterText(find.byType(TextFormField).at(2), count);
      }

      final claim = await _submit(tester, db);
      expect(claim, containsPair('operation_id', 'registered'));
      expect(claim, containsPair('operation_title', 'École de plongée'));
      if (count == null) {
        expect(claim.containsKey('nombre_plongeurs'), isFalse);
      } else {
        expect(claim, containsPair('nombre_plongeurs', 4));
      }
    });
  }

  testWidgets('clearing the activity also clears the diver count',
      (tester) async {
    final db = FakeFirebaseFirestore();
    await _seedActivities(db);
    await _openForm(tester, db);
    await tester.tap(find.text('Activité'));
    await _finishTransition(tester);
    await tester.tap(find.text('École de plongée'));
    await _finishTransition(tester);
    await tester.enterText(find.byType(TextFormField).at(2), '4');
    await tester.tap(find.text('Activité'));
    await _finishTransition(tester);
    await tester.tap(find.text('Pas liée à une activité'));
    await _finishTransition(tester);

    expect(find.text('Nombre de plongeurs'), findsNothing);
    final claim = await _submit(tester, db);
    expect(claim.containsKey('operation_id'), isFalse);
    expect(claim.containsKey('operation_title'), isFalse);
    expect(claim.containsKey('nombre_plongeurs'), isFalse);
  });
}

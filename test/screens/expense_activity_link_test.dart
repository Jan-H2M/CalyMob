import 'dart:async';

import 'package:calymob/config/firebase_config.dart';
import 'package:calymob/models/activity_item.dart';
import 'package:calymob/models/expense_claim.dart';
import 'package:calymob/models/expense_activity_summary.dart';
import 'package:calymob/providers/activity_provider.dart';
import 'package:calymob/providers/auth_provider.dart';
import 'package:calymob/providers/expense_provider.dart';
import 'package:calymob/providers/member_provider.dart';
import 'package:calymob/screens/expenses/create_expense_screen.dart';
import 'package:calymob/screens/expenses/expense_activity_picker.dart';
import 'package:calymob/services/activity_service.dart';
import 'package:calymob/services/expense_service.dart';
import 'package:calymob/widgets/agenda_activity.dart';
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
          create: (_) =>
              ExpenseProvider(expenseService: ExpenseService(firestore: db)),
        ),
        ChangeNotifierProvider(
          create: (_) =>
              ActivityProvider(activityService: ActivityService(firestore: db)),
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
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.pump();
  await tester.drag(find.byType(SingleChildScrollView), const Offset(0, -500));
  await _finishTransition(tester);
  await tester.tap(find.widgetWithText(FloatingActionButton, 'Soumettre'));
  await _finishTransition(tester);
  return (await db.collection('$_club/expense_claims').get()).docs.single
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
    String category = 'plongee',
  }) => activities.doc(id).set({
    'titre': title,
    'type': type,
    'statut': 'ferme',
    'categorie': category,
    'date_debut': Timestamp.fromDate(now.subtract(Duration(days: daysAgo))),
  });

  await add('other', 'Sortie récente', 2, category: 'sortie');
  await add('registered', 'École de plongée', 3);
  await activities.doc('registered').update({
    'organisateur_id': 'organizer',
    'organisateur_nom': 'Anne Organisatrice',
    'lieu': 'Carrière Calypso',
    'lieu_id': 'calypso-site',
  });
  await db.collection('$_club/dive_locations').doc('calypso-site').set({
    'name': 'Carrière Calypso',
    'country': 'BE',
    'tariffs': [
      {
        'id': 'member-site',
        'label': 'Membre',
        'category': 'membre',
        'price': 8,
        'is_default': true,
      },
      {
        'id': 'staff-site',
        'label': 'Encadrant',
        'category': 'encadrant',
        'price': 0,
      },
    ],
    'created_at': Timestamp.fromDate(now),
    'updated_at': Timestamp.fromDate(now),
  });
  final registrations = activities.doc('registered').collection('inscriptions');
  await registrations.doc('member').set({
    'operation_id': 'registered',
    'membre_id': 'member',
    'registration_status': 'confirmed',
    'prix': 12,
    'paye': true,
    'amount_paid': 12,
    'present': true,
    'date_inscription': Timestamp.fromDate(now),
  });
  await registrations.doc('staff').set({
    'operation_id': 'registered',
    'membre_id': 'staff',
    'registration_status': 'confirmed',
    'tariff_label': 'Encadrant',
    'prix': 0,
    'paye': false,
    'present': false,
    'date_inscription': Timestamp.fromDate(now),
  });
  await registrations.doc('non-diver').set({
    'operation_id': 'registered',
    'membre_id': 'non-diver',
    'registration_status': 'confirmed',
    'tariff_label': 'Non plongeur',
    'prix': 4,
    'paye': false,
    'date_inscription': Timestamp.fromDate(now),
  });
  await registrations.doc('legacy-canceled').set({
    'operation_id': 'registered',
    'membre_id': 'legacy-canceled',
    'registration_status': 'confirmed',
    'canceled_at': Timestamp.fromDate(now),
    'prix': 100,
    'paye': true,
    'present': true,
    'date_inscription': Timestamp.fromDate(now),
  });
  await add('organized', 'Carrière', 4);
  await add('old', 'Ancienne sortie', 61, category: 'sortie');
  await add('dues', 'Cotisation', 2, type: 'cotisation');
  await add('legacy-pool', 'Piscine en double', 3, category: 'piscine');
  final pools = db.collection('$_club/piscine_sessions');
  await pools.doc('registered').set({
    'date': Timestamp.fromDate(now.subtract(const Duration(days: 2))),
    'statut': 'publie',
    'horaire_debut': '20:30',
    'operation_id': 'legacy-pool',
  });
  await pools.doc('theory').set({
    'date': Timestamp.fromDate(now.subtract(const Duration(days: 1))),
    'type': 'theorie',
    'statut': 'publie',
    'horaire_debut': '19:15',
  });
}

Finder _pickerScroll() => find.descendant(
  of: find.byType(CustomScrollView),
  matching: find.byType(Scrollable),
);

Future<void> _openActivityPicker(WidgetTester tester) async {
  final field = find.text('Activité (facultatif)');
  await tester.ensureVisible(field);
  await tester.tap(field);
  await _finishTransition(tester);
  await tester.pump();
}

Future<void> _selectType(WidgetTester tester, String label) async {
  final field = find.byKey(const ValueKey('expense-reimbursement-type'));
  await tester.ensureVisible(field);
  await tester.tap(field);
  await _finishTransition(tester);
  await tester.tap(find.text(label).last);
  await _finishTransition(tester);
}

void main() {
  setUpAll(() => initializeDateFormatting('fr_FR'));

  testWidgets('submits with no activity and no activity fields', (
    tester,
  ) async {
    final db = FakeFirebaseFirestore();
    await _openForm(tester, db);

    expect(find.text('Type de remboursement'), findsOneWidget);
    expect(find.text('Pas liée à une activité'), findsNothing);
    expect(find.text('Nombre de plongeurs'), findsNothing);
    final claim = await _submit(tester, db);
    expect(claim, containsPair('amount', 24));
    for (final key in [
      'operation_id',
      'piscine_session_id',
      'operation_title',
      'nombre_plongeurs',
      'reimbursement_type',
    ]) {
      expect(claim.containsKey(key), isFalse, reason: key);
    }
  });

  testWidgets('shows only the controls relevant to the selected type', (
    tester,
  ) async {
    final db = FakeFirebaseFirestore();
    await _openForm(tester, db);

    await _selectType(tester, 'Boutique');
    expect(
      find.text('Lier à une commande Boutique (facultatif)'),
      findsOneWidget,
    );
    expect(find.text('Activité (facultatif)'), findsNothing);

    await _selectType(tester, 'Matériel/entretien (incl. gonflage)');
    expect(
      find.text('Lier à une commande Boutique (facultatif)'),
      findsNothing,
    );
    expect(find.text('Activité (facultatif)'), findsNothing);

    await _selectType(tester, 'Sortie/événement (fête, excursion)');
    expect(find.text('Activité (facultatif)'), findsOneWidget);
    expect(find.text('Pas liée à une activité'), findsOneWidget);
  });

  testWidgets('filters diving activities and stores the reimbursement type', (
    tester,
  ) async {
    final db = FakeFirebaseFirestore();
    await _seedActivities(db);
    await _openForm(tester, db);
    await _selectType(tester, 'Plongée (sorties en milieu naturel)');
    await _openActivityPicker(tester);

    final dialog = find.byType(ExpenseActivityPicker);
    expect(find.text('Carrière'), findsOneWidget);
    expect(find.text('Sortie récente'), findsNothing);
    expect(find.text('Piscine'), findsNothing);
    expect(find.text('Cotisation'), findsNothing);
    await tester.enterText(
      find.descendant(of: dialog, matching: find.byType(TextField)),
      'ecole',
    );
    await tester.pump();
    await tester.tap(find.text('École de plongée'));
    await _finishTransition(tester);

    final claim = await _submit(tester, db);
    expect(claim, containsPair('reimbursement_type', 'plongee'));
    expect(claim, containsPair('operation_id', 'registered'));
    expect(claim, containsPair('operation_title', 'École de plongée'));
    expect(claim.containsKey('piscine_session_id'), isFalse);
    expect(claim.containsKey('nombre_plongeurs'), isFalse);
  });

  testWidgets(
    'uses agenda section order, cards and dates, and saves a pool link',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final db = FakeFirebaseFirestore();
      await _seedActivities(db);
      await _openForm(tester, db);
      await _selectType(tester, 'Piscine/formation');
      await _openActivityPicker(tester);
      final agendaList = tester.widget<CustomScrollView>(
        find.byType(CustomScrollView),
      );
      final categories = agendaList.slivers
          .map((sliver) => sliver.key)
          .whereType<ValueKey<AgendaActivityCategory>>()
          .map((key) => key.value.label);
      expect(categories, ['Piscine']);
      expect(find.byType(AgendaMonthHeader), findsWidgets);
      expect(find.byType(AgendaActivityCard), findsWidgets);

      final pool = find.byKey(
        const ValueKey('expense-activity-piscine-registered'),
      );
      await tester.scrollUntilVisible(pool, 160, scrollable: _pickerScroll());
      expect(find.text('Piscine'), findsOneWidget);
      expect(
        find.descendant(of: pool, matching: find.text('20:30')),
        findsOneWidget,
      );
      final theory = find.byKey(
        const ValueKey('expense-activity-piscine-theory'),
      );
      await tester.scrollUntilVisible(theory, 160, scrollable: _pickerScroll());
      expect(
        find.descendant(of: theory, matching: find.text('19:15')),
        findsOneWidget,
      );
      expect(find.text('Sortie récente'), findsNothing);
      expect(find.text('Piscine en double'), findsNothing);
      expect(find.text('Ancienne sortie'), findsNothing);

      await tester.scrollUntilVisible(pool, -160, scrollable: _pickerScroll());
      await tester.tap(pool);
      await _finishTransition(tester);
      final claim = await _submit(tester, db);
      expect(claim, containsPair('reimbursement_type', 'piscine'));
      expect(claim, containsPair('piscine_session_id', 'registered'));
      expect(claim.containsKey('nombre_plongeurs'), isFalse);
      expect(claim['operation_title'], startsWith('Piscine - '));
      expect(claim.containsKey('operation_id'), isFalse);
    },
  );

  testWidgets(
    'shows picker finance and a non-blocking expected amount warning',
    (tester) async {
      final db = FakeFirebaseFirestore();
      await _seedActivities(db);
      await _openForm(tester, db);
      await _selectType(tester, 'Plongée (sorties en milieu naturel)');
      await _openActivityPicker(tester);
      await tester.pump(const Duration(milliseconds: 100));

      final activity = find.byKey(
        const ValueKey('expense-activity-operation-registered'),
      );
      await tester.scrollUntilVisible(
        activity,
        120,
        scrollable: _pickerScroll(),
      );
      await tester.pump(const Duration(milliseconds: 100));
      expect(
        find.descendant(
          of: activity,
          matching: find.textContaining('Anne Organisatrice'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: activity,
          matching: find.text('3 inscrits · 1 présents · 2 plongeurs'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: activity,
          matching: find.textContaining('Remboursement attendu'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: activity,
          matching: find.textContaining('Paiements'),
        ),
        findsOneWidget,
      );

      await tester.tap(activity);
      await _finishTransition(tester);
      expect(
        find.byKey(const ValueKey('expense-selected-expected-amount')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('expense-expected-amount-warning')),
        findsOneWidget,
      );

      await tester.enterText(find.byType(TextFormField).at(0), '16');
      await tester.pump();
      expect(
        find.byKey(const ValueKey('expense-expected-amount-warning')),
        findsNothing,
      );
      await db.collection('$_club/dive_locations').doc('calypso-site').update({
        'tariffs': [
          {
            'id': 'member-site',
            'label': 'Membre',
            'category': 'membre',
            'price': 9,
            'is_default': true,
          },
          {
            'id': 'staff-site',
            'label': 'Encadrant',
            'category': 'encadrant',
            'price': 0,
          },
        ],
      });
      await _openActivityPicker(tester);
      await tester.pump(const Duration(milliseconds: 100));
      final refreshedActivity = find.byKey(
        const ValueKey('expense-activity-operation-registered'),
      );
      await tester.scrollUntilVisible(
        refreshedActivity,
        120,
        scrollable: _pickerScroll(),
      );
      await tester.pump(const Duration(milliseconds: 100));
      expect(
        find.descendant(
          of: refreshedActivity,
          matching: find.textContaining('18,00'),
        ),
        findsOneWidget,
      );
      await tester.tap(refreshedActivity);
      await _finishTransition(tester);
      expect(
        find.byKey(const ValueKey('expense-expected-amount-warning')),
        findsOneWidget,
      );

      await tester.enterText(find.byType(TextFormField).at(0), '17');
      await tester.pump();
      expect(
        find.byKey(const ValueKey('expense-expected-amount-warning')),
        findsOneWidget,
      );

      final claim = await _submit(tester, db);
      expect(claim, containsPair('amount', 17));
      expect(claim, containsPair('operation_id', 'registered'));
    },
  );

  testWidgets('changing type clears fields that no longer apply', (
    tester,
  ) async {
    final db = FakeFirebaseFirestore();
    await _seedActivities(db);
    await _openForm(tester, db);
    await _selectType(tester, 'Plongée (sorties en milieu naturel)');
    await _openActivityPicker(tester);
    await tester.tap(find.text('École de plongée'));
    await _finishTransition(tester);
    await _selectType(tester, 'Administratif/autres');

    expect(find.text('Nombre de plongeurs'), findsNothing);
    expect(find.text('Activité (facultatif)'), findsNothing);
    final claim = await _submit(tester, db);
    expect(claim, containsPair('reimbursement_type', 'administratif'));
    expect(claim.containsKey('operation_id'), isFalse);
    expect(claim.containsKey('piscine_session_id'), isFalse);
    expect(claim.containsKey('operation_title'), isFalse);
    expect(claim.containsKey('nombre_plongeurs'), isFalse);
  });

  testWidgets('a delayed summary cannot pop two routes after a double tap', (
    tester,
  ) async {
    final summary = Completer<ExpenseActivitySummary>();
    final activity = ActivityItem(
      id: 'delayed',
      type: 'operation',
      titre: 'Activité différée',
      date: DateTime.now(),
      categorie: 'plongee',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () {
                showDialog<
                  ({ActivityItem? activity, ExpenseActivitySummary? summary})
                >(
                  context: context,
                  builder: (_) => ExpenseActivityPicker(
                    clubId: FirebaseConfig.defaultClubId,
                    watchActivities: () => Stream.value([activity]),
                    loadSummary: (_) => summary.future,
                    selected: null,
                  ),
                );
              },
              child: const Text('Ouvrir le sélecteur'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Ouvrir le sélecteur'));
    await _finishTransition(tester);
    await tester.tap(find.text('Activité différée'));
    await tester.tap(find.text('Activité différée'));
    expect(find.byType(ExpenseActivityPicker), findsOneWidget);

    summary.complete(const ExpenseActivitySummary());
    await tester.pumpAndSettle();
    expect(find.byType(ExpenseActivityPicker), findsNothing);
    expect(find.text('Ouvrir le sélecteur'), findsOneWidget);
  });

  test('existing diver-count data remains harmlessly readable', () async {
    final db = FakeFirebaseFirestore();
    final ref = db.collection('$_club/expense_claims').doc('existing');
    await ref.set({
      'club_id': FirebaseConfig.defaultClubId,
      'requester_id': 'member',
      'amount': 24,
      'description': 'Entrées du site',
      'status': 'submitted',
      'expense_date': Timestamp.fromDate(DateTime(2026, 11, 24)),
      'requested_at': Timestamp.fromDate(DateTime(2026, 11, 24)),
      'nombre_plongeurs': 4,
      'reimbursement_type': 'plongee',
    });

    final claim = ExpenseClaim.fromFirestore(await ref.get());
    expect(claim.montant, 24);
    expect(claim.reimbursementType, 'plongee');
  });
}

import 'package:calymob/providers/auth_provider.dart';
import 'package:calymob/screens/expenses/create_expense_screen.dart';
import 'package:firebase_auth/firebase_auth.dart' show User;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:intl/date_symbol_data_local.dart';

class _User extends Fake implements User {
  @override
  final String uid;
  _User(this.uid);
}

class _Auth extends ChangeNotifier implements AuthProvider {
  User? _user = _User('member-a');
  @override
  User? get currentUser => _user;
  void switchTo(String uid) {
    _user = _User(uid);
    notifyListeners();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  setUpAll(() => initializeDateFormatting('fr_FR'));
  testWidgets(
      'expense route loses prior identity data and actions permanently on account switch',
      (tester) async {
    final auth = _Auth();
    await tester.pumpWidget(ChangeNotifierProvider<AuthProvider>.value(
      value: auth,
      child: const MaterialApp(
          home: CreateExpenseScreen(
              boutiqueBatchId: 'batch-a',
              boutiqueOrderLabel: 'Private member A order')),
    ));
    await tester.pump();
    final switchFinder = find.byType(SwitchListTile);
    await tester.ensureVisible(switchFinder);
    await tester.tap(switchFinder);
    await tester.pump();
    expect(find.text('Private member A order'), findsWidgets);
    auth.switchTo('member-b');
    await tester.pump();
    expect(find.text('Private member A order'), findsNothing);
    expect(find.byType(TextFormField), findsNothing);
    expect(find.textContaining('Le compte a changé'), findsOneWidget);
    auth.switchTo('member-a');
    await tester.pump();
    expect(find.textContaining('Le compte a changé'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    auth.dispose();
  });
}

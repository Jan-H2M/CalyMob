import 'package:calymob/providers/auth_provider.dart';
import 'package:calymob/providers/member_provider.dart';
import 'package:calymob/providers/unread_count_provider.dart';
import 'package:calymob/screens/communication/communication_hub_screen.dart';
import 'package:firebase_auth/firebase_auth.dart' show User;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';

class _User extends Mock implements User {
  @override
  String get uid => 'current-member';
}

class _Auth extends Mock with ChangeNotifier implements AuthProvider {
  @override
  User? get currentUser => _User();
}

class _Unread extends Mock with ChangeNotifier implements UnreadCountProvider {
  @override
  bool get usesCursorReadState => false;
}

void main() {
  Future<void> pumpHub(WidgetTester tester, MemberProvider member) async {
    await tester.pumpWidget(MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>(create: (_) => _Auth()),
        ChangeNotifierProvider<MemberProvider>.value(value: member),
        ChangeNotifierProvider<UnreadCountProvider>(create: (_) => _Unread()),
      ],
      child: const MaterialApp(home: CommunicationHubScreen()),
    ));
    await tester.pump();
  }

  for (final scope in [
    ('calypso', 'previous-member'),
    ('other-club', 'current-member'),
  ]) {
    testWidgets('does not open inbox sources for foreign profile $scope',
        (tester) async {
      final member = MemberProvider(
          memberLoader: (_, __) async => {
                'app_role': 'admin',
                'clubStatuten': ['Encadrant'],
              });
      addTearDown(member.dispose);
      await member.loadMemberData(scope.$1, scope.$2);
      // No Firebase app is initialized: constructing an inbox source for this
      // foreign profile would fail the test as well as bypass the identity gate.
      await pumpHub(tester, member);
      expect(find.byKey(const ValueKey('communication-profile-pending')),
          findsOneWidget);
      expect(find.text('Annonces du club'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets('profile retry loads the authenticated identity', (tester) async {
    final requests = <String>[];
    final member = MemberProvider(memberLoader: (clubId, userId) async {
      requests.add('$clubId/$userId');
      return null;
    });
    addTearDown(member.dispose);
    await member.loadMemberData('calypso', 'previous-member');
    await pumpHub(tester, member);
    expect(find.text('Impossible de charger votre profil.'), findsOneWidget);
    await tester.tap(find.text('Réessayer'));
    await tester.pump();
    await tester.pump();
    expect(requests, ['calypso/previous-member', 'calypso/current-member']);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

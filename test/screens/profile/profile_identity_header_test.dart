import 'package:calymob/models/member_profile.dart';
import 'package:calymob/screens/profile/profile_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('offers a direct profile-photo entry point from Mon Profil', (
    tester,
  ) async {
    var wasOpened = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ProfileIdentityHeader(
            profile: MemberProfile(
              id: 'member-1',
              prenom: 'Ada',
              nom: 'Lovelace',
              email: 'ada@example.com',
            ),
            onTap: () => wasOpened = true,
          ),
        ),
      ),
    );

    expect(find.text('Modifier ma photo'), findsOneWidget);
    expect(
      tester.getSemantics(find.byType(ProfileIdentityHeader)),
      matchesSemantics(isButton: true, label: 'Modifier ma photo de profil'),
    );

    await tester.tap(find.text('Modifier ma photo'));

    expect(wasOpened, isTrue);
  });
}

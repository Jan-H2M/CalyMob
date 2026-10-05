import 'package:calymob/models/banking_info.dart';
import 'package:calymob/models/emergency_info.dart';
import 'package:calymob/models/medical_info.dart';
import 'package:calymob/providers/auth_provider.dart';
import 'package:calymob/providers/member_provider.dart';
import 'package:calymob/providers/unread_count_provider.dart';
import 'package:calymob/screens/profile/identite_screen.dart';
import 'package:calymob/screens/profile/mes_informations_screen.dart';
import 'package:calymob/screens/profile/settings_screen.dart';
import 'package:calymob/services/profile_service.dart';
import 'package:calymob/services/sensitive_info_service.dart';
import 'package:calymob/services/notification_service.dart';
import 'package:calymob/services/biometric_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' show User;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';
import 'package:provider/single_child_widget.dart';

class _MockUser extends Mock implements User {
  @override
  String get uid => 'member-1';
}

class _MockAuthProvider extends Mock implements AuthProvider {
  @override
  User? get currentUser => _MockUser();
}

class _MockMemberProvider extends Mock implements MemberProvider {
  @override
  String? get appRole => 'user';
}

class _MockUnreadCountProvider extends Mock implements UnreadCountProvider {
  @override
  bool get usesCursorReadState => false;
}

class _MockNotificationService extends Mock implements NotificationService {}

class _MockBiometricService extends Mock implements BiometricService {
  @override
  String get lastDiagnostic => '';
}

class _MockSensitiveInfoService extends Mock implements SensitiveInfoService {
  @override
  Stream<BankingInfo?> watchBanking(String clubId, String userId) =>
      Stream<BankingInfo?>.value(null);

  @override
  Stream<EmergencyInfo?> watchEmergency(String clubId, String userId) =>
      Stream<EmergencyInfo?>.value(null);

  @override
  Stream<MedicalInfo?> watchMedical(String clubId, String userId) =>
      Stream<MedicalInfo?>.value(null);
}

Future<FakeFirebaseFirestore> _profileFirestore() async {
  final firestore = FakeFirebaseFirestore();
  await firestore.doc('clubs/calypso/members/member-1').set({
    'first_name': 'Alice',
    'last_name': 'Example',
    'email': 'alice@example.test',
    'share_birthday': true,
  });
  await firestore.doc('clubs/calypso/member_directory/member-1').set({
    'first_name': 'Alice',
    'last_name': 'Example',
    'share_birthday': true,
    'birth_month': 7,
    'birth_day': 7,
  });
  return firestore;
}

Widget _withAuth(Widget child, {bool settingsProviders = false}) {
  final providers = <SingleChildWidget>[
    ChangeNotifierProvider<AuthProvider>.value(value: _MockAuthProvider()),
  ];
  if (settingsProviders) {
    providers.addAll([
      ChangeNotifierProvider<MemberProvider>.value(
        value: _MockMemberProvider(),
      ),
      ChangeNotifierProvider<UnreadCountProvider>.value(
        value: _MockUnreadCountProvider(),
      ),
    ]);
  }
  return MultiProvider(
    providers: providers,
    child: MaterialApp(home: child),
  );
}

Future<void> _toggleBirthday(WidgetTester tester) async {
  await tester.pump();
  await tester.pump();
  expect(find.byKey(const Key('birthday-sharing-switch')), findsOneWidget);
  await tester.ensureVisible(find.byKey(const Key('birthday-sharing-switch')));
  await tester.pump();
  await tester.tap(find.byKey(const Key('birthday-sharing-switch')));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  testWidgets('Identité never shows success for an empty unconfirmed receipt',
      (tester) async {
    final firestore = await _profileFirestore();
    final service = ProfileService(
      firestore: firestore,
      callableInvoker: (_, __) async => null,
      birthdayRecoveryDelays: const [Duration.zero],
    );

    await tester.pumpWidget(_withAuth(IdentiteScreen(profileService: service)));
    await _toggleBirthday(tester);

    expect(find.text('✅ Préférence anniversaire mise à jour'), findsNothing);
    expect(find.textContaining('❌ Erreur:'), findsOneWidget);
  });

  testWidgets('Paramètres never shows success for a mismatched receipt',
      (tester) async {
    final firestore = await _profileFirestore();
    final service = ProfileService(
      firestore: firestore,
      callableInvoker: (_, __) async => {'shareBirthday': true},
      birthdayRecoveryDelays: const [Duration.zero],
    );

    await tester.pumpWidget(_withAuth(
      SettingsScreen(
        profileService: service,
        notificationService: _MockNotificationService(),
        biometricService: _MockBiometricService(),
        runStartupChecks: false,
      ),
      settingsProviders: true,
    ));
    await _toggleBirthday(tester);

    expect(find.text('✅ Préférence anniversaire mise à jour'), findsNothing);
    expect(find.textContaining('❌ Erreur:'), findsOneWidget);
  });

  testWidgets('Mes informations shows success after confirmed recovery only',
      (tester) async {
    final firestore = await _profileFirestore();
    final service = ProfileService(
      firestore: firestore,
      callableInvoker: (_, __) async {
        await firestore.doc('clubs/calypso/members/member-1').update({
          'share_birthday': false,
        });
        await firestore.doc('clubs/calypso/member_directory/member-1').update({
          'share_birthday': false,
          'birth_month': null,
          'birth_day': null,
        });
        return null;
      },
      birthdayRecoveryDelays: const [Duration.zero],
    );

    await tester.pumpWidget(_withAuth(MesInformationsScreen(
      profileService: service,
      sensitiveInfoService: _MockSensitiveInfoService(),
    )));
    await _toggleBirthday(tester);

    expect(find.text('Modifications enregistrées'), findsOneWidget);
    expect(find.textContaining('Erreur:'), findsNothing);
  });
}

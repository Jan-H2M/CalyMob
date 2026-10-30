import 'dart:async';

import 'package:calymob/models/operation.dart';
import 'package:calymob/models/participant_operation.dart';
import 'package:calymob/models/member_profile.dart';
import 'package:calymob/models/event_message.dart';
import 'package:calymob/providers/auth_provider.dart';
import 'package:calymob/providers/event_message_provider.dart';
import 'package:calymob/providers/member_provider.dart';
import 'package:calymob/providers/operation_provider.dart';
import 'package:calymob/screens/operations/operation_detail_screen.dart';
import 'package:calymob/services/operation_service.dart';
import 'package:calymob/services/profile_service.dart';
import 'package:calymob/widgets/operation_unregister_button.dart';
import 'package:firebase_auth/firebase_auth.dart' show User;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/firebase_core_platform_interface.dart';
import 'package:firebase_core_platform_interface/test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';

class _MockAuthProvider extends Mock implements AuthProvider {
  _MockAuthProvider(this._user);

  final User _user;

  @override
  User? get currentUser => _user;
}

class _MockEventMessageProvider extends Mock implements EventMessageProvider {
  @override
  Stream<List<EventMessage>> watchMessages(
    String clubId,
    String operationId,
  ) =>
      const Stream.empty();
}

class _MockMemberProvider extends Mock
    with ChangeNotifier
    implements MemberProvider {
  _MockMemberProvider({
    this.statuten = const [],
    this.loadedClubId = 'calypso',
    this.loadedMemberId = 'member-1',
  });

  final List<String> statuten;
  final String loadedClubId;
  String loadedMemberId;

  @override
  bool isLoadedFor(String clubId, String userId) =>
      clubId == loadedClubId && userId == loadedMemberId;

  @override
  String? get appRole => 'membre';

  @override
  List<String> get clubStatuten => statuten;

  @override
  String? get plongeurCode => null;
}

class _MockOperationProvider extends Mock implements OperationProvider {
  _MockOperationProvider(
    this._operation, {
    this.remainingInscriptionAfterUnregister,
    this.unregisterError,
    this.participants = const [],
  });

  final Operation _operation;
  final ParticipantOperation? remainingInscriptionAfterUnregister;
  final Object? unregisterError;
  final List<ParticipantOperation> participants;
  final unregisterCalls = <Map<String, dynamic>>[];
  var reloadCalls = 0;
  var _isRegistered = true;
  var _isWaitlisted = false;

  @override
  Operation? get selectedOperation => _operation;

  @override
  List<ParticipantOperation> get selectedOperationParticipants => participants;

  @override
  bool get isLoading => false;

  @override
  int getParticipantCount(String operationId) => 1;

  @override
  bool isUserRegistered(String operationId) => _isRegistered;

  @override
  bool isUserWaitlisted(String operationId) => _isWaitlisted;

  @override
  Future<bool> selectOperation(
    String clubId,
    String operationId,
    String userId,
  ) async =>
      true;

  @override
  Future<ParticipantOperation?> unregisterFromOperation({
    required String clubId,
    required String operationId,
    required String inscriptionId,
    required String userId,
    String? guestAction,
  }) async {
    unregisterCalls.add({
      'clubId': clubId,
      'operationId': operationId,
      'inscriptionId': inscriptionId,
      'userId': userId,
      'guestAction': guestAction,
    });
    if (unregisterError != null) throw unregisterError!;
    _isRegistered = remainingInscriptionAfterUnregister != null &&
        !remainingInscriptionAfterUnregister!.isWaitlisted;
    _isWaitlisted = remainingInscriptionAfterUnregister?.isWaitlisted ?? false;
    return remainingInscriptionAfterUnregister;
  }

  @override
  Future<void> reloadParticipants(String clubId, String operationId) async {
    reloadCalls++;
  }
}

class _MockOperationService extends Mock implements OperationService {
  _MockOperationService(this.loadedInscription);

  final ParticipantOperation loadedInscription;

  @override
  Future<ParticipantOperation?> getUserInscription({
    required String clubId,
    required String operationId,
    required String userId,
  }) async =>
      loadedInscription;
}

class _MockProfileService extends Mock implements ProfileService {
  _MockProfileService({this.directoryProfile});

  MemberProfile? directoryProfile;
  Future<MemberProfile?>? pendingDirectoryProfile;
  var directoryLookups = 0;

  @override
  Future<MemberProfile?> getDirectoryProfile(
    String clubId,
    String userId,
  ) async {
    directoryLookups++;
    if (pendingDirectoryProfile != null) return pendingDirectoryProfile!;
    return directoryProfile;
  }
}

class _MockUser extends Mock implements User {
  @override
  String get uid => 'member-1';

  @override
  String? get email => 'member@example.com';
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    MethodChannelFirebase.appInstances = {};
    MethodChannelFirebase.isCoreInitialized = false;
    FirebasePlatform.instance = MethodChannelFirebase();
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    await initializeDateFormatting('fr_FR');
  });

  for (final explicitDeadline in [false, true]) {
    testWidgets(
        'event date stays distinct from the ${explicitDeadline ? 'explicit' : 'default'} registration deadline',
        (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final year = DateTime.now().year + 1;
      final operation = Operation(
        id: 'synthetic-date-event',
        type: 'evenement',
        titre: 'Sortie synthétique',
        montantPrevu: 0,
        statut: 'ouvert',
        dateDebut: DateTime(year, 11, 8, 12, 30),
        registrationDeadline:
            explicitDeadline ? DateTime(year, 11, 6, 18) : null,
        createdAt: DateTime(year - 1),
        updatedAt: DateTime(year - 1),
      );
      final inscription = ParticipantOperation(
        id: 'synthetic-registration',
        operationId: operation.id,
        membreId: 'member-1',
        prix: 0,
        dateInscription: DateTime(year, 10, 8),
      );
      await tester.pumpWidget(MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthProvider>.value(
              value: _MockAuthProvider(_MockUser())),
          ChangeNotifierProvider<EventMessageProvider>.value(
              value: _MockEventMessageProvider()),
          ChangeNotifierProvider<MemberProvider>.value(
              value: _MockMemberProvider()),
          ChangeNotifierProvider<OperationProvider>.value(
              value: _MockOperationProvider(operation)),
        ],
        child: MaterialApp(
          home: OperationDetailScreen(
            clubId: 'calypso',
            operationId: operation.id,
            operationService: _MockOperationService(inscription),
            profileService: _MockProfileService(),
            loadAuxiliaryProfileData: false,
          ),
        ),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.textContaining('8 novembre 12:30'), findsOneWidget);
      expect(
          find.textContaining(RegExp(explicitDeadline
              ? r'Clôture inscriptions : .*6 nov\. 18:00'
              : r'Clôture inscriptions : .*7 nov\. 12:30')),
          findsOneWidget);
      expect(find.textContaining('Inscr. '), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }

  testWidgets('encadrant contact respects consent and current identity',
      (tester) async {
    final now = DateTime(2026, 10, 15);
    final operation = Operation(
      id: 'synthetic-event',
      type: 'evenement',
      titre: 'Sortie synthétique',
      montantPrevu: 0,
      statut: 'ouvert',
      dateDebut: DateTime(2027, 10, 15),
      createdAt: now,
      updatedAt: now,
    );
    final participant = ParticipantOperation(
      id: 'registration-2',
      operationId: operation.id,
      membreId: 'member-2',
      membrePrenom: 'Alice',
      membreNom: 'Exemple',
      prix: 0,
      dateInscription: now,
    );
    final operationProvider = _MockOperationProvider(
      operation,
      participants: [participant],
    );
    final profile = MemberProfile(
      id: 'member-2',
      prenom: 'Alice',
      nom: 'Exemple',
      email: '',
      sharePhone: true,
      phoneNumber: '+32000000000',
    );

    final profileService = _MockProfileService(directoryProfile: profile);
    final memberProvider = _MockMemberProvider(statuten: const ['encadrant']);
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthProvider>.value(
            value: _MockAuthProvider(_MockUser()),
          ),
          ChangeNotifierProvider<EventMessageProvider>.value(
            value: _MockEventMessageProvider(),
          ),
          ChangeNotifierProvider<MemberProvider>.value(
            value: memberProvider,
          ),
          ChangeNotifierProvider<OperationProvider>.value(
            value: operationProvider,
          ),
        ],
        child: MaterialApp(
          home: OperationDetailScreen(
            clubId: 'calypso',
            operationId: operation.id,
            operationService: _MockOperationService(participant),
            profileService: profileService,
            loadAuxiliaryProfileData: false,
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.tap(find.text('Membres inscrits'));
    await tester.pump(const Duration(milliseconds: 350));
    await tester.ensureVisible(find.byTooltip('Téléphone de Alice Exemple'));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.tap(find.byTooltip('Téléphone de Alice Exemple'));
    await tester.pump(const Duration(milliseconds: 350));
    expect(find.text('+32000000000'), findsOneWidget);

    await tester.tap(find.text('Fermer'));
    await tester.pump(const Duration(milliseconds: 350));
    profileService.directoryProfile = MemberProfile(
      id: 'member-2',
      prenom: 'Alice',
      nom: 'Exemple',
      email: '',
      sharePhone: false,
      phoneNumber: '+32000000000',
    );
    await tester.tap(find.byTooltip('Téléphone de Alice Exemple'));
    await tester.pump(const Duration(milliseconds: 350));
    expect(find.text('+32000000000'), findsNothing);
    expect(find.text('Numéro indisponible ou non partagé'), findsOneWidget);

    // Authority can disappear while the directory response is in flight.
    final pendingProfile = Completer<MemberProfile?>();
    profileService.pendingDirectoryProfile = pendingProfile.future;
    await tester.tap(find.byTooltip('Téléphone de Alice Exemple'));
    await tester.pump();
    expect(profileService.directoryLookups, 3);

    memberProvider.loadedMemberId = 'previous-member';
    pendingProfile.complete(profile);
    await tester.pump(const Duration(milliseconds: 350));
    expect(find.text('+32000000000'), findsNothing);

    // An already-rendered callback must also recheck before another lookup.
    await tester.tap(find.byTooltip('Téléphone de Alice Exemple'));
    await tester.pump();
    expect(profileService.directoryLookups, 3);

    memberProvider.notifyListeners();
    await tester.pump();
    expect(find.byTooltip('Téléphone de Alice Exemple'), findsNothing);
  });

  for (final scenario in [
    (
      name: 'ordinary member',
      roles: <String>[],
      clubId: 'calypso',
      memberId: 'member-1',
    ),
    (
      name: 'cached encadrant from another account',
      roles: ['encadrant'],
      clubId: 'calypso',
      memberId: 'previous-member',
    ),
    (
      name: 'cached encadrant from another club',
      roles: ['encadrant'],
      clubId: 'another-club',
      memberId: 'member-1',
    ),
  ]) {
    testWidgets('${scenario.name} cannot open a participant phone',
        (tester) async {
      final now = DateTime(2026, 10, 15);
      final operation = Operation(
        id: 'synthetic-event-member-view',
        type: 'evenement',
        titre: 'Sortie synthétique',
        montantPrevu: 0,
        statut: 'ouvert',
        dateDebut: DateTime(2027, 10, 15),
        createdAt: now,
        updatedAt: now,
      );
      final participant = ParticipantOperation(
        id: 'registration-2',
        operationId: operation.id,
        membreId: 'member-2',
        membrePrenom: 'Alice',
        membreNom: 'Exemple',
        prix: 0,
        dateInscription: now,
      );
      final profileService = _MockProfileService(
        directoryProfile: MemberProfile(
          id: 'member-2',
          prenom: 'Alice',
          nom: 'Exemple',
          email: '',
          sharePhone: true,
          phoneNumber: '+32000000000',
        ),
      );

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<AuthProvider>.value(
              value: _MockAuthProvider(_MockUser()),
            ),
            ChangeNotifierProvider<EventMessageProvider>.value(
              value: _MockEventMessageProvider(),
            ),
            ChangeNotifierProvider<MemberProvider>.value(
              value: _MockMemberProvider(
                statuten: scenario.roles,
                loadedClubId: scenario.clubId,
                loadedMemberId: scenario.memberId,
              ),
            ),
            ChangeNotifierProvider<OperationProvider>.value(
              value: _MockOperationProvider(
                operation,
                participants: [participant],
              ),
            ),
          ],
          child: MaterialApp(
            home: OperationDetailScreen(
              clubId: 'calypso',
              operationId: operation.id,
              operationService: _MockOperationService(participant),
              profileService: profileService,
              loadAuxiliaryProfileData: false,
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      await tester.tap(find.text('Membres inscrits'));
      await tester.pump(const Duration(milliseconds: 350));

      expect(find.text('Alice Exemple'), findsOneWidget);
      expect(find.byTooltip('Téléphone de Alice Exemple'), findsNothing);
      expect(profileService.directoryLookups, 0);
    });
  }

  testWidgets(
      'exact cancellation reloads and renders a remaining own inscription',
      (tester) async {
    const clubId = 'calypso';
    const operationId = 'event-with-history';
    const memberId = 'member-1';
    const visibleInscriptionId = 'visible-active-registration';
    final now = DateTime(2026, 9, 12);
    final operation = Operation(
      id: operationId,
      type: 'evenement',
      titre: 'Sortie test',
      montantPrevu: 0,
      statut: 'ouvert',
      dateDebut: DateTime(2027, 9, 12),
      createdAt: now,
      updatedAt: now,
    );
    final loadedInscription = ParticipantOperation(
      id: visibleInscriptionId,
      operationId: operationId,
      membreId: memberId,
      prix: 0,
      dateInscription: now,
    );
    final remainingInscription = ParticipantOperation(
      id: 'remaining-active-registration',
      operationId: operationId,
      membreId: memberId,
      prix: 0,
      dateInscription: now.subtract(const Duration(days: 1)),
    );

    final user = _MockUser();
    final authProvider = _MockAuthProvider(user);
    final eventMessageProvider = _MockEventMessageProvider();
    final memberProvider = _MockMemberProvider();
    final operationProvider = _MockOperationProvider(
      operation,
      remainingInscriptionAfterUnregister: remainingInscription,
    );
    final operationService = _MockOperationService(loadedInscription);
    final profileService = _MockProfileService();

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthProvider>.value(value: authProvider),
          ChangeNotifierProvider<EventMessageProvider>.value(
            value: eventMessageProvider,
          ),
          ChangeNotifierProvider<MemberProvider>.value(value: memberProvider),
          ChangeNotifierProvider<OperationProvider>.value(
            value: operationProvider,
          ),
        ],
        child: MaterialApp(
          home: OperationDetailScreen(
            clubId: clubId,
            operationId: operationId,
            operationService: operationService,
            profileService: profileService,
            loadAuxiliaryProfileData: false,
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byType(OperationUnregisterButton), findsOneWidget);
    await tester.tap(find.byType(OperationUnregisterButton));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Confirmer la désinscription'), findsOneWidget);

    await tester.tap(find.text('Se désinscrire'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(operationProvider.unregisterCalls, [
      {
        'clubId': clubId,
        'operationId': operationId,
        'inscriptionId': visibleInscriptionId,
        'userId': memberId,
        'guestAction': null,
      }
    ]);
    expect(operationProvider.reloadCalls, 1);
    expect(find.byType(OperationUnregisterButton), findsOneWidget);
    expect(
      tester
          .widget<OperationUnregisterButton>(
            find.byType(OperationUnregisterButton),
          )
          .inscriptionId,
      remainingInscription.id,
    );
  });

  testWidgets(
      'failed strict refresh preserves the visible registration after withdrawal',
      (tester) async {
    const clubId = 'calypso';
    const operationId = 'event-refresh-failure';
    const memberId = 'member-1';
    const visibleInscriptionId = 'visible-active-registration';
    final now = DateTime(2026, 9, 12);
    final operation = Operation(
      id: operationId,
      type: 'evenement',
      titre: 'Sortie test',
      montantPrevu: 0,
      statut: 'ouvert',
      dateDebut: DateTime(2027, 9, 12),
      createdAt: now,
      updatedAt: now,
    );
    final loadedInscription = ParticipantOperation(
      id: visibleInscriptionId,
      operationId: operationId,
      membreId: memberId,
      prix: 0,
      dateInscription: now,
    );
    final operationProvider = _MockOperationProvider(
      operation,
      unregisterError: StateError('refresh failed'),
    );

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthProvider>.value(
            value: _MockAuthProvider(_MockUser()),
          ),
          ChangeNotifierProvider<EventMessageProvider>.value(
            value: _MockEventMessageProvider(),
          ),
          ChangeNotifierProvider<MemberProvider>.value(
            value: _MockMemberProvider(),
          ),
          ChangeNotifierProvider<OperationProvider>.value(
            value: operationProvider,
          ),
        ],
        child: MaterialApp(
          home: OperationDetailScreen(
            clubId: clubId,
            operationId: operationId,
            operationService: _MockOperationService(loadedInscription),
            profileService: _MockProfileService(),
            loadAuxiliaryProfileData: false,
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    await tester.tap(find.byType(OperationUnregisterButton));
    await tester.pump();
    await tester.tap(find.text('Se désinscrire'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(operationProvider.unregisterCalls, hasLength(1));
    expect(find.textContaining('refresh failed'), findsOneWidget);
    expect(find.byType(OperationUnregisterButton), findsOneWidget);
    expect(
      tester
          .widget<OperationUnregisterButton>(
            find.byType(OperationUnregisterButton),
          )
          .inscriptionId,
      visibleInscriptionId,
    );
    expect(find.text("S'inscrire"), findsNothing);
  });
}

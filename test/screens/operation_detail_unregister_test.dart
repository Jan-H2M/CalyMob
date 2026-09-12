import 'package:calymob/models/operation.dart';
import 'package:calymob/models/participant_operation.dart';
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

class _MockMemberProvider extends Mock implements MemberProvider {
  @override
  String? get appRole => 'membre';

  @override
  List<String> get clubStatuten => const [];

  @override
  String? get plongeurCode => null;
}

class _MockOperationProvider extends Mock implements OperationProvider {
  _MockOperationProvider(
    this._operation, {
    this.remainingInscriptionAfterUnregister,
  });

  final Operation _operation;
  final ParticipantOperation? remainingInscriptionAfterUnregister;
  final unregisterCalls = <Map<String, dynamic>>[];
  var reloadCalls = 0;
  var _isRegistered = true;
  var _isWaitlisted = false;

  @override
  Operation? get selectedOperation => _operation;

  @override
  List<ParticipantOperation> get selectedOperationParticipants => const [];

  @override
  bool get isLoading => false;

  @override
  int getParticipantCount(String operationId) => 1;

  @override
  bool isUserRegistered(String operationId) => _isRegistered;

  @override
  bool isUserWaitlisted(String operationId) => _isWaitlisted;

  @override
  Future<void> selectOperation(
    String clubId,
    String operationId,
    String userId,
  ) async {}

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

class _MockProfileService extends Mock implements ProfileService {}

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
}

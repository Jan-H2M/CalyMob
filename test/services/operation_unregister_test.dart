import 'package:calymob/models/operation.dart';
import 'package:calymob/models/participant_operation.dart';
import 'package:calymob/services/operation_service.dart';
import 'package:calymob/providers/operation_provider.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions_platform_interface/cloud_functions_platform_interface.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/firebase_core_platform_interface.dart';
import 'package:firebase_core_platform_interface/test.dart';
import 'package:flutter_test/flutter_test.dart';

typedef _CallableHandler = Future<dynamic> Function(
  String name,
  dynamic parameters,
);

class _MockHttpsCallablePlatform extends HttpsCallablePlatform {
  _MockHttpsCallablePlatform(
    FirebaseFunctionsPlatform functions,
    String? origin,
    String? name,
    HttpsCallableOptions options,
    this._handler,
  ) : super(functions, origin, name, options, null);

  final _CallableHandler _handler;

  @override
  Future<dynamic> call([dynamic parameters]) => _handler(name!, parameters);
}

class _MockFirebaseFunctionsPlatform extends FirebaseFunctionsPlatform {
  _MockFirebaseFunctionsPlatform({FirebaseApp? app, required String region})
      : super(app, region);

  static _CallableHandler? handler;

  @override
  HttpsCallablePlatform httpsCallable(
    String? origin,
    String name,
    HttpsCallableOptions options,
  ) {
    return _MockHttpsCallablePlatform(
      this,
      origin,
      name,
      options,
      handler ?? (_, __) async => null,
    );
  }

  @override
  HttpsCallablePlatform httpsCallableWithUri(
    String? origin,
    Uri uri,
    HttpsCallableOptions options,
  ) {
    return _MockHttpsCallablePlatform(
      this,
      origin,
      uri.toString(),
      options,
      handler ?? (_, __) async => null,
    );
  }

  @override
  FirebaseFunctionsPlatform delegateFor({
    FirebaseApp? app,
    required String region,
  }) {
    return _MockFirebaseFunctionsPlatform(app: app, region: region);
  }
}

class _RecordingOperationService extends OperationService {
  _RecordingOperationService({this.remainingInscription})
      : super(firestore: FakeFirebaseFirestore());

  final calls = <Map<String, dynamic>>[];
  final ParticipantOperation? remainingInscription;
  var getUserInscriptionCalls = 0;

  @override
  Future<void> unregisterFromOperation({
    required String clubId,
    required String operationId,
    required String inscriptionId,
    required String userId,
    String? guestAction,
  }) async {
    calls.add({
      'clubId': clubId,
      'operationId': operationId,
      'inscriptionId': inscriptionId,
      'userId': userId,
      'guestAction': guestAction,
    });
  }

  @override
  Future<ParticipantOperation?> getUserInscription({
    required String clubId,
    required String operationId,
    required String userId,
  }) async {
    getUserInscriptionCalls++;
    return remainingInscription;
  }

  @override
  Future<ParticipantOperation?> getUserInscriptionStrict({
    required String clubId,
    required String operationId,
    required String userId,
  }) async {
    getUserInscriptionCalls++;
    return remainingInscription;
  }
}

class _FailingRefreshOperationService extends _RecordingOperationService {
  _FailingRefreshOperationService(this.initialInscription)
      : operation = Operation(
          id: initialInscription.operationId,
          type: 'evenement',
          titre: 'Sortie test',
          montantPrevu: 0,
          statut: 'ouvert',
          dateDebut: DateTime(2027, 9, 12),
          createdAt: DateTime(2026, 9, 12),
          updatedAt: DateTime(2026, 9, 12),
        );

  final ParticipantOperation initialInscription;
  final Operation operation;

  @override
  Future<Operation?> getOperationById(
          String clubId, String operationId) async =>
      operation;

  @override
  Future<int> countParticipants(String clubId, String operationId) async => 1;

  @override
  Stream<List<ParticipantOperation>> getParticipantsStream(
    String clubId,
    String operationId,
  ) =>
      const Stream.empty();

  @override
  Future<bool> isUserRegistered(
    String clubId,
    String operationId,
    String userId,
  ) async =>
      true;

  @override
  Future<ParticipantOperation?> getUserInscription({
    required String clubId,
    required String operationId,
    required String userId,
  }) async =>
      initialInscription;

  @override
  Future<ParticipantOperation?> getUserInscriptionStrict({
    required String clubId,
    required String operationId,
    required String userId,
  }) async {
    throw StateError('refresh failed');
  }
}

void main() {
  const clubId = 'calypso';
  const operationId = 'croisette-event';
  const inscriptionId = 'pending-payment-inscription';
  late OperationService service;
  late FakeFirebaseFirestore firestore;
  late List<Map<String, dynamic>> calls;

  setUp(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    MethodChannelFirebase.appInstances = {};
    MethodChannelFirebase.isCoreInitialized = false;
    FirebasePlatform.instance = MethodChannelFirebase();
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseFunctionsPlatform.instance = _MockFirebaseFunctionsPlatform(
      region: 'europe-west1',
    );

    calls = [];
    _MockFirebaseFunctionsPlatform.handler = (name, parameters) async {
      calls.add({
        'name': name,
        'parameters': Map<String, dynamic>.from(parameters as Map),
      });
      return {'status': 'canceled'};
    };
    firestore = FakeFirebaseFirestore();
    service = OperationService(firestore: firestore);
  });

  tearDown(() {
    _MockFirebaseFunctionsPlatform.handler = null;
  });

  test('targets the exact known inscription once', () async {
    await service.unregisterFromOperation(
      clubId: clubId,
      operationId: operationId,
      inscriptionId: inscriptionId,
      userId: 'member-1',
    );

    expect(calls, hasLength(1));
    expect(calls.single['name'], 'unregisterFromEvent');
    expect(calls.single['parameters'], {
      'clubId': clubId,
      'operationId': operationId,
      'inscriptionId': inscriptionId,
      'source': 'calymob',
      'reason': 'self_withdrawal',
    });
  });

  test('preserves the selected guest action beside the exact inscription',
      () async {
    await service.unregisterFromOperation(
      clubId: clubId,
      operationId: operationId,
      inscriptionId: inscriptionId,
      userId: 'member-1',
      guestAction: 'delete',
    );

    expect(calls.single['parameters'], containsPair('guestAction', 'delete'));
    expect(
      calls.single['parameters'],
      containsPair('inscriptionId', inscriptionId),
    );
  });

  test('fails closed before the callable when inscription id is missing',
      () async {
    await expectLater(
      service.unregisterFromOperation(
        clubId: clubId,
        operationId: operationId,
        inscriptionId: '',
        userId: 'member-1',
      ),
      throwsArgumentError,
    );
    expect(calls, isEmpty);
  });

  test('fails closed before the callable when inscription id is whitespace',
      () async {
    await expectLater(
      service.unregisterFromOperation(
        clubId: clubId,
        operationId: operationId,
        inscriptionId: '   ',
        userId: 'member-1',
      ),
      throwsArgumentError,
    );
    expect(calls, isEmpty);
  });

  test('provider forwards the exact inscription id once to the service',
      () async {
    final recordingService = _RecordingOperationService();
    final provider = OperationProvider(operationService: recordingService);

    await provider.unregisterFromOperation(
      clubId: clubId,
      operationId: operationId,
      inscriptionId: inscriptionId,
      userId: 'member-1',
      guestAction: 'transfer',
    );

    expect(recordingService.calls, [
      {
        'clubId': clubId,
        'operationId': operationId,
        'inscriptionId': inscriptionId,
        'userId': 'member-1',
        'guestAction': 'transfer',
      }
    ]);
    expect(recordingService.getUserInscriptionCalls, 1);
    expect(provider.isUserRegistered(operationId), isFalse);
    expect(provider.isUserWaitlisted(operationId), isFalse);
  });

  test('provider derives its state from a remaining active own inscription',
      () async {
    final remaining = ParticipantOperation(
      id: 'remaining-active-registration',
      operationId: operationId,
      membreId: 'member-1',
      prix: 0,
      dateInscription: DateTime(2026, 9, 1),
    );
    final recordingService = _RecordingOperationService(
      remainingInscription: remaining,
    );
    final provider = OperationProvider(operationService: recordingService);

    final result = await provider.unregisterFromOperation(
      clubId: clubId,
      operationId: operationId,
      inscriptionId: inscriptionId,
      userId: 'member-1',
    );

    expect(recordingService.calls.single['inscriptionId'], inscriptionId);
    expect(recordingService.getUserInscriptionCalls, 1);
    expect(result?.id, remaining.id);
    expect(provider.isUserRegistered(operationId), isTrue);
    expect(provider.isUserWaitlisted(operationId), isFalse);
  });

  test('canonical own registration prefers non-waitlisted then newest',
      () async {
    final registrations = firestore.collection(
      'clubs/$clubId/operations/$operationId/inscriptions',
    );
    await registrations.doc('active-old').set({
      'operation_id': operationId,
      'membre_id': 'member-1',
      'registration_status': 'confirmed',
      'date_inscription': Timestamp.fromDate(DateTime(2026, 9, 10)),
      'prix': 0,
    });
    await registrations.doc('active-new').set({
      'operation_id': operationId,
      'membre_id': 'member-1',
      'registration_status': 'pending_payment',
      'date_inscription': Timestamp.fromDate(DateTime(2026, 9, 11)),
      'prix': 0,
    });
    await registrations.doc('waitlisted-newest').set({
      'operation_id': operationId,
      'membre_id': 'member-1',
      'registration_status': 'waitlisted',
      'date_inscription': Timestamp.fromDate(DateTime(2026, 9, 12)),
      'prix': 0,
    });

    final result = await service.getUserInscriptionStrict(
      clubId: clubId,
      operationId: operationId,
      userId: 'member-1',
    );

    expect(result?.id, 'active-new');
  });

  test('canonical own registration uses document id as a stable tie-break',
      () async {
    final registrations = firestore.collection(
      'clubs/$clubId/operations/$operationId/inscriptions',
    );
    final date = Timestamp.fromDate(DateTime(2026, 9, 11));
    for (final id in ['z-registration', 'a-registration', 'm-registration']) {
      await registrations.doc(id).set({
        'operation_id': operationId,
        'membre_id': 'member-1',
        'registration_status': 'confirmed',
        'date_inscription': date,
        'prix': 0,
      });
    }

    final result = await service.getUserInscriptionStrict(
      clubId: clubId,
      operationId: operationId,
      userId: 'member-1',
    );

    expect(result?.id, 'a-registration');
  });

  test('provider returns the canonical remaining document from three own docs',
      () async {
    final registrations = firestore.collection(
      'clubs/$clubId/operations/$operationId/inscriptions',
    );
    await registrations.doc(inscriptionId).set({
      'operation_id': operationId,
      'membre_id': 'member-1',
      'registration_status': 'confirmed',
      'date_inscription': Timestamp.fromDate(DateTime(2026, 9, 12)),
      'prix': 0,
    });
    await registrations.doc('remaining-active').set({
      'operation_id': operationId,
      'membre_id': 'member-1',
      'registration_status': 'confirmed',
      'date_inscription': Timestamp.fromDate(DateTime(2026, 9, 10)),
      'prix': 0,
    });
    await registrations.doc('remaining-waitlist').set({
      'operation_id': operationId,
      'membre_id': 'member-1',
      'registration_status': 'waitlisted',
      'date_inscription': Timestamp.fromDate(DateTime(2026, 9, 11)),
      'prix': 0,
    });
    _MockFirebaseFunctionsPlatform.handler = (_, parameters) async {
      final data = Map<String, dynamic>.from(parameters as Map);
      await registrations.doc(data['inscriptionId'] as String).update({
        'registration_status': 'canceled',
      });
      return {'status': 'canceled'};
    };
    final provider = OperationProvider(operationService: service);

    final result = await provider.unregisterFromOperation(
      clubId: clubId,
      operationId: operationId,
      inscriptionId: inscriptionId,
      userId: 'member-1',
    );

    expect(result?.id, 'remaining-active');
    expect(provider.isUserRegistered(operationId), isTrue);
    expect(provider.isUserWaitlisted(operationId), isFalse);
  });

  test('successful withdrawal with failed refresh preserves registered state',
      () async {
    final initial = ParticipantOperation(
      id: inscriptionId,
      operationId: operationId,
      membreId: 'member-1',
      prix: 0,
      dateInscription: DateTime(2026, 9, 1),
    );
    final recordingService = _FailingRefreshOperationService(initial);
    final provider = OperationProvider(operationService: recordingService);
    await provider.selectOperation(clubId, operationId, 'member-1');
    expect(provider.isUserRegistered(operationId), isTrue);

    await expectLater(
      provider.unregisterFromOperation(
        clubId: clubId,
        operationId: operationId,
        inscriptionId: inscriptionId,
        userId: 'member-1',
      ),
      throwsStateError,
    );

    expect(recordingService.calls.single['inscriptionId'], inscriptionId);
    expect(provider.isUserRegistered(operationId), isTrue);
    expect(provider.isUserWaitlisted(operationId), isFalse);
    expect(provider.errorMessage, contains('refresh failed'));
  });

  test('keeps the exact callable error available to the screen', () async {
    _MockFirebaseFunctionsPlatform.handler = (_, __) async {
      throw FirebaseFunctionsException(
        code: 'not-found',
        message: 'Inscription introuvable.',
      );
    };

    await expectLater(
      service.unregisterFromOperation(
        clubId: clubId,
        operationId: operationId,
        inscriptionId: inscriptionId,
        userId: 'member-1',
      ),
      throwsA(
        isA<FirebaseFunctionsException>()
            .having((error) => error.code, 'code', 'not-found')
            .having(
              (error) => error.message,
              'message',
              'Inscription introuvable.',
            ),
      ),
    );
    expect(calls, isEmpty);
  });
}

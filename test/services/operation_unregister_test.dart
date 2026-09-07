import 'package:calymob/services/operation_service.dart';
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

void main() {
  const clubId = 'calypso';
  const operationId = 'croisette-event';
  const inscriptionId = 'pending-payment-inscription';
  late OperationService service;
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
    service = OperationService(firestore: FakeFirebaseFirestore());
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

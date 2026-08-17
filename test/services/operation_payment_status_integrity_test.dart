import 'package:cloud_functions_platform_interface/cloud_functions_platform_interface.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/firebase_core_platform_interface.dart';
import 'package:firebase_core_platform_interface/test.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:calymob/services/operation_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';

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
  FirebaseFunctionsPlatform delegateFor(
      {FirebaseApp? app, required String region}) {
    return _MockFirebaseFunctionsPlatform(app: app, region: region);
  }
}

void main() {
  const clubId = 'calypso';
  const operationId = 'operation-1';
  const participantId = 'inscription-1';

  late FakeFirebaseFirestore firestore;
  late OperationService service;
  late List<Map<String, dynamic>> calls;

  setUp(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    MethodChannelFirebase.appInstances = {};
    MethodChannelFirebase.isCoreInitialized = false;
    FirebasePlatform.instance = MethodChannelFirebase();
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseFunctionsPlatform.instance =
        _MockFirebaseFunctionsPlatform(region: 'europe-west1');

    calls = [];
    _MockFirebaseFunctionsPlatform.handler = (name, parameters) async {
      calls.add({'name': name, 'parameters': parameters});
      if (parameters['status'] == 'qr_on_site') {
        throw FirebaseFunctionsException(
          code: 'failed-precondition',
          message:
              'Deze betaalmethode is niet toegestaan voor deze activiteit.',
        );
      }
      return {'success': true};
    };

    firestore = FakeFirebaseFirestore();
    service = OperationService(firestore: firestore);
    await firestore
        .doc(
            'clubs/$clubId/operations/$operationId/inscriptions/$participantId')
        .set({'payment_status': null});
  });

  tearDown(() {
    _MockFirebaseFunctionsPlatform.handler = null;
  });

  test('routes a disallowed on-site status to the server command', () async {
    await expectLater(
      service.updatePaymentStatus(
        clubId: clubId,
        operationId: operationId,
        participantId: participantId,
        status: 'qr_on_site',
      ),
      throwsA(isA<FirebaseFunctionsException>()),
    );

    expect(calls, hasLength(1));
    expect(calls.single['name'], 'recordPaymentCommunication');
    expect(calls.single['parameters'], {
      'clubId': clubId,
      'operationId': operationId,
      'participantId': participantId,
      'status': 'qr_on_site',
    });

    // The client must not write accounting state when the server rejects it.
    final inscription = await firestore
        .doc(
            'clubs/$clubId/operations/$operationId/inscriptions/$participantId')
        .get();
    expect(inscription.data()!['payment_status'], isNull);
  });

  test('sends an allowed communication status through the server command',
      () async {
    await service.updatePaymentStatus(
      clubId: clubId,
      operationId: operationId,
      participantId: participantId,
      status: 'qr_email_sent',
    );

    expect(calls.single['name'], 'recordPaymentCommunication');
    expect(calls.single['parameters'], {
      'clubId': clubId,
      'operationId': operationId,
      'participantId': participantId,
      'status': 'qr_email_sent',
    });
    final inscription = await firestore
        .doc(
            'clubs/$clubId/operations/$operationId/inscriptions/$participantId')
        .get();
    expect(inscription.data()!['payment_status'], isNull);
  });

  test('does not author a payment status directly in Firestore', () async {
    await service.updatePaymentStatus(
      clubId: clubId,
      operationId: operationId,
      participantId: participantId,
      status: 'qr_email_sent',
    );

    final inscription = await firestore
        .doc(
            'clubs/$clubId/operations/$operationId/inscriptions/$participantId')
        .get();
    expect(inscription.data()!['payment_status'], isNull);
  });
}

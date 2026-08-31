import 'package:cloud_functions_platform_interface/cloud_functions_platform_interface.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/firebase_core_platform_interface.dart';
import 'package:firebase_core_platform_interface/test.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:calymob/services/operation_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';

typedef _CallableHandler = Future<dynamic> Function(
    String name, dynamic parameters);

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
    FirebaseFunctionsPlatform.instance = _MockFirebaseFunctionsPlatform(
      region: 'europe-west1',
    );

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
    await firestore.doc('clubs/$clubId/operations/$operationId').set({
      'payment_required': true,
      'allowed_payment_methods': ['on_site', 'qr_email'],
    });
    await firestore
        .doc(
      'clubs/$clubId/operations/$operationId/inscriptions/$participantId',
    )
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
          'clubs/$clubId/operations/$operationId/inscriptions/$participantId',
        )
        .get();
    expect(inscription.data()!['payment_status'], isNull);
  });

  test(
    'sends an allowed communication status through the server command',
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
            'clubs/$clubId/operations/$operationId/inscriptions/$participantId',
          )
          .get();
      expect(inscription.data()!['payment_status'], isNull);
    },
  );

  test('does not author a payment status directly in Firestore', () async {
    await service.updatePaymentStatus(
      clubId: clubId,
      operationId: operationId,
      participantId: participantId,
      status: 'qr_email_sent',
    );

    final inscription = await firestore
        .doc(
          'clubs/$clubId/operations/$operationId/inscriptions/$participantId',
        )
        .get();
    expect(inscription.data()!['payment_status'], isNull);
  });

  for (final status in ['paid', 'pending', '', 'qr_immediate']) {
    test('rejects noncommunication status $status without any write', () async {
      await expectLater(
        service.updatePaymentStatus(
          clubId: clubId,
          operationId: operationId,
          participantId: participantId,
          status: status,
        ),
        throwsArgumentError,
      );
      expect(calls, isEmpty);
    });
  }

  for (final operationData in <Map<String, dynamic>>[
    {'payment_required': false},
    {'payment_required': true, 'allowed_payment_methods': <String>[]},
    {
      'payment_required': true,
      'allowed_payment_methods': ['on_site'],
    },
    {'prix_membre': 0},
  ]) {
    test('retains payment method preflight $operationData', () async {
      await firestore
          .doc('clubs/$clubId/operations/$operationId')
          .set(operationData);
      await expectLater(
        service.updatePaymentStatus(
          clubId: clubId,
          operationId: operationId,
          participantId: participantId,
          status: 'qr_email_sent',
        ),
        throwsA(isA<PaymentMethodNotAllowedException>()),
      );
      expect(calls, isEmpty);
      expect(
        (await firestore
                .doc(
                  'clubs/$clubId/operations/$operationId/inscriptions/$participantId',
                )
                .get())
            .data(),
        {'payment_status': null},
      );
    });
  }

  test('legacy paid tariff and default methods remain supported', () async {
    await firestore.doc('clubs/$clubId/operations/$operationId').set({
      'event_tariffs': [
        {'price': 10},
      ],
    });
    await service.updatePaymentStatus(
      clubId: clubId,
      operationId: operationId,
      participantId: participantId,
      status: 'qr_email_sent',
    );
    expect(calls.single['name'], 'recordPaymentCommunication');
  });

  test('missing activity fails before communication command', () async {
    await firestore.doc('clubs/$clubId/operations/$operationId').delete();
    await expectLater(
      service.updatePaymentStatus(
        clubId: clubId,
        operationId: operationId,
        participantId: participantId,
        status: 'qr_email_sent',
      ),
      throwsStateError,
    );
    expect(calls, isEmpty);
  });

  test(
    'paid status protection is delegated without client downgrade',
    () async {
      final ref = firestore.doc(
        'clubs/$clubId/operations/$operationId/inscriptions/$participantId',
      );
      final paid = {
        'paye': true,
        'payment_status': 'paid',
        'transaction_matched': true,
      };
      await ref.set(paid);
      await service.updatePaymentStatus(
        clubId: clubId,
        operationId: operationId,
        participantId: participantId,
        status: 'qr_email_sent',
      );
      expect(calls.single['name'], 'recordPaymentCommunication');
      expect((await ref.get()).data(), paid);
    },
  );

  for (final installment in [false, true]) {
    Future<void> confirm(OperationService service) => installment
        ? service.markInstallmentAsPaid(
            clubId: clubId,
            operationId: operationId,
            participantId: participantId,
            installmentId: 'deposit-2',
          )
        : service.markParticipantAsPaid(
            clubId: clubId,
            operationId: operationId,
            participantId: participantId,
          );

    test(
      'delegates ${installment ? 'installment' : 'full'} confirmation and retries unchanged',
      () async {
        final ref = firestore.doc(
          'clubs/$clubId/operations/$operationId/inscriptions/$participantId',
        );
        final before = {
          'paye': false,
          'installment_payments': {
            'deposit-2': {'status': 'pending', 'amount_due': 30},
            'balance': {'status': 'pending', 'amount_due': 70},
          },
        };
        await ref.set(before);
        await confirm(service);
        await confirm(service);
        expect(calls, hasLength(2));
        expect(calls[0], calls[1]);
        expect(
          calls.first['name'],
          installment ? 'recordInstallmentPayment' : 'recordOnSitePayment',
        );
        expect(calls.first['parameters'], {
          'clubId': clubId,
          'operationId': operationId,
          'participantId': participantId,
          if (installment) 'installmentId': 'deposit-2',
        });
        expect((await ref.get()).data(), before);
      },
    );

    for (final code in [
      'permission-denied',
      'failed-precondition',
      'not-found',
      'unavailable',
    ]) {
      test(
        '${installment ? 'installment' : 'full'} server $code leaves accounting untouched',
        () async {
          final ref = firestore.doc(
            'clubs/$clubId/operations/$operationId/inscriptions/$participantId',
          );
          final before = (await ref.get()).data();
          _MockFirebaseFunctionsPlatform.handler = (_, __) async {
            throw FirebaseFunctionsException(code: code, message: 'Rejected');
          };
          await expectLater(
            confirm(service),
            throwsA(isA<FirebaseFunctionsException>()),
          );
          expect((await ref.get()).data(), before);
        },
      );
    }
  }
}

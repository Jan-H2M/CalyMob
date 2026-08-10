import 'package:calymob/services/operation_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const clubId = 'calypso';
  const operationId = 'operation-1';
  const participantId = 'inscription-1';

  late FakeFirebaseFirestore firestore;
  late OperationService service;

  setUp(() async {
    firestore = FakeFirebaseFirestore();
    service = OperationService(firestore: firestore);

    await firestore.doc('clubs/$clubId/operations/$operationId').set({
      'payment_required': true,
      'allowed_payment_methods': ['qr_email'],
    });
    await firestore
        .doc(
      'clubs/$clubId/operations/$operationId/inscriptions/$participantId',
    )
        .set({'payment_status': null});
  });

  test('rejects on-site status when the current activity disallows it',
      () async {
    await expectLater(
      service.updatePaymentStatus(
        clubId: clubId,
        operationId: operationId,
        participantId: participantId,
        status: 'qr_on_site',
      ),
      throwsA(isA<PaymentMethodNotAllowedException>()),
    );

    final inscription = await firestore
        .doc(
          'clubs/$clubId/operations/$operationId/inscriptions/$participantId',
        )
        .get();
    expect(inscription.data()!['payment_status'], isNull);
  });

  test('accepts the payment method allowed by the current activity', () async {
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
    expect(inscription.data()!['payment_status'], 'qr_email_sent');
  });

  test('rechecks a changed activity immediately before writing', () async {
    await firestore.doc('clubs/$clubId/operations/$operationId').update({
      'allowed_payment_methods': ['on_site'],
    });

    await service.updatePaymentStatus(
      clubId: clubId,
      operationId: operationId,
      participantId: participantId,
      status: 'qr_on_site',
    );

    final inscription = await firestore
        .doc(
          'clubs/$clubId/operations/$operationId/inscriptions/$participantId',
        )
        .get();
    expect(inscription.data()!['payment_status'], 'qr_on_site');
  });

  test('keeps legacy paid activities compatible', () async {
    await firestore.doc('clubs/$clubId/operations/$operationId').set({
      'prix_membre': 4,
    });

    await service.updatePaymentStatus(
      clubId: clubId,
      operationId: operationId,
      participantId: participantId,
      status: 'qr_on_site',
    );

    final inscription = await firestore
        .doc(
          'clubs/$clubId/operations/$operationId/inscriptions/$participantId',
        )
        .get();
    expect(inscription.data()!['payment_status'], 'qr_on_site');
  });
}

import 'package:calymob/services/operation_service.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const clubId = 'calypso';
  const operationId = 'event-1';
  late FakeFirebaseFirestore firestore;
  late OperationService service;

  setUp(() {
    firestore = FakeFirebaseFirestore();
    service = OperationService(firestore: firestore);
  });

  test('waitlisted entries do not consume capacity or appear as participants',
      () async {
    final inscriptions = firestore.collection(
      'clubs/$clubId/operations/$operationId/inscriptions',
    );
    await inscriptions.doc('confirmed').set({
      'membre_id': 'member-1',
      'registration_status': 'confirmed',
      'date_inscription': DateTime(2026),
    });
    await inscriptions.doc('waiting').set({
      'membre_id': 'member-2',
      'registration_status': 'waitlisted',
      'date_inscription': DateTime(2026),
    });

    expect(await service.countParticipants(clubId, operationId), 1);
    expect(await service.isUserRegistered(clubId, operationId, 'member-2'),
        isFalse);
    expect(await service.getParticipants(clubId, operationId), hasLength(1));
    expect(
      (await service.getUserInscription(
        clubId: clubId,
        operationId: operationId,
        userId: 'member-2',
      ))
          ?.isWaitlisted,
      isTrue,
    );
  });

  test('returns the FIFO position of a waiting member', () async {
    final inscriptions = firestore.collection(
      'clubs/$clubId/operations/$operationId/inscriptions',
    );
    await inscriptions.doc('first').set({
      'membre_id': 'member-1',
      'registration_status': 'waitlisted',
      'requested_at': DateTime(2026, 8, 10, 9),
    });
    await inscriptions.doc('second').set({
      'membre_id': 'member-2',
      'registration_status': 'waitlisted',
      'requested_at': DateTime(2026, 8, 10, 10),
    });

    expect(
      await service.getWaitlistPosition(
        clubId: clubId,
        operationId: operationId,
        userId: 'member-2',
      ),
      2,
    );
  });

  test('uses exact web-safe sort keys for supported and invalid date values',
      () {
    final timestampDate = DateTime.utc(2026, 1, 1);
    final dateTimeDate = DateTime.utc(2026, 1, 2);
    final latestSupportedDateTime = DateTime.fromMillisecondsSinceEpoch(
      8640000000000000,
      isUtc: true,
    );

    expect(
      OperationService.waitlistDateSortKey(Timestamp.fromDate(timestampDate)),
      timestampDate.millisecondsSinceEpoch,
    );
    expect(
      OperationService.waitlistDateSortKey(dateTimeDate),
      dateTimeDate.millisecondsSinceEpoch,
    );
    expect(
      OperationService.waitlistDateSortKey(latestSupportedDateTime),
      latestSupportedDateTime.millisecondsSinceEpoch,
    );
    expect(
      latestSupportedDateTime.millisecondsSinceEpoch,
      lessThan(9007199254740991),
    );
    expect(
      OperationService.waitlistDateSortKey(null),
      9007199254740991,
    );
    expect(
      OperationService.waitlistDateSortKey('not-a-date'),
      9007199254740991,
    );
  });

  test(
      'orders Timestamp, DateTime and fallback dates before invalid values '
      'with a stable document ID tiebreaker', () async {
    final inscriptions = firestore.collection(
      'clubs/$clubId/operations/$operationId/inscriptions',
    );
    final sameInstant = DateTime.utc(2026, 1, 4);

    await inscriptions.doc('01-timestamp').set({
      'membre_id': 'timestamp',
      'registration_status': 'waitlisted',
      'requested_at': Timestamp.fromDate(DateTime.utc(2026, 1, 1)),
    });
    await inscriptions.doc('02-datetime').set({
      'membre_id': 'datetime',
      'registration_status': 'waitlisted',
      'requested_at': DateTime.utc(2026, 1, 2),
    });
    await inscriptions.doc('03-fallback').set({
      'membre_id': 'fallback',
      'registration_status': 'waitlisted',
      'date_inscription': DateTime.utc(2026, 1, 3),
    });
    await inscriptions.doc('04-same-a').set({
      'membre_id': 'same-a',
      'registration_status': 'waitlisted',
      'requested_at': sameInstant,
    });
    await inscriptions.doc('05-same-z').set({
      'membre_id': 'same-z',
      'registration_status': 'waitlisted',
      'requested_at': sameInstant,
    });
    await inscriptions.doc('06-invalid').set({
      'membre_id': 'invalid',
      'registration_status': 'waitlisted',
      'requested_at': 'not-a-date',
    });
    await inscriptions.doc('07-missing').set({
      'membre_id': 'missing',
      'registration_status': 'waitlisted',
    });

    for (final expected in <String, int>{
      'timestamp': 1,
      'datetime': 2,
      'fallback': 3,
      'same-a': 4,
      'same-z': 5,
      'invalid': 6,
      'missing': 7,
    }.entries) {
      expect(
        await service.getWaitlistPosition(
          clubId: clubId,
          operationId: operationId,
          userId: expected.key,
        ),
        expected.value,
        reason: 'unexpected FIFO position for ${expected.key}',
      );
    }
  });
}

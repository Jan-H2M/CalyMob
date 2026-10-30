import 'package:calymob/models/supplement.dart';
import 'package:calymob/services/operation_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Map<String, dynamic> editReceipt({
    double oldTotal = 25,
    double newTotal = 64,
    double delta = -39,
  }) => {
    'version': 1,
    'inscriptionId': 'parent-1',
    'oldTotal': oldTotal,
    'newTotal': newTotal,
    'delta': delta,
    'isPaid': false,
    'operationTitle': 'Sortie test',
    'addedGuestIds': ['guest-new'],
    'removedGuestIds': <String>[],
    'idempotent': false,
  };

  test(
    'existing-registration guest addition delegates identifiers to the server',
    () async {
      final firestore = FakeFirebaseFirestore();
      Map<String, dynamic>? request;
      final service = OperationService(
        firestore: firestore,
        updateEventRegistrationInvoker: (payload) async {
          request = payload;
          return editReceipt();
        },
      );

      final delta = await service.updateMyInscription(
        clubId: 'calypso',
        operationId: 'event-1',
        inscriptionId: 'parent-1',
        selectedSupplements: [
          SelectedSupplement(id: 'meal', name: 'Repas', price: 999),
        ],
        supplementTotal: 999,
        requestId: 'edit_request_20261008_1',
        guests: [
          GuestUpdate(
            inscriptionId: 'guest-existing',
            prenom: 'Nom client ignoré',
            nom: 'Prix client ignoré',
            prix: 999,
            selectedSupplements: [
              SelectedSupplement(id: 'bottle', name: 'Bouteille', price: 888),
            ],
            supplementTotal: 888,
          ),
          GuestUpdate(
            prenom: '  Bob ',
            nom: ' Invité ',
            prix: 777,
            tariffId: 'guest-adult',
            selectedSupplements: [
              SelectedSupplement(id: 'bottle', name: 'Bouteille', price: 888),
            ],
            supplementTotal: 888,
          ),
        ],
      );

      expect(delta, -39);
      final payload = request!;
      expect(payload['clubId'], 'calypso');
      expect(payload['operationId'], 'event-1');
      expect(payload['inscriptionId'], 'parent-1');
      expect(payload['selectedSupplementIds'], ['meal']);
      expect(payload['requestId'], 'edit_request_20261008_1');
      expect(payload, isNot(contains('supplementTotal')));
      expect(payload['guests'], [
        {
          'inscriptionId': 'guest-existing',
          'selectedSupplementIds': ['bottle'],
        },
        {
          'firstName': 'Bob',
          'lastName': 'Invité',
          'tariffId': 'guest-adult',
          'selectedSupplementIds': ['bottle'],
        },
      ]);
      expect(
        (payload['guests'] as List).every(
          (guest) => !(guest as Map).containsKey('prix'),
        ),
        isTrue,
      );
      expect(
        (await firestore
                .collection('clubs/calypso/operations/event-1/inscriptions')
                .get())
            .docs,
        isEmpty,
      );
    },
  );

  test(
    'server rejection is surfaced without a direct Firestore fallback',
    () async {
      final firestore = FakeFirebaseFirestore();
      final service = OperationService(
        firestore: firestore,
        updateEventRegistrationInvoker: (_) async {
          throw StateError('permission-denied');
        },
      );

      await expectLater(
        service.updateMyInscription(
          clubId: 'calypso',
          operationId: 'event-1',
          inscriptionId: 'parent-1',
          selectedSupplements: const [],
          supplementTotal: 0,
          guests: [
            GuestUpdate(
              prenom: 'Bob',
              nom: 'Invité',
              prix: 35,
              tariffId: 'guest',
            ),
          ],
        ),
        throwsA(isA<StateError>()),
      );
      expect(
        (await firestore
                .collection('clubs/calypso/operations/event-1/inscriptions')
                .get())
            .docs,
        isEmpty,
      );
    },
  );

  test('guest level updates are explicit and server validated', () async {
    Map<String, dynamic>? request;
    final service = OperationService(
      firestore: FakeFirebaseFirestore(),
      updateEventRegistrationInvoker: (payload) async {
        request = payload;
        return editReceipt(oldTotal: 64, newTotal: 64, delta: 0);
      },
    );

    await service.updateMyInscription(
      clubId: 'calypso',
      operationId: 'event-1',
      inscriptionId: 'parent-1',
      selectedSupplements: const [],
      supplementTotal: 0,
      requestId: 'edit_request_20261009_level',
      guests: [
        GuestUpdate(
          inscriptionId: 'guest-existing',
          prenom: 'Vinciane',
          nom: 'Invitée',
          prix: 35,
          divingLevel: '2 *',
          updateDivingLevel: true,
        ),
        GuestUpdate(
          prenom: 'Nouvelle',
          nom: 'Invitée',
          prix: 35,
          tariffId: 'guest',
          divingLevel: 'AM',
        ),
      ],
    );

    expect(request!['guests'], [
      {
        'inscriptionId': 'guest-existing',
        'divingLevel': '2',
        'selectedSupplementIds': <String>[],
      },
      {
        'firstName': 'Nouvelle',
        'lastName': 'Invitée',
        'tariffId': 'guest',
        'divingLevel': 'AM',
        'selectedSupplementIds': <String>[],
      },
    ]);
  });

  test('edit receipt rejects missing authoritative totals', () {
    expect(
      () => EventRegistrationEditResult.fromCallable({
        'version': 1,
        'inscriptionId': 'parent-1',
        'isPaid': false,
        'operationTitle': 'Sortie test',
        'addedGuestIds': <String>[],
        'removedGuestIds': <String>[],
        'idempotent': false,
      }),
      throwsFormatException,
    );
  });
}

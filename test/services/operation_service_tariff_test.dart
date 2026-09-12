import 'package:calymob/models/member_profile.dart';
import 'package:calymob/models/operation.dart';
import 'package:calymob/models/supplement.dart';
import 'package:calymob/models/tariff.dart';
import 'package:calymob/services/operation_service.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Map<String, dynamic> registrationResponse({
    int guestCount = 0,
    double memberBase = 0,
    double memberSupplements = 0,
    List<double>? guestBases,
    List<double>? guestSupplements,
    double? nextPaymentAmount,
    String? installmentId,
    String? installmentLabel,
  }) {
    final ids = List.generate(guestCount, (index) => 'guest-${index + 1}');
    final bases = guestBases ?? List.filled(guestCount, 0);
    final supplements = guestSupplements ?? List.filled(guestCount, 0);
    final memberTotal = memberBase + memberSupplements;
    final guests = List.generate(
        guestCount,
        (index) => {
              'inscriptionId': ids[index],
              'base': bases[index],
              'supplements': supplements[index],
              'total': bases[index] + supplements[index],
            });
    final groupTotal = memberTotal +
        List.generate(guestCount, (index) => bases[index] + supplements[index])
            .fold<double>(0, (sum, value) => sum + value);
    return {
      'version': 1,
      'status': 'confirmed',
      'inscriptionId': 'inscription-1',
      'guestInscriptionIds': ids,
      'idempotent': false,
      'amounts': {
        'currency': 'EUR',
        'groupTotal': groupTotal,
        'member': {
          'base': memberBase,
          'supplements': memberSupplements,
          'total': memberTotal,
        },
        'guests': guests,
        'nextPayment': {
          'amount': nextPaymentAmount ?? groupTotal,
          'installmentId': installmentId,
          'installmentLabel': installmentLabel,
        },
      },
    };
  }

  test(
    'registration delegates automatic tariff selection to the server',
    () async {
      final firestore = FakeFirebaseFirestore();
      Map<String, dynamic>? request;
      final service = OperationService(
        firestore: firestore,
        registerForEventInvoker: (payload) async {
          request = payload;
          return registrationResponse();
        },
      );
      final now = DateTime(2026, 8, 13);
      final operation = Operation(
        id: 'event-1',
        type: 'evenement',
        titre: 'Sortie club',
        montantPrevu: 0,
        statut: 'ouvert',
        eventTariffs: [
          Tariff(
            id: 'member',
            label: 'Membre',
            category: 'membre',
            price: 25,
            isDefault: true,
          ),
          Tariff(
            id: 'encadrant',
            label: 'Encadrant',
            category: 'encadrant',
            price: 0,
          ),
        ],
        createdAt: now,
        updatedAt: now,
      );
      final profile = MemberProfile(
        id: 'member-1',
        nom: 'Test',
        prenom: 'Encadrant',
        email: 'encadrant@example.com',
        clubStatuten: const ['Encadrants'],
      );
      final result = await service.registerToOperation(
        clubId: 'club-1',
        operationId: operation.id,
        userId: profile.id,
        userName: profile.email,
        operation: operation,
        memberProfile: profile,
        requestId: 'request_20260813_member_1',
      );

      expect(request, {
        'clubId': 'club-1',
        'operationId': 'event-1',
        'requestId': 'request_20260813_member_1',
        'payloadFingerprint':
            OperationService.registrationRequestPayloadFingerprint(
          clubId: 'club-1',
          operationId: 'event-1',
        ),
        'selectedSupplementIds': <String>[],
        'guests': <Map<String, dynamic>>[],
        'source': 'calymob',
      });
      expect(result.status, 'confirmed');
      expect(result.inscriptionId, 'inscription-1');
      expect(result.idempotent, isFalse);
      expect(
        (await firestore
                .collection('clubs/club-1/operations/event-1/inscriptions')
                .get())
            .docs,
        isEmpty,
      );
    },
  );

  test(
    'registration is rejected when the current event status is annule',
    () async {
      final firestore = FakeFirebaseFirestore();
      var calls = 0;
      final service = OperationService(
        firestore: firestore,
        registerForEventInvoker: (_) async {
          calls += 1;
          throw Exception('Les inscriptions sont fermées pour cet événement');
        },
      );
      final now = DateTime(2026, 8, 13);
      final operation = Operation(
        id: 'cancelled-event',
        type: 'evenement',
        titre: 'Sortie annulée',
        montantPrevu: 0,
        statut: 'ouvert', // Simulates a stale detail screen.
        createdAt: now,
        updatedAt: now,
      );
      await expectLater(
        service.registerToOperation(
          clubId: 'club-1',
          operationId: operation.id,
          userId: 'member-1',
          userName: 'Membre Test',
          operation: operation,
        ),
        throwsA(
          predicate(
            (error) => error.toString().contains('inscriptions sont fermées'),
          ),
        ),
      );

      final inscriptions = await firestore
          .collection('clubs/club-1/operations/cancelled-event/inscriptions')
          .get();
      expect(inscriptions.docs, isEmpty);
      expect(calls, 1);
    },
  );

  test(
    'registration sends identifiers, never client-authored prices',
    () async {
      final firestore = FakeFirebaseFirestore();
      Map<String, dynamic>? request;
      final service = OperationService(
        firestore: firestore,
        registerForEventInvoker: (payload) async {
          request = payload;
          return registrationResponse();
        },
      );
      final now = DateTime(2026, 8, 13);
      final operation = Operation(
        id: 'event-2',
        type: 'evenement',
        titre: 'Plongée club',
        montantPrevu: 0,
        statut: 'ouvert',
        createdAt: now,
        updatedAt: now,
      );
      final tariff = Tariff(
        id: 'member',
        label: 'Membre',
        category: 'membre',
        price: 25,
      );

      await service.registerToOperation(
        clubId: 'club-1',
        operationId: operation.id,
        userId: 'member-1',
        userName: 'member@example.com',
        operation: operation,
        selectedTariff: tariff,
        selectedSupplements: [
          SelectedSupplement(id: 'bottle', name: 'Bouteille', price: 999),
        ],
        supplementTotal: 999,
        requestId: 'request_20260813_member_2',
      );

      expect(request, {
        'clubId': 'club-1',
        'operationId': 'event-2',
        'requestId': 'request_20260813_member_2',
        'payloadFingerprint':
            OperationService.registrationRequestPayloadFingerprint(
          clubId: 'club-1',
          operationId: 'event-2',
          selectedSupplements: [
            SelectedSupplement(id: 'bottle', name: 'Bouteille', price: 999),
          ],
        ),
        'selectedSupplementIds': ['bottle'],
        'guests': <Map<String, dynamic>>[],
        'source': 'calymob',
      });
      expect(request, isNot(containsPair('price', 25)));
      expect(request, isNot(containsPair('supplementTotal', 999)));
    },
  );

  test(
    'member and guests use one idempotent request without client-authored prices',
    () async {
      final firestore = FakeFirebaseFirestore();
      Map<String, dynamic>? request;
      final service = OperationService(
        firestore: firestore,
        registerForEventInvoker: (payload) async {
          request = payload;
          return registrationResponse(guestCount: 1);
        },
      );

      final now = DateTime(2026, 8, 13);
      final operation = Operation(
        id: 'event-1',
        type: 'evenement',
        titre: 'Plongée club',
        montantPrevu: 0,
        statut: 'ouvert',
        createdAt: now,
        updatedAt: now,
      );

      await service.registerToOperation(
        clubId: 'club-1',
        operationId: 'event-1',
        userId: 'member-1',
        userName: 'Alice Member',
        operation: operation,
        requestId: 'request_20260813_group_1',
        selectedSupplements: [
          SelectedSupplement(id: 'bottle', name: 'Bouteille', price: 999),
        ],
        supplementTotal: 999,
        guests: [
          RegistrationGuestRequest(
            firstName: 'Bob',
            lastName: 'Guest',
            tariffId: 'guest-adult',
            selectedSupplements: [
              SelectedSupplement(
                id: 'guest-bottle',
                name: 'Bouteille invité',
                price: 888,
              ),
            ],
          ),
        ],
      );

      expect(request, {
        'clubId': 'club-1',
        'operationId': 'event-1',
        'requestId': 'request_20260813_group_1',
        'payloadFingerprint':
            OperationService.registrationRequestPayloadFingerprint(
          clubId: 'club-1',
          operationId: 'event-1',
          selectedSupplements: [
            SelectedSupplement(id: 'bottle', name: 'Bouteille', price: 999),
          ],
          guests: [
            RegistrationGuestRequest(
              firstName: 'Bob',
              lastName: 'Guest',
              tariffId: 'guest-adult',
              selectedSupplements: [
                SelectedSupplement(
                  id: 'guest-bottle',
                  name: 'Bouteille invité',
                  price: 888,
                ),
              ],
            ),
          ],
        ),
        'selectedSupplementIds': ['bottle'],
        'guests': [
          {
            'firstName': 'Bob',
            'lastName': 'Guest',
            'tariffId': 'guest-adult',
            'selectedSupplementIds': ['guest-bottle'],
          },
        ],
        'source': 'calymob',
      });
      expect(request, isNot(containsPair('price', 999)));
      expect(request, isNot(containsPair('supplementTotal', 999)));
      expect(
        (await firestore
                .collection('clubs/club-1/operations/event-1/inscriptions')
                .get())
            .docs,
        isEmpty,
      );
    },
  );

  test('registration fingerprint matches the server canonical contract', () {
    final fingerprint = OperationService.registrationRequestPayloadFingerprint(
      clubId: 'club-1',
      operationId: 'event-1',
      selectedSupplements: [
        SelectedSupplement(id: 'tank', name: 'Bloc', price: 5),
        SelectedSupplement(id: 'meal', name: 'Repas', price: 20),
      ],
      guests: [
        RegistrationGuestRequest(
          firstName: ' Bob ',
          lastName: ' Guest ',
          tariffId: 'adult',
          selectedSupplements: [
            SelectedSupplement(id: 'air', name: 'Air', price: 1),
            SelectedSupplement(id: 'meal', name: 'Repas', price: 20),
          ],
        ),
        const RegistrationGuestRequest(
          firstName: 'Eve',
          lastName: 'Guest',
        ),
      ],
    );
    expect(
      fingerprint,
      '7b65c15b49215846b2a1c4f73397db35032d96d4594de41e72dd404e909adbfd',
    );
  });

  test('guest names share the 80-unit Unicode and whitespace contract', () {
    expect(
        canonicalRegistrationGuestName('  Zoë\t李\nDupont  '), 'Zoë 李 Dupont');
    expect(
        canonicalRegistrationGuestName(List.filled(80, 'é').join()).length, 80);
    expect(
      () => canonicalRegistrationGuestName(List.filled(81, 'é').join()),
      throwsFormatException,
    );
    expect(
      () => const RegistrationGuestRequest(
        firstName: 'Bob',
        lastName: '',
      ).toCallablePayload(),
      throwsFormatException,
    );
  });

  test('Unicode and whitespace use the server canonical fingerprint', () {
    final fingerprint = OperationService.registrationRequestPayloadFingerprint(
      clubId: 'club-1',
      operationId: 'event-1',
      selectedSupplements: [
        SelectedSupplement(id: 'tank', name: 'Bloc', price: 5),
        SelectedSupplement(id: 'meal', name: 'Repas', price: 20),
      ],
      guests: [
        RegistrationGuestRequest(
          firstName: '  Zoë\t李 ',
          lastName: ' Van   Dam ',
          tariffId: 'adult',
          selectedSupplements: [
            SelectedSupplement(id: 'meal', name: 'Repas', price: 20),
            SelectedSupplement(id: 'air', name: 'Air', price: 1),
          ],
        ),
      ],
    );
    expect(
      fingerprint,
      'c6694e3aadcb411259f36ceb8cad6f9fb8ba5016831091165bb0eff42fea5abe',
    );
  });

  test('receipt is the only authoritative price and tranche source', () async {
    final service = OperationService(
      firestore: FakeFirebaseFirestore(),
      registerForEventInvoker: (_) async => registrationResponse(
        guestCount: 1,
        memberBase: 20,
        memberSupplements: 4,
        guestBases: [35],
        guestSupplements: [6],
        nextPaymentAmount: 27,
        installmentId: 'deposit',
        installmentLabel: 'Acompte',
      ),
    );
    final now = DateTime(2026, 8, 13);
    final result = await service.registerToOperation(
      clubId: 'club-1',
      operationId: 'event-1',
      userId: 'member-1',
      userName: 'Alice',
      operation: Operation(
        id: 'event-1',
        type: 'evenement',
        titre: 'Tarif client périmé',
        montantPrevu: 0,
        statut: 'ouvert',
        prixMembre: 999,
        createdAt: now,
        updatedAt: now,
      ),
      selectedTariff: Tariff(
        id: 'stale',
        label: 'Périmé',
        category: 'membre',
        price: 999,
      ),
      supplementTotal: 999,
      guests: const [
        RegistrationGuestRequest(firstName: 'Bob', lastName: 'Guest'),
      ],
    );

    expect(result.groupTotal, 65);
    expect(result.memberAmount.total, 24);
    expect(result.guestAmounts.single.total, 41);
    expect(result.nextPayment.amount, 27);
    expect(result.nextPayment.installmentId, 'deposit');
  });

  test('malformed or missing authoritative receipt fails closed', () {
    expect(
      () => EventRegistrationResult.fromCallable({
        'status': 'confirmed',
        'inscriptionId': 'member-1',
        'guestInscriptionIds': const [],
      }),
      throwsFormatException,
    );
    final malformed = registrationResponse();
    (malformed['amounts'] as Map<String, dynamic>)['groupTotal'] = 99;
    expect(
      () => EventRegistrationResult.fromCallable(malformed),
      throwsFormatException,
    );
  });

  test('post-registration guest append delegates IDs only to the callable',
      () async {
    final firestore = FakeFirebaseFirestore();
    Map<String, dynamic>? request;
    final service = OperationService(
      firestore: firestore,
      addGuestToEventInvoker: (payload) async => request = payload,
    );

    await service.createGuestInscription(
      clubId: 'club-1',
      operationId: 'event-1',
      operationTitle: 'Free event',
      guestPrenom: 'Bob',
      guestNom: 'Guest',
      prix: 999,
      addedByUserId: 'member-1',
      addedByUserName: 'Alice Member',
      parentInscriptionId: 'parent-1',
      selectedSupplements: [
        SelectedSupplement(id: 'meal', name: 'Repas', price: 999),
      ],
      supplementTotal: 999,
    );

    expect(request, containsPair('clubId', 'club-1'));
    expect(request, containsPair('operationId', 'event-1'));
    expect(request, containsPair('parentInscriptionId', 'parent-1'));
    expect(request!['requestId'], startsWith('calymob_'));
    expect(request!['guest'], {
      'firstName': 'Bob',
      'lastName': 'Guest',
      'selectedSupplementIds': ['meal'],
    });
    expect(request, isNot(contains('prix')));
    expect((request!['guest'] as Map), isNot(contains('price')));
    expect((request!['guest'] as Map), isNot(contains('supplementTotal')));
  });

  test('guest append forwards stable request identity and payload fingerprint',
      () async {
    final requests = <Map<String, dynamic>>[];
    final service = OperationService(
      firestore: FakeFirebaseFirestore(),
      addGuestToEventInvoker: (payload) async => requests.add(payload),
    );
    final supplements = [
      SelectedSupplement(id: 'meal', name: 'Repas', price: 20),
      SelectedSupplement(id: 'tank', name: 'Bloc', price: 5),
    ];
    final fingerprint = OperationService.guestRequestPayloadFingerprint(
      clubId: 'club-1',
      operationId: 'event-1',
      parentInscriptionId: 'parent-1',
      guestPrenom: ' Bob ',
      guestNom: ' Guest ',
      tariffId: 'guest-adult',
      selectedSupplements: supplements.reversed.toList(),
    );
    expect(
      fingerprint,
      'c22dd83086be920d982cb715caa0ad7662fe409d74755e11d9833ac6a1fd087d',
    );
    for (var i = 0; i < 2; i++) {
      await service.createGuestInscription(
        clubId: 'club-1',
        operationId: 'event-1',
        operationTitle: 'Event',
        guestPrenom: ' Bob ',
        guestNom: ' Guest ',
        prix: 999,
        addedByUserId: 'member-1',
        addedByUserName: 'Member',
        parentInscriptionId: 'parent-1',
        tariffId: 'guest-adult',
        selectedSupplements: supplements,
        requestId: 'stable-request',
        payloadFingerprint: fingerprint,
      );
    }
    expect(requests, hasLength(2));
    expect(requests[0]['requestId'], 'stable-request');
    expect(requests[1]['requestId'], 'stable-request');
    expect(requests[0]['payloadFingerprint'], fingerprint);
    expect(requests[1]['payloadFingerprint'], fingerprint);
  });

  test('guest failure classification retains ambiguous transport retries', () {
    expect(
      OperationService.isDefinitiveGuestRegistrationFailure(
        FirebaseFunctionsException(
            code: 'failed-precondition', message: 'Rejected'),
      ),
      isTrue,
    );
    expect(
      OperationService.isDefinitiveGuestRegistrationFailure(
        FirebaseFunctionsException(
            code: 'deadline-exceeded', message: 'Timeout'),
      ),
      isFalse,
    );
    expect(
      OperationService.isDefinitiveGuestRegistrationFailure(
        FirebaseFunctionsException(code: 'unavailable', message: 'Offline'),
      ),
      isFalse,
    );
  });
}

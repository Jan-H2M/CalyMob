import 'package:calymob/services/operation_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('create sends only organizer id and strips client-owned identity fields',
      () async {
    Map<String, dynamic>? request;
    final service = OperationService(
      firestore: FakeFirebaseFirestore(),
      writeOperationInvoker: (payload) async {
        request = payload;
        return {
          'success': true,
          'operationId': 'event-1',
          'organizerName': 'Canonical Name',
        };
      },
    );

    final id = await service.createOperation(
      clubId: 'calypso',
      data: {
        'type': 'evenement',
        'titre': 'Barrages',
        'statut': 'ouvert',
        'organisateur_id': 'member-2',
        'organisateur_nom': 'Spoofed',
        'creator_user_id': 'spoofed-creator',
        'club_id': 'spoofed-club',
      },
    );

    expect(id, 'event-1');
    expect(request?['action'], 'create');
    expect(request?['organizerId'], 'member-2');
    expect(request?['fields'], {
      'type': 'evenement',
      'titre': 'Barrages',
      'statut': 'ouvert',
    });
  });

  test('ordinary update cannot smuggle an organizer handover', () async {
    final firestore = FakeFirebaseFirestore();
    await firestore.doc('clubs/calypso/operations/event-1').set({
      'organisateur_id': 'member-1',
    });
    var calls = 0;
    final service = OperationService(
      firestore: firestore,
      writeOperationInvoker: (payload) async {
        calls += 1;
        return {
          'success': true,
          'operationId': 'event-1',
          'organizerName': 'Canonical Name',
        };
      },
    );

    await expectLater(
      service.updateOperation(
        clubId: 'calypso',
        operationId: 'event-1',
        data: {'titre': 'Changed', 'organisateur_id': 'member-2'},
      ),
      throwsA(isA<StateError>()),
    );
    expect(calls, 0);
  });

  test('handover is one dedicated callable action', () async {
    Map<String, dynamic>? request;
    final service = OperationService(
      firestore: FakeFirebaseFirestore(),
      writeOperationInvoker: (payload) async {
        request = payload;
        return {
          'success': true,
          'operationId': 'event-1',
          'organizerName': 'New Owner',
        };
      },
    );

    await service.handoverOperation(
      clubId: 'calypso',
      operationId: 'event-1',
      organizerId: 'member-2',
    );

    expect(request, {
      'action': 'handover',
      'clubId': 'calypso',
      'operationId': 'event-1',
      'organizerId': 'member-2',
      'fields': <String, dynamic>{},
      'deleteFields': <String>[],
      'source': 'calymob',
    });
  });
}

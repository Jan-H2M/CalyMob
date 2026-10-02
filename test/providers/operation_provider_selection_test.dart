import 'dart:async';

import 'package:calymob/models/operation.dart';
import 'package:calymob/models/participant_operation.dart';
import 'package:calymob/providers/operation_provider.dart';
import 'package:calymob/services/operation_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';

class _ControlledOperationService extends Mock implements OperationService {
  final Map<String, Completer<Operation?>> requests = {};

  @override
  Future<Operation?> getOperationById(String clubId, String operationId) {
    final request = Completer<Operation?>();
    requests[operationId] = request;
    return request.future;
  }

  @override
  Future<int> countParticipants(String clubId, String operationId) async => 0;

  @override
  Future<bool> isUserRegistered(
    String clubId,
    String operationId,
    String userId,
  ) async =>
      false;

  @override
  Future<ParticipantOperation?> getUserInscription({
    required String clubId,
    required String operationId,
    required String userId,
  }) async =>
      null;

  @override
  Stream<List<ParticipantOperation>> getParticipantsStream(
    String clubId,
    String operationId,
  ) =>
      const Stream.empty();
}

Operation _operation(String id, String organiserId) => Operation(
      id: id,
      type: 'evenement',
      titre: id,
      montantPrevu: 0,
      statut: 'ouvert',
      organisateurId: organiserId,
      organisateurNom: organiserId,
      createdAt: DateTime(2026),
      updatedAt: DateTime(2026),
    );

Future<void> _startRequest() => Future<void>.delayed(Duration.zero);

void main() {
  const clubId = 'calypso';
  const userId = 'member-1';

  test('a failed refresh clears the selected operation and fails closed',
      () async {
    final service = _ControlledOperationService();
    final provider = OperationProvider(operationService: service);

    final initialLoad = provider.selectOperation(clubId, 'event', userId);
    await _startRequest();
    service.requests['event']!.complete(_operation('event', 'organiser-old'));
    expect(await initialLoad, isTrue);
    expect(provider.selectedOperation?.organisateurId, 'organiser-old');

    final failedRefresh = provider.selectOperation(clubId, 'event', userId);
    await _startRequest();
    service.requests['event']!.completeError(StateError('read failed'));

    expect(await failedRefresh, isFalse);
    expect(provider.selectedOperation, isNull);
  });

  test('an older request cannot replace a newer selected operation', () async {
    final service = _ControlledOperationService();
    final provider = OperationProvider(operationService: service);

    final olderLoad = provider.selectOperation(clubId, 'older', userId);
    await _startRequest();
    final newerLoad = provider.selectOperation(clubId, 'newer', userId);
    await _startRequest();

    service.requests['newer']!.complete(_operation('newer', 'organiser-new'));
    expect(await newerLoad, isTrue);

    service.requests['older']!.complete(_operation('older', 'organiser-stale'));
    expect(await olderLoad, isFalse);
    expect(provider.selectedOperation?.id, 'newer');
    expect(provider.selectedOperation?.organisateurId, 'organiser-new');
  });
}

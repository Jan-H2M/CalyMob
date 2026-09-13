import 'package:calymob/models/operation.dart';
import 'package:calymob/services/operation_service.dart';
import 'package:flutter_test/flutter_test.dart';

Operation operationWithStatus(String status) => Operation(
      id: 'event-1',
      type: 'evenement',
      titre: 'Sortie test',
      montantPrevu: 0,
      statut: status,
      createdAt: DateTime(2026, 9, 13),
      updatedAt: DateTime(2026, 9, 13),
    );

void main() {
  test('removed operations are hidden from every CalyMob entry point', () {
    expect(
        isOperationVisibleInCalyMob(operationWithStatus('supprime')), isFalse);
  });

  test('cancelled operations remain accessible in CalyMob', () {
    expect(isOperationVisibleInCalyMob(operationWithStatus('annule')), isTrue);
  });
}

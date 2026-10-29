import 'package:calymob/services/boutique/boutique_operations_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
      'full receipt read follows pages and preserves batch, reference and revisions',
      () async {
    final requests = <Map<String, dynamic>>[];
    final service = BoutiqueOperationsService(transport: (request) async {
      requests.add(request);
      return {
        'units': [
          {
            'id': request['cursor'] == null ? 'first' : 'last',
            'revision': 'r1',
            'supplierBatchId': 'batch',
            'supplierOrderReference': 'W-QA'
          }
        ],
        'hasMore': request['cursor'] == null,
        'nextCursor': request['cursor'] == null ? 'first' : null
      };
    });
    final units = await service.listReceivedUnits('fixture');
    expect(units.map((u) => u.id), ['first', 'last']);
    expect(units.last.supplierReference, 'W-QA');
    expect(units.last.selection, {'id': 'last', 'revision': 'r1'});
    expect(requests.last['cursor'], 'first');
  });
  test(
      'incomplete or cyclic pagination fails instead of offering a partial full selection',
      () async {
    for (final cursor in [null, 'same']) {
      final service = BoutiqueOperationsService(
          transport: (_) async =>
              {'units': [], 'hasMore': true, 'nextCursor': cursor});
      await expectLater(
          service.listReceivedUnits('fixture'), throwsFormatException);
    }
  });
}

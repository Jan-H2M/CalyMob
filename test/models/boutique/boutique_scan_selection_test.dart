import 'package:calymob/models/boutique/boutique_physical_unit.dart';
import 'package:calymob/models/boutique/boutique_unit_qr.dart';
import 'package:calymob/services/boutique/boutique_operations_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  BoutiquePhysicalUnit unit(String id,
          {String location = 'Jim', String status = 'not_ready'}) =>
      BoutiquePhysicalUnit({
        'id': id,
        'revision': '1:2',
        'location': location,
        'saleStatus': status,
        'productName': 'Polo'
      });
  test(
      '25 distinct scans retain one source place; duplicates and wrong places never change quantities',
      () {
    final selection = BoutiqueScanSelection(clubId: 'calypso', location: 'Jim');
    for (var i = 0; i < 25; i++) {
      selection.add(unit('p$i'));
    }
    expect(selection.units.length, 25);
    expect(() => selection.add(unit('p0')), throwsFormatException);
    expect(() => selection.add(unit('foreign', location: 'Piscine')),
        throwsFormatException);
    expect(() => selection.add(unit('sold', status: 'sold')),
        throwsFormatException);
    expect(selection.units.length, 25);
    selection.remove('p0');
    expect(selection.units.length, 24);
  });
  test(
      'scans distinguish member IDs, club identity, versions, and exact article URLs',
      () {
    final selection = BoutiqueScanSelection(clubId: 'calypso', location: 'Jim');
    expect(
        selection.parse(
            const BoutiqueUnitQr(clubId: 'calypso', unitId: 'piece-1').url),
        'piece-1');
    expect(() => selection.parse('member-1'), throwsFormatException);
    expect(
        () => selection.parse(
            const BoutiqueUnitQr(clubId: 'other', unitId: 'piece-1').url),
        throwsFormatException);
  });
  test(
      'service sends stable confirmation identity and exact revisions for retries',
      () async {
    final requests = <Map<String, dynamic>>[];
    final service = BoutiqueOperationsService(transport: (request) async {
      requests.add(request);
      return {'applied': true};
    });
    final params = {
      'idempotencyKey': BoutiqueOperationsService.confirmationKey(),
      'units': [unit('p').selection]
    };
    await service.call('calypso', 'move', params);
    await service.call('calypso', 'move', params);
    expect(requests[0], requests[1]);
    expect(requests[0]['clubId'], 'calypso');
    expect(
        (requests[0]['units'] as List).single, {'id': 'p', 'revision': '1:2'});
  });
  test('whole orders deduplicate existing scans and fail atomically', () {
    final selection = BoutiqueScanSelection(clubId: 'fixture', location: 'Jim');
    selection.add(unit('existing'));
    selection.addOrder([unit('existing'), unit('new')]);
    expect(selection.units.map((u) => u.id), ['existing', 'new']);
    for (final invalid in [
      <BoutiquePhysicalUnit>[],
      [unit('one'), unit('one')],
      [unit('good'), unit('wrong', location: 'Piscine')],
      [unit('good'), unit('sold', status: 'sold')],
      List.generate(49, (i) => unit('overflow-$i')),
    ]) {
      expect(() => selection.addOrder(invalid), throwsFormatException);
      expect(selection.units.map((u) => u.id), ['existing', 'new']);
    }
  });
}

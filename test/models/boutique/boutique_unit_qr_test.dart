import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/models/boutique/boutique_unit_qr.dart';

void main() {
  const printed =
      'https://caly.club/stock/boutique/physical-stock?qr=btq-unit-v1&club=calypso&unit=demo-customer-piece-001';
  test(
      'accepts the exact URL independently decoded from the printed Calypso A4 QR',
      () {
    final value = BoutiqueUnitQr.parse(printed)!;
    expect(value.clubId, 'calypso');
    expect(value.unitId, 'demo-customer-piece-001');
    expect(value.url, printed);
    expect(BoutiqueUnitQr.memberId(printed), isNull);
  });
  test('distinguishes club member identity from a physical article', () {
    expect(BoutiqueUnitQr.memberId('member-Ab12'), 'member-Ab12');
    expect(BoutiqueUnitQr.parse('member-Ab12'), isNull);
    expect(BoutiqueUnitQr.parse('CALYMOB-DEMO:BTQ-001'), isNull);
  });
  test('rejects wrong origins, versions, duplicated IDs and credentials', () {
    for (final bad in [
      printed.replaceFirst('https:', 'http:'),
      printed.replaceFirst('caly.club', 'evil.invalid'),
      printed.replaceFirst('btq-unit-v1', 'btq-unit-v2'),
      '$printed&unit=other',
      printed.replaceFirst('https://', 'https://evil@'),
      '$printed#untrusted',
      printed.replaceFirst('demo-customer-piece-001', '../other'),
    ]) {
      expect(BoutiqueUnitQr.parse(bad), isNull, reason: bad);
    }
  });
}

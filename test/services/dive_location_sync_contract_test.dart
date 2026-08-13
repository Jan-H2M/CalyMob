import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/services/dive_location_sync_contract.dart';

void main() {
  test('exposes the complete location sync vocabulary', () {
    expect(DiveLocationLoadState.values, containsAll(<DiveLocationLoadState>[
      DiveLocationLoadState.fresh,
      DiveLocationLoadState.cached,
      DiveLocationLoadState.offline,
      DiveLocationLoadState.error,
      DiveLocationLoadState.empty,
    ]));
  });
}

import 'package:calymob/utils/member_search_request_gate.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('rejects a response from an older query', () {
    final gate = MemberSearchRequestGate();
    final first = gate.begin('an');
    final second = gate.begin('anna');

    expect(gate.accepts(first, 'anna'), isFalse);
    expect(gate.accepts(second, 'anna'), isTrue);
  });

  test('rejects a response after the search is closed or cleared', () {
    final gate = MemberSearchRequestGate();
    final request = gate.begin('an');

    gate.invalidate();

    expect(gate.accepts(request, ''), isFalse);
  });
}

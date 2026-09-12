import 'package:calymob/screens/formation/my_declarations_screen.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('durable evaluation outcomes all map to a visible request group', () {
    expect(declarationStatusGroup('submitted'), 'pending');
    expect(declarationStatusGroup('accepted'), 'validated');
    expect(declarationStatusGroup('corrected'), 'progress');
    expect(declarationStatusGroup('rejected'), 'refused');
  });
}

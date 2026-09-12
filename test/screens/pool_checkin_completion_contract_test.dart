import 'package:calymob/screens/training/pool_checkin_screen.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('student completion identifies the exact group and its monitors', () {
    expect(
      buildPoolStudentGroupCompletion(
        level: '2*',
        groupNumber: 2,
        monitorIds: const ['monitor-2', 'monitor-2', '  supervisor-2  '],
      ),
      {
        'level': '2*',
        'groupNumber': 2,
        'groupKey': '2star_groupe2',
        'moniteurIds': ['monitor-2', 'supervisor-2'],
      },
    );
  });
}

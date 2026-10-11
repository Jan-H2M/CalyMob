import 'package:calymob/services/pool_formation_overview_reader.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('reader materializes only the pool-safe DTO', () async {
    String? calledFunction;
    Map<String, dynamic>? calledPayload;
    final reader = PoolFormationOverviewReader(
      callableInvoker: (functionName, payload) async {
        calledFunction = functionName;
        calledPayload = payload;
        return {
          'students': [
            {
              'member_id': 'student-1',
              'identity': {
                'first_name': 'Alice',
                'last_name': 'Martin',
                'consent_internal_photo': false,
              },
              'piscine': {
                'validated': 3,
                'pending': 1,
                'remaining': 2,
                'total': 6,
                'pct': 50,
              },
              // Unknown backend keys cannot enter the pool snapshot model.
              'mil_experience': {
                'per_requirement': {
                  'mer': {'have': 20, 'need': 5}
                },
              },
            },
          ],
        };
      },
    );

    final students = await reader.getAllStudents('calypso');

    expect(calledFunction, 'getPoolFormationOverviewV1');
    expect(calledPayload, {'clubId': 'calypso'});
    expect(students, hasLength(1));
    expect(students.single.profile.fullName, 'Alice Martin');
    expect(students.single.snapshot.validated, 3);
    expect(students.single.snapshot.pending, 1);
    expect(students.single.snapshot.remaining, 2);
    expect(students.single.snapshot.pct, 50);
  });
}

import 'dart:convert';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/services/cursor_unread_count_service.dart';
import 'package:calymob/services/read_state_service.dart';

dynamic materialize(dynamic value) {
  if (value is Map<String, dynamic>) {
    if (value.keys.length == 1 && value['__ts'] is String) {
      return Timestamp.fromDate(DateTime.parse(value['__ts'] as String));
    }
    return value.map((key, item) => MapEntry(key, materialize(item)));
  }
  if (value is List) return value.map(materialize).toList();
  return value;
}

void main() {
  test(
      'unread contract v1 runs real cursor queries over every fixture document',
      () async {
    final fixture = jsonDecode(
            File('test/fixtures/unread_contract_v1.json').readAsStringSync())
        as Map<String, dynamic>;
    final db = FakeFirebaseFirestore();
    for (final entry
        in (fixture['documents'] as Map<String, dynamic>).entries) {
      await db
          .doc(entry.key)
          .set(materialize(entry.value) as Map<String, dynamic>);
    }
    final clock = DateTime.parse(fixture['now'] as String);
    final service = CursorUnreadCountService(
      firestore: db,
      readStateService: ReadStateService(firestore: db),
      clock: () => clock,
      countQuery: (query) async => (await query.get()).size,
    );
    for (final item in fixture['cases'] as List<dynamic>) {
      final testCase = item as Map<String, dynamic>;
      final result = await service.refreshAllCounts(
        clubId: fixture['clubId'] as String,
        userId: testCase['memberId'] as String,
        roles: (testCase['roles'] as List<dynamic>).cast<String>(),
      );
      final expected = testCase['expected'] as Map<String, dynamic>;
      expect(result.announcements, expected['announcements']);
      expect(result.events, expected['events']);
      expect(result.teams, expected['teams']);
      expect(result.sessions, expected['sessions']);
      expect(result.communication, expected['communication']);
      expect(result.total, expected['total']);
    }
  });
}

import 'dart:convert';
import 'dart:io';

import 'package:calymob/models/read_state.dart';
import 'package:calymob/services/cursor_unread_count_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('unread contract v1 fixture matches Dart policy', () {
    final fixture = jsonDecode(File('test/fixtures/unread_contract_v1.json').readAsStringSync())
        as Map<String, dynamic>;
    final expiry = fixture['eventExpiry'] as Map<String, dynamic>;
    expect(
      isUnreadEligibleEvent(
        {'date_fin': DateTime.parse(expiry['dateFin'] as String)},
        DateTime.parse(expiry['withinGrace'] as String),
      ),
      isTrue,
    );
    expect(
      readStateSessionScopeId('session-1', 'niveau', 'P2'),
      fixture['sessionScope'],
    );
  });
}

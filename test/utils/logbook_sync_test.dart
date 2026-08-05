import 'package:calymob/utils/logbook_sync.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('offline rows retain the country and pending-write state', () {
    final data = <String, dynamic>{
      'member_id': 'member-1',
      'location_name': 'Madeira',
      'country': 'PT',
    };
    final pending = logbookRowWithSyncState(
      id: 'offline-dive',
      data: data,
      hasPendingWrites: true,
    );

    expect(pending['country'], 'PT');
    expect(pending['_pending'], isTrue);

    final acknowledged = logbookRowWithSyncState(
      id: 'offline-dive',
      data: data,
      hasPendingWrites: false,
    );
    expect(acknowledged['country'], 'PT');
    expect(acknowledged['_pending'], isFalse);
  });
}

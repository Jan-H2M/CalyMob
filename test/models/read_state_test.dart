import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:calymob/models/read_state.dart';
import 'package:calymob/models/unread_cursor_feature_flag.dart';
import 'package:calymob/models/announcement.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('read cursor v1 model', () {
    test('effective cursor is the newest global or scoped acknowledgement', () {
      final global = Timestamp.fromDate(DateTime.utc(2026, 9, 25, 10));
      final scope = Timestamp.fromDate(DateTime.utc(2026, 9, 25, 11));

      expect(
        effectiveReadCursor(
          globalLastSeenAt: global,
          scopeLastSeenAt: scope,
        ),
        scope,
      );
      expect(
        effectiveReadCursor(
          globalLastSeenAt: scope,
          scopeLastSeenAt: global,
        ),
        scope,
      );
      expect(effectiveReadCursor(globalLastSeenAt: global), global);
      expect(effectiveReadCursor(scopeLastSeenAt: scope), scope);
      expect(effectiveReadCursor(), isNull);
    });

    test('effective cursor preserves nanosecond ordering', () {
      final earlier = Timestamp(10, 123456700);
      final later = Timestamp(10, 123456789);

      expect(
        effectiveReadCursor(
          globalLastSeenAt: earlier,
          scopeLastSeenAt: later,
        ),
        same(later),
      );
      expect(compareFirestoreTimestamps(later, earlier), greaterThan(0));
    });

    test('session scopes keep group and level distinct', () {
      expect(
        readStateSessionScopeId('session-1', 'accueil'),
        'session-1__accueil',
      );
      expect(
        readStateSessionScopeId('session-1', 'encadrants'),
        'session-1__encadrants',
      );
      expect(
        readStateSessionScopeId('session-1', 'niveau', 'P2'),
        'session-1__niveau__P2',
      );
    });

    test('missing Firestore fields parse as an uninitialised cursor', () {
      final cursor = ReadStateSectionCursor.fromFirestore(
        ReadStateSection.events,
        const <String, dynamic>{},
      );
      final scope = ReadStateScopeCursor.fromFirestore(null);

      expect(cursor.schemaVersionValue, 0);
      expect(cursor.globalLastSeenAt, isNull);
      expect(scope.lastSeenAt, isNull);
    });

    test('cursor payloads use server timestamp sentinels', () {
      final announcement = ReadStateSectionCursor.acknowledgementPayload(
        ReadStateSection.announcements,
      );
      final event = ReadStateSectionCursor.acknowledgementPayload(
        ReadStateSection.events,
      );
      final scope = ReadStateScopeCursor.acknowledgementPayload();

      expect(announcement['schema_version'], 1);
      expect(announcement['last_seen_at'], isA<FieldValue>());
      expect(event['global_last_seen_at'], isA<FieldValue>());
      expect(scope['last_seen_at'], isA<FieldValue>());
    });
  });

  group('unread cursor v1 feature flag', () {
    test('defaults safely OFF when the document or fields are absent', () {
      expect(UnreadCursorFeatureFlag.defaults.enabled, isFalse);
      expect(UnreadCursorFeatureFlag.defaults.mode, UnreadCursorV1Mode.off);

      final parsed = UnreadCursorFeatureFlag.fromFirestore(null);
      expect(parsed.enabled, isFalse);
      expect(parsed.mode, UnreadCursorV1Mode.off);
    });

    test('parses only supported rollout modes', () {
      final shadow = UnreadCursorFeatureFlag.fromFirestore(<String, dynamic>{
        'unreadCursorV1Enabled': true,
        'unreadCursorV1Mode': 'shadow',
      });
      final unknown = UnreadCursorFeatureFlag.fromFirestore(<String, dynamic>{
        'unreadCursorV1Enabled': true,
        'unreadCursorV1Mode': 'unexpected',
      });

      expect(shadow.enabled, isTrue);
      expect(shadow.mode, UnreadCursorV1Mode.shadow);
      expect(unknown.mode, UnreadCursorV1Mode.off);
    });
  });

  test('legacy announcements tolerate missing v1 visibility/activity fields',
      () async {
    final firestore = FakeFirebaseFirestore();
    final reference = firestore.collection('announcements').doc('legacy');
    await reference.set(<String, dynamic>{
      'title': 'Legacy',
      'message': 'No v1 fields yet',
      'sender_id': 'member-a',
      'sender_name': 'Member A',
      'type': 'info',
      'created_at': Timestamp.fromDate(DateTime.utc(2026, 9, 25)),
    });

    final announcement = Announcement.fromFirestore(await reference.get());
    expect(announcement.visibility, isNull);
    expect(announcement.lastActivityAt, isNull);
  });
}

import 'package:cloud_firestore/cloud_firestore.dart';

/// Canonical sections for the unread cursor v1 Firestore schema.
///
/// This model is intentionally not wired into the current unread UI in Phase 1.
/// It makes the persisted schema and server-timestamp write payloads explicit so
/// later phases do not reintroduce device-local timestamps as the authority.
enum ReadStateSection { announcements, events, teams, sessions }

extension ReadStateSectionPath on ReadStateSection {
  String get id => name;

  bool get supportsScopes => true;

  String get scopeCollection => switch (this) {
        ReadStateSection.events => 'conversations',
        ReadStateSection.teams => 'channels',
        ReadStateSection.sessions => 'chats',
        ReadStateSection.announcements => 'items',
      };
}

Timestamp? _timestampFromFirestore(Object? value) {
  if (value is Timestamp) return value;
  if (value is DateTime) return Timestamp.fromDate(value);
  return null;
}

int compareFirestoreTimestamps(Timestamp left, Timestamp right) {
  if (left.seconds != right.seconds) {
    return left.seconds.compareTo(right.seconds);
  }
  return left.nanoseconds.compareTo(right.nanoseconds);
}

/// A section-level cursor document under `members/{uid}/read_state/{section}`.
class ReadStateSectionCursor {
  static const int schemaVersion = 1;

  const ReadStateSectionCursor({
    required this.section,
    required this.schemaVersionValue,
    this.lastSeenAt,
    this.globalLastSeenAt,
    this.updatedAt,
  });

  final ReadStateSection section;
  final int schemaVersionValue;
  final Timestamp? lastSeenAt;
  final Timestamp? globalLastSeenAt;
  final Timestamp? updatedAt;

  factory ReadStateSectionCursor.fromFirestore(
    ReadStateSection section,
    Map<String, dynamic>? data,
  ) {
    return ReadStateSectionCursor(
      section: section,
      schemaVersionValue: (data?['schema_version'] as num?)?.toInt() ?? 0,
      lastSeenAt: _timestampFromFirestore(data?['last_seen_at']),
      globalLastSeenAt: _timestampFromFirestore(data?['global_last_seen_at']),
      updatedAt: _timestampFromFirestore(data?['updated_at']),
    );
  }

  /// Uses Firestore server timestamps, never a client device clock.
  static Map<String, Object> acknowledgementPayload(ReadStateSection section) {
    final timestamp = FieldValue.serverTimestamp();
    if (section == ReadStateSection.announcements) {
      return <String, Object>{
        'schema_version': schemaVersion,
        'last_seen_at': timestamp,
        'updated_at': timestamp,
      };
    }
    return <String, Object>{
      'schema_version': schemaVersion,
      'global_last_seen_at': timestamp,
      'updated_at': timestamp,
    };
  }
}

/// A per-conversation/channel/chat cursor subdocument.
class ReadStateScopeCursor {
  const ReadStateScopeCursor({this.lastSeenAt, this.updatedAt});

  final Timestamp? lastSeenAt;
  final Timestamp? updatedAt;

  factory ReadStateScopeCursor.fromFirestore(Map<String, dynamic>? data) {
    return ReadStateScopeCursor(
      lastSeenAt: _timestampFromFirestore(data?['last_seen_at']),
      updatedAt: _timestampFromFirestore(data?['updated_at']),
    );
  }

  static Map<String, Object> acknowledgementPayload() {
    final timestamp = FieldValue.serverTimestamp();
    return <String, Object>{
      'last_seen_at': timestamp,
      'updated_at': timestamp,
    };
  }
}

/// A cursor that applies to a conversation is the newest section or scope mark.
Timestamp? effectiveReadCursor({
  Timestamp? globalLastSeenAt,
  Timestamp? scopeLastSeenAt,
}) {
  if (globalLastSeenAt == null) return scopeLastSeenAt;
  if (scopeLastSeenAt == null) return globalLastSeenAt;
  return compareFirestoreTimestamps(globalLastSeenAt, scopeLastSeenAt) > 0
      ? globalLastSeenAt
      : scopeLastSeenAt;
}

/// Deterministic v1 session-chat scope id.
///
/// It intentionally differs from the legacy SharedPreferences key: the double
/// underscore separates a Firestore session id from the audience dimensions.
String readStateSessionScopeId(
  String sessionId,
  String groupType, [
  String? groupLevel,
]) {
  if (groupLevel == null || groupLevel.isEmpty) {
    return '${sessionId}__$groupType';
  }
  return '${sessionId}__${groupType}__$groupLevel';
}

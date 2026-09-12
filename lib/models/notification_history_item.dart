import 'package:cloud_firestore/cloud_firestore.dart';

class NotificationHistoryItem {
  final String id;
  final String title;
  final String body;
  final DateTime createdAt;
  final DateTime? readAt;
  final String type;
  final String category;
  final Map<String, dynamic> payload;

  const NotificationHistoryItem({
    required this.id,
    required this.title,
    required this.body,
    required this.createdAt,
    required this.type,
    required this.category,
    required this.payload,
    this.readAt,
  });

  bool get isRead => readAt != null;

  /// Keep every delivery record until each legacy action notification can be
  /// proven to have a durable, readable domain document. Some digests/results
  /// have no task id and sender-side confirmation results are not in the
  /// recipient Actions stream. Hiding them here would silently erase history.
  /// Ordinary communications remain unchanged; this is a loss-prevention
  /// fallback and can be narrowed when every legacy producer is migrated.
  bool get belongsInCommunicationHistory => true;

  factory NotificationHistoryItem.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> document,
  ) {
    final data = document.data() ?? const <String, dynamic>{};
    final rawPayload = data['data'];
    final payload = rawPayload is Map
        ? rawPayload.map((key, value) => MapEntry(key.toString(), value))
        : <String, dynamic>{};

    for (final key in const [
      'type',
      'club_id',
      'clubId',
      'operation_id',
      'operationId',
      'announcement_id',
      'announcementId',
      'channel_id',
      'channelId',
      'session_id',
      'sessionId',
      'member_id',
      'memberId',
      'cert_id',
      'confirmation_id',
      'confirmationId',
      'formation_task_id',
      'formationTaskId',
      'task_id',
      'taskId',
      'target_tab',
      'deeplink',
    ]) {
      final value = data[key];
      if (value != null && !payload.containsKey(key)) payload[key] = value;
    }

    final type = (data['type'] ?? payload['type'] ?? 'unknown').toString();
    payload.putIfAbsent('type', () => type);

    return NotificationHistoryItem(
      id: document.id,
      title: (data['title'] ?? '').toString(),
      body: (data['body'] ?? '').toString(),
      createdAt: _dateFrom(data['created_at']) ?? DateTime.now(),
      readAt: _dateFrom(data['read_at']) ??
          (data['read'] == true ? _dateFrom(data['created_at']) : null),
      type: type,
      category: (data['category'] ?? _categoryForType(type)).toString(),
      payload: Map.unmodifiable(payload),
    );
  }

  static DateTime? _dateFrom(Object? value) {
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    if (value is String) return DateTime.tryParse(value);
    return null;
  }

  static String _categoryForType(String type) {
    switch (type) {
      case 'announcement':
      case 'announcement_reply':
        return 'Annonce';
      case 'event_message':
      case 'team_message':
      case 'session_message':
        return 'Conversation';
      case 'new_operation':
      case 'event_waitlist_promoted':
      case 'session_reminder':
        return 'Activité';
      case 'piscine_task_assigned':
      case 'exercice_declared':
      case 'exercice_digest':
      case 'formation_reminder':
      case 'claim_rejected':
      case 'logbook_dive_confirmation':
      case 'logbook_dive_confirmation_result':
        return 'Action';
      case 'medical_certificate':
        return 'Médical';
      default:
        return 'Notification';
    }
  }
}

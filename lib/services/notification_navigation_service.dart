import 'dart:collection';

/// Where a notification interaction originated.
///
/// All entry points use the same parser and queue so foreground, background
/// and cold-start behaviour cannot drift apart.
enum NotificationTapOrigin { foreground, background, terminated }

enum NotificationRouteKind {
  operation,
  announcement,
  teamChat,
  sessionChat,
  sessionDetail,
  exerciseDeclaration,
  formationTask,
  communicationInbox,
  medicalCertificate,
  logbookConfirmation,
  unsupported,
}

/// Normalised, privacy-safe representation of an FCM/local notification tap.
///
/// Firebase requires string values in `data`, while local notifications are
/// restored from JSON and may contain numbers or booleans. Normalising here
/// gives every app state identical routing behaviour.
class NotificationNavigationRequest {
  final Map<String, String> data;
  final NotificationTapOrigin origin;
  final String? messageId;

  NotificationNavigationRequest._({
    required this.data,
    required this.origin,
    this.messageId,
  });

  factory NotificationNavigationRequest.fromData(
    Map<String, dynamic> rawData, {
    required NotificationTapOrigin origin,
    String? messageId,
  }) {
    final normalised = <String, String>{};
    for (final entry in rawData.entries) {
      final value = entry.value?.toString().trim();
      if (value != null && value.isNotEmpty) {
        normalised[entry.key] = value;
      }
    }
    return NotificationNavigationRequest._(
      data: Map.unmodifiable(normalised),
      origin: origin,
      messageId: _clean(messageId),
    );
  }

  String? get type => _value('type');
  String? get clubId => _value('club_id');
  String? get operationId => _value('operation_id');
  String? get announcementId => _value('announcement_id');
  String? get channelId => _value('channel_id');
  String? get sessionId => _value('session_id');
  String? get confirmationId => _value('confirmation_id');
  String? get memberId => _value('member_id');
  String? get exerciceValideId => _value('exercice_valide_id');
  String? get exerciseCode =>
      _value('exercice_code') ?? _value('exercise_code');

  int? get taskCount => int.tryParse(_value('task_count') ?? '');

  String? get formationTaskId {
    final direct = _value('formation_task_id') ?? _value('task_id');
    if (direct != null) return direct;

    final deepLink = _value('deeplink');
    const prefix = 'formation_task:';
    if (deepLink != null && deepLink.startsWith(prefix)) {
      return _clean(deepLink.substring(prefix.length));
    }
    return null;
  }

  NotificationRouteKind get routeKind {
    switch (type) {
      case 'event_message':
      case 'new_operation':
        return NotificationRouteKind.operation;
      case 'announcement':
      case 'announcement_reply':
        return NotificationRouteKind.announcement;
      case 'team_message':
        return NotificationRouteKind.teamChat;
      case 'session_message':
        return NotificationRouteKind.sessionChat;
      case 'piscine_task_assigned':
      case 'session_reminder':
        return NotificationRouteKind.sessionDetail;
      case 'exercice_declared':
        return NotificationRouteKind.exerciseDeclaration;
      case 'exercice_digest':
        return NotificationRouteKind.communicationInbox;
      case 'formation_reminder':
        return formationTaskId != null && (taskCount == null || taskCount == 1)
            ? NotificationRouteKind.formationTask
            : NotificationRouteKind.communicationInbox;
      case 'claim_rejected':
        return formationTaskId != null
            ? NotificationRouteKind.formationTask
            : NotificationRouteKind.communicationInbox;
      case 'medical_certificate':
        return NotificationRouteKind.medicalCertificate;
      case 'logbook_dive_confirmation':
      case 'logbook_dive_confirmation_result':
        return NotificationRouteKind.logbookConfirmation;
      default:
        // Forward-compatible payloads can opt into the generic task route.
        if (formationTaskId != null) {
          return NotificationRouteKind.formationTask;
        }
        return NotificationRouteKind.unsupported;
    }
  }

  /// Stable key used to ignore double taps and duplicate OS callbacks.
  String get deduplicationKey {
    final stableMessageId = _clean(messageId);
    if (stableMessageId != null) return 'message:$stableMessageId';

    final objectId = formationTaskId ??
        confirmationId ??
        operationId ??
        announcementId ??
        channelId ??
        sessionId ??
        exerciceValideId ??
        memberId ??
        _value('deeplink') ??
        'generic';
    return '${type ?? 'unknown'}|${clubId ?? ''}|$objectId';
  }

  String? _value(String key) => _clean(data[key]);

  static String? _clean(String? value) {
    final cleaned = value?.trim();
    return cleaned == null || cleaned.isEmpty ? null : cleaned;
  }
}

/// Small in-memory queue that preserves notification taps until navigation is
/// safe (authenticated member context + navigator route ready).
class NotificationNavigationQueue {
  final Duration duplicateWindow;
  final Queue<NotificationNavigationRequest> _pending = Queue();
  final Map<String, DateTime> _recentlyHandled = {};

  NotificationNavigationQueue({
    this.duplicateWindow = const Duration(seconds: 30),
  });

  int get pendingCount => _pending.length;

  bool enqueue(
    NotificationNavigationRequest request, {
    DateTime? now,
  }) {
    final timestamp = now ?? DateTime.now();
    _removeExpired(timestamp);
    final key = request.deduplicationKey;
    if (_recentlyHandled.containsKey(key) ||
        _pending.any((item) => item.deduplicationKey == key)) {
      return false;
    }
    _pending.addLast(request);
    return true;
  }

  NotificationNavigationRequest? takeNext() {
    if (_pending.isEmpty) return null;
    return _pending.removeFirst();
  }

  void putBack(NotificationNavigationRequest request) {
    if (_pending
        .any((item) => item.deduplicationKey == request.deduplicationKey)) {
      return;
    }
    _pending.addFirst(request);
  }

  void markHandled(
    NotificationNavigationRequest request, {
    DateTime? now,
  }) {
    final timestamp = now ?? DateTime.now();
    _removeExpired(timestamp);
    _recentlyHandled[request.deduplicationKey] = timestamp;
  }

  void _removeExpired(DateTime now) {
    _recentlyHandled.removeWhere(
      (_, handledAt) => now.difference(handledAt) > duplicateWindow,
    );
  }
}

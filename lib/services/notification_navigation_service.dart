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
  birthday,
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
  String? get clubId => _firstValue(const ['club_id', 'clubId']);
  String? get operationId => _firstValue(const ['operation_id', 'operationId']);
  String? get announcementId =>
      _firstValue(const ['announcement_id', 'announcementId']);
  String? get channelId => _firstValue(const ['channel_id', 'channelId']);
  String? get sessionId => _firstValue(const ['session_id', 'sessionId']);
  String? get confirmationId =>
      _firstValue(const ['confirmation_id', 'confirmationId']);
  String? get memberId => _firstValue(const ['member_id', 'memberId']);
  String? get exerciceValideId =>
      _firstValue(const ['exercice_valide_id', 'exerciceValideId']);
  String? get exerciseCode =>
      _firstValue(const ['exercice_code', 'exercise_code', 'exerciseCode']);
  String? get groupType => _firstValue(const ['group_type', 'groupType']);
  String? get groupLevel => _firstValue(const ['group_level', 'groupLevel']);

  int? get taskCount =>
      int.tryParse(_firstValue(const ['task_count', 'taskCount']) ?? '');

  String? get deeplink => _value('deeplink');
  String? get targetTab => _value('target_tab') ?? _value('tab');

  String? get formationTaskId {
    final direct = _firstValue(
      const ['formation_task_id', 'formationTaskId', 'task_id', 'taskId'],
    );
    if (direct != null) return direct;

    final deepLink = _firstValue(const ['deeplink', 'deepLink']);
    const prefix = 'formation_task:';
    if (deepLink != null && deepLink.startsWith(prefix)) {
      return _clean(deepLink.substring(prefix.length));
    }
    return null;
  }

  bool get prefersActionsInbox {
    final tab = targetTab;
    if (tab == 'actions' || tab == 'formation_actions') {
      return true;
    }
    final link = deeplink;
    if (link == 'communication:actions' || link == 'actions') {
      return true;
    }
    return type == 'formation_reminder' && formationTaskId == null;
  }

  NotificationRouteKind get routeKind {
    switch (type) {
      case 'event_message':
      case 'new_operation':
      case 'event_waitlist_promoted':
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
      case 'birthday':
        return NotificationRouteKind.birthday;
      default:
        // Forward-compatible payloads can opt into the generic task route.
        if (formationTaskId != null) {
          return NotificationRouteKind.formationTask;
        }
        return NotificationRouteKind.unsupported;
    }
  }

  /// Whether this request contains every identifier required by its route.
  ///
  /// Keeping this policy next to the payload normalisation makes invalid
  /// destinations testable without mounting the application navigator.
  bool get hasValidDestination {
    switch (routeKind) {
      case NotificationRouteKind.operation:
        return operationId != null;
      case NotificationRouteKind.announcement:
        return announcementId != null;
      case NotificationRouteKind.teamChat:
        return channelId != null;
      case NotificationRouteKind.sessionChat:
      case NotificationRouteKind.sessionDetail:
        return sessionId != null;
      case NotificationRouteKind.exerciseDeclaration:
        return memberId != null && exerciceValideId != null;
      case NotificationRouteKind.logbookConfirmation:
        return confirmationId != null;
      case NotificationRouteKind.formationTask:
        return formationTaskId != null;
      case NotificationRouteKind.birthday:
      case NotificationRouteKind.communicationInbox:
      case NotificationRouteKind.medicalCertificate:
        return true;
      case NotificationRouteKind.unsupported:
        return false;
    }
  }

  /// Stable key used to ignore double taps and duplicate OS callbacks.
  String get deduplicationKey {
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

    // Background/cold-start callbacks expose the globally unique FCM transport
    // ID directly. Foreground notifications are restored from local JSON and
    // therefore fall back to the originating document ID in the data payload.
    final transportMessageId = _clean(messageId);
    if (transportMessageId != null) return 'message:$transportMessageId';
    final payloadMessageId =
        _firstValue(const ['message_id', 'messageId']);
    if (payloadMessageId != null) {
      return 'payload-message:${type ?? 'unknown'}|${clubId ?? ''}|$objectId|$payloadMessageId';
    }

    return '${type ?? 'unknown'}|${clubId ?? ''}|$objectId';
  }

  String? _value(String key) => _clean(data[key]);

  String? _firstValue(List<String> keys) {
    for (final key in keys) {
      final value = _value(key);
      if (value != null) return value;
    }
    return null;
  }

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
  final Set<String> _inFlight = {};
  final Map<String, DateTime> _recentlyHandled = {};

  NotificationNavigationQueue({
    this.duplicateWindow = const Duration(seconds: 30),
  });

  int get pendingCount => _pending.length;

  bool enqueue(NotificationNavigationRequest request, {DateTime? now}) {
    final timestamp = now ?? DateTime.now();
    _removeExpired(timestamp);
    final key = request.deduplicationKey;
    if (_recentlyHandled.containsKey(key) ||
        _inFlight.contains(key) ||
        _pending.any((item) => item.deduplicationKey == key)) {
      return false;
    }
    _pending.addLast(request);
    return true;
  }

  NotificationNavigationRequest? takeNext() {
    if (_pending.isEmpty) return null;
    final request = _pending.removeFirst();
    _inFlight.add(request.deduplicationKey);
    return request;
  }

  void putBack(NotificationNavigationRequest request) {
    _inFlight.remove(request.deduplicationKey);
    if (_pending.any(
      (item) => item.deduplicationKey == request.deduplicationKey,
    )) {
      return;
    }
    _pending.addFirst(request);
  }

  void markHandled(NotificationNavigationRequest request, {DateTime? now}) {
    final timestamp = now ?? DateTime.now();
    _removeExpired(timestamp);
    _inFlight.remove(request.deduplicationKey);
    _recentlyHandled[request.deduplicationKey] = timestamp;
  }

  void _removeExpired(DateTime now) {
    _recentlyHandled.removeWhere(
      (_, handledAt) => now.difference(handledAt) > duplicateWindow,
    );
  }
}

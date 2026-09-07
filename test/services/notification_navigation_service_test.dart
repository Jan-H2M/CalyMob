import 'package:calymob/services/notification_navigation_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  NotificationNavigationRequest request(
    Map<String, dynamic> data, {
    NotificationTapOrigin origin = NotificationTapOrigin.background,
    String? messageId,
  }) =>
      NotificationNavigationRequest.fromData(
        data,
        origin: origin,
        messageId: messageId,
      );

  group('formation notification routing', () {
    test('single reminder opens its exact formation task', () {
      final value = request({
        'type': 'formation_reminder',
        'club_id': 'calypso',
        'task_count': '1',
        'deeplink': 'formation_task:task-123',
      });

      expect(value.formationTaskId, 'task-123');
      expect(value.routeKind, NotificationRouteKind.formationTask);
    });

    test('explicit task id works without the legacy deeplink field', () {
      final value = request({
        'type': 'formation_reminder',
        'task_count': 1,
        'formation_task_id': 'task-456',
      });

      expect(value.formationTaskId, 'task-456');
      expect(value.routeKind, NotificationRouteKind.formationTask);
    });

    test('multi-task reminder opens the inbox, never an arbitrary task', () {
      final value = request({
        'type': 'formation_reminder',
        'task_count': '3',
        'deeplink': 'communication:inbox',
      });

      expect(value.formationTaskId, isNull);
      expect(value.routeKind, NotificationRouteKind.communicationInbox);
    });

    test('claim rejection opens the exact retry task', () {
      final value = request({
        'type': 'claim_rejected',
        'formation_task_id': 'retry-1',
        'exercise_claim_id': 'claim-1',
      });

      expect(value.formationTaskId, 'retry-1');
      expect(value.routeKind, NotificationRouteKind.formationTask);
    });

    test('legacy exercise declaration retains member and exercise ids', () {
      final value = request({
        'type': 'exercice_declared',
        'member_id': 'member-1',
        'exercice_valide_id': 'validation-1',
        'exercice_code': 'P2.DP',
      });

      expect(value.routeKind, NotificationRouteKind.exerciseDeclaration);
      expect(value.memberId, 'member-1');
      expect(value.exerciceValideId, 'validation-1');
      expect(value.exerciseCode, 'P2.DP');
    });
  });

  group('all app states use the same route mapping', () {
    for (final origin in NotificationTapOrigin.values) {
      test(origin.name, () {
        final value = request({
          'type': 'formation_reminder',
          'task_count': '1',
          'formation_task_id': 'task-1',
        }, origin: origin);

        expect(value.origin, origin);
        expect(value.routeKind, NotificationRouteKind.formationTask);
      });
    }
  });

  test('existing notification types keep their destinations', () {
    final cases = <String, NotificationRouteKind>{
      'event_message': NotificationRouteKind.operation,
      'new_operation': NotificationRouteKind.operation,
      'announcement': NotificationRouteKind.announcement,
      'announcement_reply': NotificationRouteKind.announcement,
      'team_message': NotificationRouteKind.teamChat,
      'session_message': NotificationRouteKind.sessionChat,
      'piscine_task_assigned': NotificationRouteKind.sessionDetail,
      'session_reminder': NotificationRouteKind.sessionDetail,
      'exercice_digest': NotificationRouteKind.communicationInbox,
      'medical_certificate': NotificationRouteKind.medicalCertificate,
      'logbook_dive_confirmation': NotificationRouteKind.logbookConfirmation,
      'logbook_dive_confirmation_result':
          NotificationRouteKind.logbookConfirmation,
    };

    for (final entry in cases.entries) {
      expect(
        request({'type': entry.key}).routeKind,
        entry.value,
        reason: entry.key,
      );
    }
  });

  test('accepts canonical payload aliases from callable and FCM senders', () {
    final value = request({
      'type': 'event_waitlist_promoted',
      'clubId': 'club-1',
      'operationId': 'operation-1',
    });

    expect(value.clubId, 'club-1');
    expect(value.operationId, 'operation-1');
    expect(value.routeKind, NotificationRouteKind.operation);

    final session = request({
      'type': 'session_message',
      'sessionId': 'session-1',
      'groupType': 'niveau',
      'groupLevel': 'P2',
    });
    expect(session.sessionId, 'session-1');
    expect(session.groupType, 'niveau');
    expect(session.groupLevel, 'P2');

    final formation = request({
      'type': 'formation_reminder',
      'formationTaskId': 'task-1',
      'taskCount': '1',
    });
    expect(formation.formationTaskId, 'task-1');
    expect(formation.routeKind, NotificationRouteKind.formationTask);
  });

  group('destination validation', () {
    test('rejects routed payloads whose required identifier is missing', () {
      final invalidPayloads = [
        {'type': 'event_message'},
        {'type': 'announcement'},
        {'type': 'team_message'},
        {'type': 'session_message'},
        {'type': 'session_reminder'},
        {'type': 'exercice_declared', 'member_id': 'member-1'},
        {'type': 'logbook_dive_confirmation'},
        {'type': 'unknown'},
      ];

      for (final payload in invalidPayloads) {
        expect(
          request(payload).hasValidDestination,
          isFalse,
          reason: payload['type'],
        );
      }
    });

    test('accepts complete snake_case and camelCase destinations', () {
      final validPayloads = [
        {'type': 'event_message', 'operation_id': 'operation-1'},
        {'type': 'announcement', 'announcementId': 'announcement-1'},
        {'type': 'team_message', 'channel_id': 'channel-1'},
        {'type': 'session_message', 'sessionId': 'session-1'},
        {'type': 'session_reminder', 'session_id': 'session-1'},
        {
          'type': 'exercice_declared',
          'memberId': 'member-1',
          'exerciceValideId': 'validation-1',
        },
        {
          'type': 'logbook_dive_confirmation',
          'confirmationId': 'confirmation-1',
        },
        {'type': 'birthday'},
        {'type': 'medical_certificate'},
      ];

      for (final payload in validPayloads) {
        expect(
          request(payload).hasValidDestination,
          isTrue,
          reason: payload['type'],
        );
      }
    });
  });

  group('idempotent pending queue', () {
    test('keeps a cold-start tap pending until the app consumes it', () {
      final queue = NotificationNavigationQueue();
      final value = request({
        'type': 'formation_reminder',
        'formation_task_id': 'task-1',
      }, origin: NotificationTapOrigin.terminated);

      expect(queue.enqueue(value), isTrue);
      expect(queue.pendingCount, 1);
      expect(queue.takeNext(), same(value));
    });

    test('ignores duplicate callbacks and double taps', () {
      final now = DateTime(2026, 8, 2, 10);
      final queue = NotificationNavigationQueue();
      final first = request({
        'type': 'formation_reminder',
        'formation_task_id': 'task-1',
      }, messageId: 'message-1');
      final duplicate = request({
        'type': 'formation_reminder',
        'formation_task_id': 'task-1',
      }, messageId: 'message-1');

      expect(queue.enqueue(first, now: now), isTrue);
      expect(queue.enqueue(duplicate, now: now), isFalse);
      expect(queue.takeNext(), same(first));
      queue.markHandled(first, now: now);
      expect(queue.enqueue(duplicate, now: now), isFalse);
    });

    test('allows another attempt after the duplicate window', () {
      final queue = NotificationNavigationQueue(
        duplicateWindow: const Duration(seconds: 5),
      );
      final value = request({
        'type': 'formation_reminder',
        'formation_task_id': 'task-1',
      });
      final now = DateTime(2026, 8, 2, 10);

      expect(queue.enqueue(value, now: now), isTrue);
      expect(queue.takeNext(), same(value));
      queue.markHandled(value, now: now);
      expect(
        queue.enqueue(value, now: now.add(const Duration(seconds: 6))),
        isTrue,
      );
    });

    test('putBack preserves an unhandled cold-start tap for retry', () {
      final queue = NotificationNavigationQueue();
      final value = request({
        'type': 'session_message',
        'session_id': 'session-1',
      }, origin: NotificationTapOrigin.terminated);

      expect(queue.enqueue(value), isTrue);
      final taken = queue.takeNext();
      expect(taken, same(value));

      queue.putBack(taken!);

      expect(queue.pendingCount, 1);
      expect(queue.takeNext(), same(value));
    });

    test('rejects a duplicate while its destination screen is in flight', () {
      final queue = NotificationNavigationQueue();
      final first = request(
        {'type': 'event_message', 'operation_id': 'operation-1'},
        messageId: 'message-1',
      );
      final duplicate = request(
        {'type': 'event_message', 'operation_id': 'operation-1'},
        messageId: 'message-1',
      );

      expect(queue.enqueue(first), isTrue);
      expect(queue.takeNext(), same(first));

      expect(queue.enqueue(duplicate), isFalse);

      queue.markHandled(first);
      expect(queue.enqueue(duplicate), isFalse);
    });

    test(
        'allows distinct foreground messages in the same session while suppressing a duplicate',
        () {
      final queue = NotificationNavigationQueue();
      final p2Message = request({
        'type': 'session_message',
        'session_id': 'session-1',
        'group_type': 'niveau',
        'group_level': 'P2',
        'message_id': 'message-p2',
      }, origin: NotificationTapOrigin.foreground);
      final p3Message = request({
        'type': 'session_message',
        'session_id': 'session-1',
        'group_type': 'niveau',
        'group_level': 'P3',
        'messageId': 'message-p3',
      }, origin: NotificationTapOrigin.foreground);
      final duplicateP2Message = request({
        'type': 'session_message',
        'session_id': 'session-1',
        'group_type': 'niveau',
        'group_level': 'P2',
        'messageId': 'message-p2',
      }, origin: NotificationTapOrigin.foreground);

      expect(queue.enqueue(p2Message), isTrue);
      expect(queue.takeNext(), same(p2Message));

      expect(queue.enqueue(p3Message), isTrue);
      expect(queue.enqueue(duplicateP2Message), isFalse);
    });
  });
}

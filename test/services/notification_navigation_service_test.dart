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
  });
}

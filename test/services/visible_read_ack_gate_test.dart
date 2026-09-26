import 'package:calymob/services/visible_read_ack_gate.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('waits for content and access before acknowledging', () {
    final gate = VisibleReadAckGate();

    expect(gate.begin(ready: true, cursor: false), isNull);
    gate.recordContent('empty');
    expect(gate.begin(ready: false, cursor: false), isNull);
    expect(gate.begin(ready: true, cursor: false), 1);
  });

  test('cursor handover acknowledges content already handled by legacy', () {
    final gate = VisibleReadAckGate()..recordContent('message-1');
    final legacyRevision = gate.begin(ready: true, cursor: false)!;
    gate.finish(
      revision: legacyRevision,
      cursor: false,
      succeeded: true,
    );

    expect(gate.begin(ready: true, cursor: false), isNull);
    expect(gate.begin(ready: true, cursor: true), 1);
  });

  test('failed acknowledgement remains retryable and success is coalesced', () {
    final gate = VisibleReadAckGate()..recordContent('message-1');
    final failedRevision = gate.begin(ready: true, cursor: true)!;
    expect(gate.begin(ready: true, cursor: true), isNull);
    gate.finish(
      revision: failedRevision,
      cursor: true,
      succeeded: false,
    );
    expect(gate.begin(ready: true, cursor: true), failedRevision);
    gate.finish(
      revision: failedRevision,
      cursor: true,
      succeeded: true,
    );
    expect(gate.begin(ready: true, cursor: true), isNull);

    gate.recordContent('message-2');
    expect(gate.hasPending(cursor: true), isTrue);
    expect(gate.begin(ready: true, cursor: true), 2);
  });

  testWidgets('failed acknowledgements retry indefinitely with capped backoff',
      (tester) async {
    var retries = 0;
    final scheduler = VisibleReadAckRetryScheduler(
      delays: const <Duration>[
        Duration(milliseconds: 10),
        Duration(milliseconds: 20),
      ],
    );

    expect(scheduler.schedule(() => retries += 1), isTrue);
    expect(scheduler.schedule(() => retries += 1), isFalse,
        reason: 'only one retry timer may be pending');
    await tester.pump(const Duration(milliseconds: 9));
    expect(retries, 0);
    await tester.pump(const Duration(milliseconds: 1));
    expect(retries, 1);

    expect(scheduler.schedule(() => retries += 1), isTrue);
    await tester.pump(const Duration(milliseconds: 20));
    expect(retries, 2);
    expect(scheduler.schedule(() => retries += 1), isTrue,
        reason: 'the final delay repeats while visible content is pending');
    await tester.pump(const Duration(milliseconds: 20));
    expect(retries, 3);

    scheduler.reset();
    expect(scheduler.schedule(() => retries += 1), isTrue,
        reason: 'new content or a successful write resets the budget');
    scheduler.dispose();
  });

  testWidgets('suspending a retry prevents background acknowledgement',
      (tester) async {
    var retries = 0;
    final scheduler = VisibleReadAckRetryScheduler(
      delays: const <Duration>[Duration(milliseconds: 10)],
    );
    scheduler.schedule(() => retries += 1);
    scheduler.suspend();
    await tester.pump(const Duration(milliseconds: 20));
    expect(retries, 0);
    expect(scheduler.attempts, 1,
        reason: 'covering a route must not create an unbounded retry loop');
  });

  testWidgets('a mounted widget below another route is not visible',
      (tester) async {
    final probeKey = GlobalKey<_RouteVisibilityProbeState>();
    await tester.pumpWidget(MaterialApp(
        home: _RouteVisibilityProbe(
      key: probeKey,
    )));
    expect(probeKey.currentState!.isVisible, isTrue);

    final navigator = Navigator.of(probeKey.currentContext!);
    navigator.push<void>(MaterialPageRoute<void>(
      builder: (_) => const Scaffold(body: Text('cover')),
    ));
    await tester.pumpAndSettle();
    expect(probeKey.currentState!.mounted, isTrue);
    expect(probeKey.currentState!.isVisible, isFalse);

    navigator.pop();
    await tester.pumpAndSettle();
    expect(probeKey.currentState!.isVisible, isTrue);
  });
}

class _RouteVisibilityProbe extends StatefulWidget {
  const _RouteVisibilityProbe({super.key});

  @override
  State<_RouteVisibilityProbe> createState() => _RouteVisibilityProbeState();
}

class _RouteVisibilityProbeState extends State<_RouteVisibilityProbe> {
  bool get isVisible => isCurrentRouteForReadAcknowledgement(context);

  @override
  Widget build(BuildContext context) {
    isCurrentRouteForReadAcknowledgement(context);
    return const Scaffold(body: Text('probe'));
  }
}

import 'package:calymob/widgets/monitor_observation_roster_member_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('absent member is complete without a false verdict', () {
    expect(isRosterMemberComplete(false, null), isTrue);
    expect(isRosterMemberComplete(true, null), isFalse);
    expect(isRosterMemberComplete(null, 'acquis'), isFalse);
    expect(isRosterMemberComplete(true, 'acquis'), isTrue);
  });

  test('batch verdict fills only unevaluated members', () {
    final verdicts = <String, String?>{
      'alice': 'a_revoir',
      'bob': null,
      'carla': null,
    };

    final changed = applyVerdictToUnevaluated(verdicts, 'acquis');

    expect(changed, 2);
    expect(verdicts, {
      'alice': 'a_revoir',
      'bob': 'acquis',
      'carla': 'acquis',
    });
  });

  test('batch skips absent members', () {
    final verdicts = <String, String?>{'alice': null, 'bob': null};
    final changed = applyVerdictToUnevaluated(
      verdicts,
      'acquis',
      presence: {'alice': true, 'bob': false},
    );
    expect(changed, 1);
    expect(verdicts, {'alice': 'acquis', 'bob': null});
  });

  testWidgets('compact row exposes activity, attendance and direct A/P/R',
      (tester) async {
    String? verdict;
    bool? presence = true;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MonitorObservationRosterMemberCard(
            memberId: 'member-a',
            name: 'Alice Apnée',
            level: '2*',
            taskCount: 2,
            activityLabel: 'Formation · Service (gonflage)',
            attendanceLabel: 'Présent',
            isPresent: true,
            selectedPresence: presence,
            onPresenceChanged: (value) => presence = value,
            selectedVerdict: verdict,
            onVerdictChanged: (value) => verdict = value,
            hasComment: false,
            onComment: () {},
          ),
        ),
      ),
    );

    expect(find.text('2* · Formation · Service (gonflage)'), findsOneWidget);
    expect(find.text('Prés.'), findsOneWidget);
    expect(find.text('Abs.'), findsOneWidget);
    expect(find.byIcon(Icons.layers_outlined), findsOneWidget);
    expect(
      find.bySemanticsLabel(RegExp('Acquis pour Alice Apnée')),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const ValueKey('verdict-member-a-acquis')),
    );
    expect(verdict, 'acquis');

    await tester.tap(
      find.byKey(const ValueKey('attendance-member-a-absent')),
    );
    expect(presence, isFalse);
  });

  testWidgets('comment action opens a popup and preserves entered text',
      (tester) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);

    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: FilledButton(
              onPressed: () => showDialog<bool>(
                context: context,
                builder: (_) => RosterCommentDialog(
                  memberName: 'Alice Apnée',
                  controller: controller,
                ),
              ),
              child: const Text('Commenter'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Commenter'));
    await tester.pumpAndSettle();
    expect(find.text('Commentaire · Alice Apnée'), findsOneWidget);

    await tester.enterText(
      find.byKey(const ValueKey('roster-comment-field')),
      'Bonne maîtrise',
    );
    await tester.tap(
      find.byKey(const ValueKey('save-roster-comment')),
    );
    await tester.pumpAndSettle();
    expect(controller.text, 'Bonne maîtrise');
  });
}

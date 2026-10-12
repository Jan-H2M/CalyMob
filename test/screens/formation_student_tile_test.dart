import 'package:calymob/widgets/formation/formation_student_tile.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
      'compact shared learner tile fits narrow width and retains detail and enrollment actions',
      (tester) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    var opened = 0;
    var toggled = 0;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: Align(
                alignment: Alignment.topCenter,
                child: FormationStudentTile(
                    name: 'Élève Synthétique Très Long',
                    subtitle: '2 → 3*',
                    avatar: const CircleAvatar(radius: 15, child: Text('ES')),
                    goal:
                        const Text('3★', style: TextStyle(color: Colors.white)),
                    active: true,
                    onTap: () => opened++,
                    onToggle: () => toggled++)))));
    expect(tester.getSize(find.byType(ListTile)).height, lessThanOrEqualTo(64));
    expect(find.byType(LinearProgressIndicator), findsNothing);
    await tester.tap(find.text('Élève Synthétique Très Long'));
    expect(opened, 1);
    await tester.tap(find.byTooltip('Retirer de la formation'));
    expect(toggled, 1);
    expect(tester.takeException(), isNull);
  });
}

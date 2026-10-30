import 'package:calymob/widgets/formation/formation_student_tile.dart';
import 'package:calymob/models/member_profile.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
      'both disciplines share the exact tile height, avatar and read-only goal treatment',
      (tester) async {
    final member =
        MemberProfile(id: 'qa', nom: 'Synthétique', prenom: 'Élève', email: '');
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: Column(children: [
      FormationStudentTile(
          name: member.fullName,
          subtitle: '2 → 3*',
          avatar: FormationStudentAvatar(member: member),
          goal: FormationGoalSelector(
              value: '3*', levels: const {'3*': '3★'}, onChanged: (_) {})),
      FormationStudentTile(
          name: member.fullName,
          subtitle: 'A1 / Discovery',
          avatar: FormationStudentAvatar(member: member),
          goal: FormationGoalSelector(
              value: 'apnee.a1',
              levels: const {'apnee.a1': '1★'},
              onChanged: (_) {})),
    ]))));
    final tiles = find.byType(ListTile);
    expect(
        tester.getSize(tiles.at(0)).height, tester.getSize(tiles.at(1)).height);
    expect(find.byType(FormationStudentAvatar), findsNWidgets(2));
    expect(find.byType(DropdownButton<String>), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('the common avatar does not reveal a photo without consent',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: FormationStudentAvatar(
                member: MemberProfile(
                    id: 'qa',
                    nom: 'Synthétique',
                    prenom: 'Élève',
                    email: '',
                    photoUrl: 'https://synthetic.invalid/photo.png',
                    consentInternalPhoto: false)))));
    expect(find.byType(CachedNetworkImage), findsNothing);
    expect(find.text('ÉS'), findsOneWidget);
  });
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

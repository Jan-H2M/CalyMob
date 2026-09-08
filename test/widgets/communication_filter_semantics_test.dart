import 'dart:ui' show Tristate;

import 'package:calymob/widgets/communication_filter_semantics.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('selected communication filter is an actionable accessible tab',
      (tester) async {
    final semantics = tester.ensureSemantics();
    var taps = 0;

    await tester.pumpWidget(MaterialApp(
      home: CommunicationFilterSemantics(
        label: 'Actions',
        selected: true,
        onTap: () => taps += 1,
        child: const Text('ignored child label'),
      ),
    ));

    final node = tester.getSemantics(find.bySemanticsLabel('Filtre Actions'));
    final data = node.getSemanticsData();
    expect(data.role, SemanticsRole.tab);
    expect(data.flagsCollection.isSelected, Tristate.isTrue);
    expect(data.hasAction(SemanticsAction.tap), isTrue);
    expect(data.label, 'Filtre Actions');
    expect(data.label, isNot(contains('ignored child label')));

    tester.semantics.tap(find.semantics.byLabel('Filtre Actions'));
    expect(taps, 1);
    semantics.dispose();
  });
}

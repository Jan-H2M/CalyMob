import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/screens/operations/operations_filter_bar.dart';

void main() {
  Future<void> pumpBar(
    WidgetTester tester, {
    required bool canCreateEvents,
    required ValueChanged<String> onFilterSelected,
    required VoidCallback onPastToggled,
  }) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Align(
            alignment: Alignment.topLeft,
            child: OperationsFilterBar(
              selectedFilter: 'all',
              canCreateEvents: canCreateEvents,
              includePast: false,
              onFilterSelected: onFilterSelected,
              onPastToggled: onPastToggled,
            ),
          ),
        ),
      ),
    );
  }

  testWidgets('member sees and can open Passés without horizontal scrolling', (
    tester,
  ) async {
    var pastTaps = 0;
    await pumpBar(
      tester,
      canCreateEvents: false,
      onFilterSelected: (_) {},
      onPastToggled: () => pastTaps++,
    );

    final past = find.text('Passés');
    expect(past, findsOneWidget);
    expect(
      tester.getTopLeft(past).dx,
      greaterThan(tester.getTopLeft(find.text('Tout')).dx),
    );
    expect(tester.getBottomRight(past).dx, lessThan(320));
    await tester.tap(past);
    expect(pastTaps, 1);
  });

  testWidgets('organizer sees and can open Clôturés without scrolling', (
    tester,
  ) async {
    String? selected;
    await pumpBar(
      tester,
      canCreateEvents: true,
      onFilterSelected: (value) => selected = value,
      onPastToggled: () {},
    );

    final closed = find.text('Clôturés');
    expect(closed, findsOneWidget);
    expect(find.text('Passés'), findsNothing);
    expect(tester.getBottomRight(closed).dx, lessThan(320));
    await tester.tap(closed);
    expect(selected, 'closed');
  });
}

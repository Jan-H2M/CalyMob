import 'dart:convert';

import 'package:calymob/models/bug_report_screenshot.dart';
import 'package:calymob/widgets/bug_report_widget.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

final _pixel = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk'
  'YAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
);

BugReportScreenshot capture(String page, int minute) => BugReportScreenshot(
      bytes: _pixel,
      page: page,
      capturedAt: DateTime.utc(2026, 10, 16, 12, minute),
    );

void main() {
  test('route label uses observer route name and a non-empty fallback', () {
    final named = MaterialPageRoute<void>(
      settings: const RouteSettings(name: '/details'),
      builder: (_) => const SizedBox(),
    );
    final unnamed = MaterialPageRoute<void>(
      builder: (_) => const SizedBox(),
    );

    expect(bugReportRouteLabel(named), '/details');
    expect(bugReportRouteLabel(unnamed), contains('MaterialPageRoute'));
    expect(bugReportRouteLabel(null), isNull);
  });

  testWidgets('capture another retains the edited draft and screenshots',
      (tester) async {
    BugReportFormResult? result;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: ElevatedButton(
              onPressed: () async {
                result = await showModalBottomSheet<BugReportFormResult>(
                  context: context,
                  isScrollControlled: true,
                  builder: (_) => BugReportForm(
                    draft: const BugReportDraft(
                      title: 'Initial title',
                      description: 'Initial details',
                    ),
                    screenshots: [capture('/one', 1)],
                    currentRoute: '/one',
                  ),
                );
              },
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Initial title'),
      'Retained title',
    );
    await tester.tap(find.textContaining('Ajouter une autre capture'));
    await tester.pumpAndSettle();

    expect(result?.action, BugReportFormAction.captureMore);
    expect(result?.draft.title, 'Retained title');
    expect(result?.draft.description, 'Initial details');
    expect(result?.screenshots.single.page, '/one');
  });

  testWidgets('preview supports reordering and removal', (tester) async {
    BugReportFormResult? result;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: ElevatedButton(
              onPressed: () async {
                result = await showModalBottomSheet<BugReportFormResult>(
                  context: context,
                  isScrollControlled: true,
                  builder: (_) => BugReportForm(
                    draft: const BugReportDraft(),
                    screenshots: [
                      capture('/a', 1),
                      capture('/b', 2),
                      capture('/c', 3),
                    ],
                  ),
                );
              },
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Déplacer vers la droite').first);
    await tester.pump();
    await tester.tap(find.byTooltip('Retirer la capture').at(1));
    await tester.pump();
    await tester.tap(find.textContaining('Ajouter une autre capture'));
    await tester.pumpAndSettle();

    expect(result?.screenshots.map((item) => item.page), ['/b', '/c']);
  });

  testWidgets('five screenshots hide capture action and show the limit',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: BugReportForm(
            draft: const BugReportDraft(),
            screenshots: List.generate(
              maxBugReportScreenshots,
              (index) => capture('/$index', index),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Maximum de 5 captures atteint.'), findsOneWidget);
    expect(find.textContaining('Ajouter une autre capture'), findsNothing);
  });

  testWidgets('cancel returns an explicit cancelled result', (tester) async {
    BugReportFormResult? result;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: ElevatedButton(
              onPressed: () async {
                result = await showModalBottomSheet<BugReportFormResult>(
                  context: context,
                  builder: (_) => const BugReportForm(
                    draft: BugReportDraft(title: 'Draft'),
                    screenshots: [],
                  ),
                );
              },
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Annuler'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Annuler'));
    await tester.pumpAndSettle();

    expect(result?.action, BugReportFormAction.cancelled);
    expect(result?.draft.title, 'Draft');
  });
}

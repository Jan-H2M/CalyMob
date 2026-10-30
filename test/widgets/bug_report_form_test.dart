import 'dart:async';
import 'dart:convert';

import 'package:calymob/models/bug_report_screenshot.dart';
import 'package:calymob/providers/auth_provider.dart';
import 'package:calymob/providers/member_provider.dart';
import 'package:calymob/services/bug_report_service.dart';
import 'package:calymob/widgets/bug_report_widget.dart';
import 'package:firebase_auth/firebase_auth.dart' show User;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';

final _pixel = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk'
  'YAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
);

BugReportScreenshot capture(String page, int minute) => BugReportScreenshot(
      bytes: _pixel,
      page: page,
      capturedAt: DateTime.utc(2026, 10, 16, 12, minute),
    );

class _RouteProbe extends NavigatorObserver {
  Route<dynamic>? current;

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    current = route;
  }
}

class _User extends Mock implements User {
  @override
  String get uid => 'synthetic-reporter';

  @override
  String? get email => 'reporter@example.test';
}

class _Auth extends Mock implements AuthProvider {
  @override
  User? get currentUser => _User();
}

class _Member extends Mock implements MemberProvider {
  @override
  String get displayName => 'Synthetic Reporter';
}

class _PendingReportService extends Mock implements BugReportService {
  var completion = Completer<String>();
  final submissions = <List<BugReportScreenshot>>[];

  @override
  Future<String> submitBugReport({
    required String clubId,
    required String userId,
    required String userName,
    required String userEmail,
    required String title,
    String? description,
    required String priority,
    List<BugReportScreenshot> screenshots = const [],
    String? currentRoute,
  }) {
    submissions.add(screenshots);
    return completion.future;
  }
}

void main() {
  test('route label preserves an explicit observer route name', () {
    final named = MaterialPageRoute<void>(
      settings: const RouteSettings(name: '/details'),
      builder: (_) => const SizedBox(),
    );

    expect(bugReportRouteLabel(named), '/details');
    expect(bugReportRouteLabel(null), isNull);
  });

  testWidgets('unnamed routes use distinct visible screen titles',
      (tester) async {
    final probe = _RouteProbe();
    final navigatorKey = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      MaterialApp(
        navigatorKey: navigatorKey,
        navigatorObservers: [probe],
        home: Scaffold(
          appBar: AppBar(title: const Text('Événements')),
          body: const SizedBox(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final homeLabel = bugReportRouteLabel(probe.current);

    navigatorKey.currentState!.push<void>(
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          appBar: AppBar(title: const Text('Profil')),
          body: const SizedBox(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final profileLabel = bugReportRouteLabel(probe.current);

    expect(homeLabel, contains('Événements'));
    expect(profileLabel, contains('Profil'));
    expect(profileLabel, isNot(homeLabel));
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

  testWidgets('rapid send taps create only one report with ordered captures',
      (tester) async {
    final service = _PendingReportService();
    BugReportFormResult? result;
    await tester.pumpWidget(MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: _Auth()),
        ChangeNotifierProvider<MemberProvider>.value(value: _Member()),
      ],
      child: MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: ElevatedButton(
              onPressed: () async {
                result = await showModalBottomSheet<BugReportFormResult>(
                  context: context,
                  isScrollControlled: true,
                  builder: (_) => BugReportForm(
                    draft: const BugReportDraft(title: 'Synthetic issue'),
                    screenshots: [capture('/a', 1), capture('/b', 2)],
                    bugReportService: service,
                  ),
                );
              },
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Envoyer'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Envoyer'));
    // The old enabled callback can still receive another tap before a frame.
    await tester.tap(find.text('Envoyer'));
    expect(service.submissions, hasLength(1));
    expect(service.submissions.single.map((item) => item.page), ['/a', '/b']);
    service.completion.complete('synthetic-report');
    await tester.pumpAndSettle();
    expect(result?.action, BugReportFormAction.submitted);
    expect(tester.takeException(), isNull);
  });

  testWidgets('failed send preserves the draft and permits one retry',
      (tester) async {
    final service = _PendingReportService();
    await tester.pumpWidget(MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: _Auth()),
        ChangeNotifierProvider<MemberProvider>.value(value: _Member()),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: BugReportForm(
            draft: const BugReportDraft(title: 'Synthetic issue'),
            screenshots: [capture('/a', 1), capture('/b', 2)],
            bugReportService: service,
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Envoyer'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Envoyer'));
    service.completion.completeError(StateError('synthetic send failure'));
    await tester.pumpAndSettle();
    expect(
        find.widgetWithText(TextFormField, 'Synthetic issue'), findsOneWidget);
    expect(find.byType(Image), findsNWidgets(2));
    expect(find.text('Envoyer'), findsOneWidget);

    service.completion = Completer<String>();
    await tester.tap(find.text('Envoyer'));
    await tester.tap(find.text('Envoyer'));
    expect(service.submissions, hasLength(2));
    expect(service.submissions.last.map((item) => item.page), ['/a', '/b']);
    await tester.pumpWidget(const SizedBox.shrink());
    service.completion.complete('synthetic-report');
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
}

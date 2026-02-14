import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:calymob/providers/unread_count_provider.dart';

/// A standalone badge widget that mirrors the badge display logic
/// used in LandingScreen's _GlossyButton and OperationsListScreen.
/// This allows us to test the badge UI rendering in isolation.
class TestBadgeWidget extends StatelessWidget {
  final int count;

  const TestBadgeWidget({Key? key, required this.count}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: Colors.red,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        count > 99 ? '99+' : count.toString(),
        style: const TextStyle(
          color: Colors.white,
          fontSize: 12,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}

/// Widget that reads from UnreadCountProvider and displays badges
/// for each category, like the LandingScreen does.
class TestLandingBadges extends StatelessWidget {
  const TestLandingBadges({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final unreadProvider = context.watch<UnreadCountProvider>();
    return Column(
      children: [
        Row(
          key: const Key('events_badge'),
          children: [
            const Text('Événements'),
            TestBadgeWidget(count: unreadProvider.eventMessages),
          ],
        ),
        Row(
          key: const Key('comms_badge'),
          children: [
            const Text('Communication'),
            TestBadgeWidget(count: unreadProvider.announcements),
          ],
        ),
        Row(
          key: const Key('piscine_badge'),
          children: [
            const Text('Piscine'),
            TestBadgeWidget(
              count: unreadProvider.sessionMessages +
                  unreadProvider.teamMessages,
            ),
          ],
        ),
      ],
    );
  }
}

/// A mock UnreadCountProvider that lets us control values directly
class MockUnreadCountProvider extends ChangeNotifier
    implements UnreadCountProvider {
  int _total = 0;
  int _announcements = 0;
  int _eventMessages = 0;
  int _teamMessages = 0;
  int _sessionMessages = 0;
  int _medicalCertificates = 0;

  @override
  int get total => _total;
  @override
  int get announcements => _announcements;
  @override
  int get eventMessages => _eventMessages;
  @override
  int get teamMessages => _teamMessages;
  @override
  int get sessionMessages => _sessionMessages;
  @override
  int get medicalCertificates => _medicalCertificates;
  @override
  bool get isListening => false;

  void setCounts({
    int total = 0,
    int announcements = 0,
    int eventMessages = 0,
    int teamMessages = 0,
    int sessionMessages = 0,
    int medicalCertificates = 0,
  }) {
    _total = total;
    _announcements = announcements;
    _eventMessages = eventMessages;
    _teamMessages = teamMessages;
    _sessionMessages = sessionMessages;
    _medicalCertificates = medicalCertificates;
    notifyListeners();
  }

  @override
  void listen(String clubId, String userId) {}
  @override
  void stopListening() {}
  @override
  void clear() {
    setCounts();
  }

  @override
  Future<void> decrementCategory({
    required String clubId,
    required String userId,
    required String category,
    int amount = 1,
  }) async {}

  @override
  Future<void> resetCategory({
    required String clubId,
    required String userId,
    required String category,
  }) async {}
}

void main() {
  group('TestBadgeWidget', () {
    testWidgets('shows nothing when count is 0', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: TestBadgeWidget(count: 0)),
      );

      expect(find.byType(SizedBox), findsOneWidget);
      expect(find.text('0'), findsNothing);
    });

    testWidgets('shows nothing when count is negative', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: TestBadgeWidget(count: -1)),
      );

      expect(find.text('-1'), findsNothing);
    });

    testWidgets('shows exact count for 1-99', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: TestBadgeWidget(count: 5)),
      );

      expect(find.text('5'), findsOneWidget);
    });

    testWidgets('shows exact count at boundary 99', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: TestBadgeWidget(count: 99)),
      );

      expect(find.text('99'), findsOneWidget);
    });

    testWidgets('shows 99+ when count exceeds 99', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: TestBadgeWidget(count: 100)),
      );

      expect(find.text('99+'), findsOneWidget);
    });

    testWidgets('shows 99+ for very large count', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: TestBadgeWidget(count: 9999)),
      );

      expect(find.text('99+'), findsOneWidget);
    });

    testWidgets('displays with red background', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: TestBadgeWidget(count: 3)),
      );

      final container = tester.widget<Container>(find.byType(Container));
      final decoration = container.decoration as BoxDecoration;
      expect(decoration.color, Colors.red);
    });

    testWidgets('text is white and bold', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: TestBadgeWidget(count: 3)),
      );

      final text = tester.widget<Text>(find.text('3'));
      expect(text.style!.color, Colors.white);
      expect(text.style!.fontWeight, FontWeight.bold);
    });
  });

  group('TestLandingBadges with UnreadCountProvider', () {
    late MockUnreadCountProvider mockProvider;

    setUp(() {
      mockProvider = MockUnreadCountProvider();
    });

    Widget buildApp() {
      return MaterialApp(
        home: ChangeNotifierProvider<UnreadCountProvider>.value(
          value: mockProvider,
          child: const Scaffold(body: TestLandingBadges()),
        ),
      );
    }

    testWidgets('shows no badges when all counts are 0', (tester) async {
      await tester.pumpWidget(buildApp());

      // Only the labels should exist, no badge numbers
      expect(find.text('Événements'), findsOneWidget);
      expect(find.text('Communication'), findsOneWidget);
      expect(find.text('Piscine'), findsOneWidget);

      // No badge text should be visible
      expect(find.byType(TestBadgeWidget), findsNWidgets(3));
      // The SizedBox.shrink widgets indicate hidden badges
      expect(find.byType(SizedBox), findsWidgets);
    });

    testWidgets('shows event badge when eventMessages > 0', (tester) async {
      mockProvider.setCounts(total: 3, eventMessages: 3);
      await tester.pumpWidget(buildApp());

      expect(find.text('3'), findsOneWidget);
    });

    testWidgets('shows announcement badge', (tester) async {
      mockProvider.setCounts(total: 7, announcements: 7);
      await tester.pumpWidget(buildApp());

      expect(find.text('7'), findsOneWidget);
    });

    testWidgets('piscine badge combines session + team messages',
        (tester) async {
      mockProvider.setCounts(
        total: 8,
        sessionMessages: 5,
        teamMessages: 3,
      );
      await tester.pumpWidget(buildApp());

      // 5 + 3 = 8
      expect(find.text('8'), findsOneWidget);
    });

    testWidgets('updates badges when provider changes', (tester) async {
      await tester.pumpWidget(buildApp());

      // Initially no badges
      expect(find.text('5'), findsNothing);

      // Update provider
      mockProvider.setCounts(total: 5, eventMessages: 5);
      await tester.pump();

      // Badge should appear
      expect(find.text('5'), findsOneWidget);

      // Update again
      mockProvider.setCounts(total: 0, eventMessages: 0);
      await tester.pump();

      // Badge should disappear
      expect(find.text('5'), findsNothing);
    });

    testWidgets('shows 99+ for overflow in multiple categories',
        (tester) async {
      mockProvider.setCounts(
        total: 250,
        eventMessages: 150,
        announcements: 50,
        sessionMessages: 30,
        teamMessages: 20,
      );
      await tester.pumpWidget(buildApp());

      // Events: 150 → 99+
      // Announcements: 50
      // Piscine: 30+20=50
      expect(find.text('99+'), findsOneWidget); // events
      expect(find.text('50'), findsNWidgets(2)); // announcements + piscine
    });

    testWidgets('rapid count changes render correctly', (tester) async {
      await tester.pumpWidget(buildApp());

      for (int i = 0; i <= 10; i++) {
        mockProvider.setCounts(total: i, eventMessages: i);
        await tester.pump();
      }

      // Final state should show 10
      expect(find.text('10'), findsOneWidget);
    });
  });

  group('StreamBuilder Badge Pattern (Operations List)', () {
    /// Tests the StreamBuilder pattern used in OperationsListScreen
    /// for per-operation unread counts
    testWidgets('StreamBuilder shows badge from stream data', (tester) async {
      final controller = Stream<int>.fromIterable([0, 3, 5]).asBroadcastStream();

      await tester.pumpWidget(
        MaterialApp(
          home: StreamBuilder<int>(
            stream: controller,
            initialData: 0,
            builder: (context, snapshot) {
              final count = snapshot.data ?? 0;
              return TestBadgeWidget(count: count);
            },
          ),
        ),
      );

      await tester.pumpAndSettle();
      // Should show the last emitted value
      expect(find.text('5'), findsOneWidget);
    });

    testWidgets('StreamBuilder shows nothing while waiting', (tester) async {
      // Stream that never emits
      final controller = Stream<int>.empty();

      await tester.pumpWidget(
        MaterialApp(
          home: StreamBuilder<int>(
            stream: controller,
            builder: (context, snapshot) {
              final count = snapshot.data ?? 0;
              return TestBadgeWidget(count: count);
            },
          ),
        ),
      );

      // Should show nothing (count=0 → SizedBox.shrink)
      expect(find.byType(SizedBox), findsOneWidget);
    });
  });
}

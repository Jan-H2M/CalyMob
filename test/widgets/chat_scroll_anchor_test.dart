import 'package:calymob/utils/chat_scroll.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('anchors a distant unread divider in a lazy list',
      (tester) async {
    final controller = ScrollController();
    final dividerKey = GlobalKey();
    final registry = ChatAnchorRegistry();
    const unreadIndex = 150;
    const itemCount = 301;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ListView.builder(
            controller: controller,
            itemCount: itemCount,
            itemBuilder: (context, index) => ChatAnchorRow(
              index: index,
              registry: registry,
              child: SizedBox(
                key: index == unreadIndex ? dividerKey : null,
                height: 40 + ((index * 37) % 361),
                child:
                    Text(index == unreadIndex ? 'Nouveaux messages' : '$index'),
              ),
            ),
          ),
        ),
      ),
    );

    var done = false;
    anchorToIndex(
      controller: controller,
      targetKey: dividerKey,
      registry: registry,
      targetIndex: unreadIndex,
      itemCount: itemCount,
    ).then((_) => done = true);
    for (var i = 0; i < 40 && !done; i++) {
      await tester.pump(const Duration(milliseconds: 16));
    }
    expect(done, isTrue);

    expect(find.text('Nouveaux messages'), findsOneWidget);
    final rect = tester.getRect(find.text('Nouveaux messages'));
    final viewport = tester.getRect(find.byType(ListView));
    expect(rect.top, greaterThanOrEqualTo(viewport.top));
    expect(rect.bottom, lessThanOrEqualTo(viewport.bottom));
  });

  testWidgets(
      'uses the actual latest-message fallback for variable-height lazy rows',
      (tester) async {
    final controller = ScrollController();
    final dividerKey = GlobalKey();
    final registry = ChatAnchorRegistry();
    const itemCount = 300;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ListView.builder(
            controller: controller,
            itemCount: itemCount,
            itemBuilder: (context, index) => SizedBox(
              height: 40 + ((index * 37) % 361),
              child: Text('message $index'),
            ),
          ),
        ),
      ),
    );

    var done = false;
    anchorToIndex(
      controller: controller,
      targetKey: dividerKey,
      registry: registry,
      targetIndex: null,
      itemCount: itemCount,
    ).then((_) => done = true);
    for (var i = 0; i < 40 && !done; i++) {
      await tester.pump(const Duration(milliseconds: 16));
    }
    expect(done, isTrue);
    expect(controller.offset, controller.position.maxScrollExtent);
    expect(find.text('message ${itemCount - 1}'), findsOneWidget);
    final rect = tester.getRect(find.text('message ${itemCount - 1}'));
    final viewport = tester.getRect(find.byType(ListView));
    expect(rect.bottom, lessThanOrEqualTo(viewport.bottom));
  });

  testWidgets('an appended reply does not move an existing scroll offset',
      (tester) async {
    final controller = ScrollController();
    final messages = ValueNotifier<int>(100);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ValueListenableBuilder<int>(
            valueListenable: messages,
            builder: (context, count, _) => ListView.builder(
              controller: controller,
              itemCount: count,
              itemBuilder: (context, index) => SizedBox(
                height: 48,
                child: Text('message $index'),
              ),
            ),
          ),
        ),
      ),
    );
    controller.jumpTo(1200);
    await tester.pump();
    final before = controller.offset;

    messages.value = 101;
    await tester.pump();

    expect(controller.offset, before);
  });
}

import 'package:calymob/utils/chat_scroll.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('anchors a distant unread divider in a lazy list',
      (tester) async {
    final controller = ScrollController();
    final dividerKey = GlobalKey();
    const unreadIndex = 150;
    const itemCount = 301;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ListView.builder(
            controller: controller,
            itemCount: itemCount,
            itemBuilder: (context, index) => SizedBox(
              key: index == unreadIndex ? dividerKey : null,
              height: 48,
              child:
                  Text(index == unreadIndex ? 'Nouveaux messages' : '$index'),
            ),
          ),
        ),
      ),
    );

    final anchor = anchorToIndex(
      controller: controller,
      targetKey: dividerKey,
      targetIndex: unreadIndex,
      itemCount: itemCount,
    );
    await tester.pump();
    await tester.pump();
    await anchor;
    await tester.pump();

    expect(find.text('Nouveaux messages'), findsOneWidget);
    expect(
        tester.getTopLeft(find.text('Nouveaux messages')).dy, greaterThan(0));
  });

  testWidgets('uses the latest-message fallback when there is no unread item',
      (tester) async {
    final controller = ScrollController();
    final dividerKey = GlobalKey();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ListView.builder(
            controller: controller,
            itemCount: 100,
            itemBuilder: (context, index) => const SizedBox(height: 48),
          ),
        ),
      ),
    );

    await anchorToIndex(
      controller: controller,
      targetKey: dividerKey,
      targetIndex: null,
      itemCount: 100,
    );
    expect(controller.offset, controller.position.maxScrollExtent);
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

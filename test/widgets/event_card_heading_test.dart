import 'package:calymob/models/event_card_appearance.dart';
import 'package:calymob/widgets/event_card_decoration.dart';
import 'package:calymob/widgets/event_card_heading.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const title = '🎉 CALYFIESTA – SAVE THE DATE ! 🎉';
  for (final width in [180.0, 230.0, 320.0]) {
    for (final scale in [1.0, 1.6]) {
      testWidgets('full themed title at width $width and text scale $scale',
          (tester) async {
        await tester.pumpWidget(MaterialApp(
            home: MediaQuery(
          data: MediaQueryData(
              textScaler: TextScaler.linear(scale), disableAnimations: true),
          child: Scaffold(
              body: Align(
            alignment: Alignment.topLeft,
            child: SizedBox(
                width: width,
                child: const EventCardHeading(
                  title: title,
                  icon: Icons.directions_boat,
                  iconColor: Colors.blue,
                  appearance: EventCardAppearance(theme: 'disco'),
                )),
          )),
        )));
        await tester.pump();
        final text = tester.renderObject<RenderParagraph>(find.text(title));
        expect(text.didExceedMaxLines, isFalse);
        final titleRect = tester.getRect(find.text(title));
        final artRect = tester.getRect(find.byType(EventCardDecoration));
        expect(artRect.top, greaterThanOrEqualTo(titleRect.bottom));
        expect(artRect.right, lessThanOrEqualTo(width + .01));
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('plain cards retain the existing compact two-line heading',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
            body: SizedBox(
      width: 200,
      child: EventCardHeading(
          title: title, icon: Icons.pool, iconColor: Colors.blue),
    ))));
    expect(tester.widget<Text>(find.text(title)).maxLines, 2);
    expect(find.byType(EventCardDecoration), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

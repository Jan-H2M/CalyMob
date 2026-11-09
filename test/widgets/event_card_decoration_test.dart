import 'package:calymob/models/event_card_appearance.dart';
import 'package:calymob/widgets/event_card_decoration.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget fixture(EventCardAppearance appearance,
          {bool reduce = false, VoidCallback? onTap}) =>
      MaterialApp(
          home: MediaQuery(
              data: MediaQueryData(disableAnimations: reduce),
              child: Scaffold(
                  body: GestureDetector(
                      onTap: onTap,
                      behavior: HitTestBehavior.opaque,
                      child: EventCardDecoration(appearance: appearance)))));
  for (final theme in ['christmas', 'sinterklaas', 'disco']) {
    testWidgets('$theme renders bundled art and never intercepts taps',
        (tester) async {
      var taps = 0;
      await tester.pumpWidget(
          fixture(EventCardAppearance(theme: theme), onTap: () => taps++));
      await tester.pump(const Duration(milliseconds: 100));
      final image = tester.widget<Image>(find.byType(Image));
      expect((image.image as AssetImage).assetName,
          'assets/images/card_themes/$theme.png');
      await tester.tap(find.byType(EventCardDecoration));
      expect(taps, 1);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
  testWidgets(
      'reduced motion omits animated GIF and has no running decorative animation',
      (tester) async {
    await tester.pumpWidget(fixture(
        const EventCardAppearance(
            theme: 'custom',
            image: EventCardImage(
                url: 'https://synthetic.invalid/animated.gif',
                storagePath: 'synthetic',
                contentType: 'image/gif',
                name: 'image',
                size: 43)),
        reduce: true));
    expect(find.byType(Image), findsNothing);
    expect(find.byIcon(Icons.image_outlined), findsOneWidget);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}

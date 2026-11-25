import 'package:calymob/widgets/profile_tile.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Regression for the landing grid reported on an iPhone with enlarged text:
/// labels ran into each other ("ÉvénementsCommunicationParcours") and the
/// third column was pushed off-screen.
void main() {
  Widget grid({
    required double width,
    required double textScale,
    bool boutique = true,
  }) {
    return MaterialApp(
      home: MediaQuery(
        data: MediaQueryData(
          size: Size(width, 800),
          textScaler: TextScaler.linear(textScale),
        ),
        child: Scaffold(
          body: Center(
            child: SizedBox(
              width: width,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ProfileTileRow(
                      children: [
                        ProfileTile.large(
                            title: 'Événements',
                            icon: Icons.event,
                            onTap: () {}),
                        ProfileTile.large(
                            title: 'Communication',
                            icon: Icons.campaign,
                            onTap: () {}),
                        ProfileTile.large(
                            title: 'Parcours',
                            icon: Icons.route_outlined,
                            onTap: () {}),
                      ],
                    ),
                    ProfileTileRow(
                      children: [
                        ProfileTile.large(
                            title: 'Who is Who',
                            icon: Icons.people,
                            onTap: () {}),
                        if (boutique)
                          ProfileTile.large(
                              title: 'Boutique',
                              icon: Icons.shopping_bag_outlined,
                              onTap: () {}),
                        ProfileTile.large(
                            title: 'Mon Profil',
                            icon: Icons.person,
                            onTap: () {}),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  double centerX(WidgetTester tester, IconData icon) =>
      tester.getCenter(find.byIcon(icon)).dx;

  for (final width in <double>[320, 375, 393, 430]) {
    for (final scale in <double>[1.0, 1.35, 2.0, 3.1]) {
      testWidgets('grid fits ${width}pt wide at text scale $scale',
          (tester) async {
        tester.view.physicalSize = Size(width, 800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);

        await tester.pumpWidget(grid(width: width, textScale: scale));

        // No RenderFlex overflow.
        expect(tester.takeException(), isNull);

        // Every label stays inside the screen and labels never touch.
        final labels = [
          'Événements',
          'Communication',
          'Parcours',
        ].map((t) => tester.getRect(find.text(t))).toList();
        expect(labels.first.left, greaterThanOrEqualTo(0));
        expect(labels.last.right, lessThanOrEqualTo(width));
        expect(labels[0].right, lessThanOrEqualTo(labels[1].left));
        expect(labels[1].right, lessThanOrEqualTo(labels[2].left));

        // Circles of row 2 sit exactly under those of row 1.
        expect(centerX(tester, Icons.people),
            moreOrLessEquals(centerX(tester, Icons.event), epsilon: 0.5));
        expect(centerX(tester, Icons.shopping_bag_outlined),
            moreOrLessEquals(centerX(tester, Icons.campaign), epsilon: 0.5));
        expect(
            centerX(tester, Icons.person),
            moreOrLessEquals(centerX(tester, Icons.route_outlined),
                epsilon: 0.5));
      });
    }
  }

  testWidgets('a row without Boutique stays centred', (tester) async {
    tester.view.physicalSize = const Size(393, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(grid(width: 393, textScale: 1.0, boutique: false));

    expect(tester.takeException(), isNull);
    final left = centerX(tester, Icons.people);
    final right = centerX(tester, Icons.person);
    expect((left + right) / 2, moreOrLessEquals(393 / 2, epsilon: 0.5));
  });
}

import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:calymob/widgets/boutique/boutique_product_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('resolves the first supported product image URL', () {
    expect(
      BoutiqueProductImage.firstUrl(const [
        '',
        'assets/not-a-network-image.png',
        '/images/boutique/polo.png',
      ]),
      'https://caly.club/images/boutique/polo.png',
    );
    expect(
      BoutiqueProductImage.resolveUrl(' https://cdn.example.com/polo.png '),
      'https://cdn.example.com/polo.png',
    );
    expect(BoutiqueProductImage.resolveUrl('assets/polo.png'), isNull);
  });

  testWidgets('uses the resolved URL as the shared persistent cache key', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: SizedBox(
          width: 100,
          height: 100,
          child: BoutiqueProductImage(imageUrl: '/images/boutique/polo.png'),
        ),
      ),
    );

    final image = tester.widget<CachedNetworkImage>(
      find.byType(CachedNetworkImage),
    );
    expect(image.imageUrl, 'https://caly.club/images/boutique/polo.png');
    expect(image.cacheKey, image.imageUrl);
    expect(image.fit, BoxFit.contain);
  });

  testWidgets('shows a stable fallback for a missing image URL', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(home: BoutiqueProductImage(imageUrl: null)),
    );

    expect(find.byType(CachedNetworkImage), findsNothing);
    expect(find.byIcon(Icons.shopping_bag_outlined), findsOneWidget);
  });

  test('all boutique product-photo surfaces use the cache widget', () {
    const surfaces = <String>[
      'lib/screens/boutique/boutique_screen.dart',
      'lib/screens/boutique/boutique_product_detail_screen.dart',
      'lib/screens/boutique/boutique_cart_screen.dart',
    ];

    for (final path in surfaces) {
      final source = File(path).readAsStringSync();
      expect(source, contains('BoutiqueProductImage('), reason: path);
      expect(source, isNot(contains('Image.network(')), reason: path);
    }
  });
}

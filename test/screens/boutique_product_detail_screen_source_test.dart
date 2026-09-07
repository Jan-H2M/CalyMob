import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'Boutique add-to-cart uses overlay feedback without lingering SnackBar',
    () {
      final source = File(
        'lib/screens/boutique/boutique_product_detail_screen.dart',
      ).readAsStringSync();
      final addToCartBody = RegExp(
        r'Future<void> _addToCart[\s\S]*?\n  }\n\n  void _showAddedToCartToast',
      ).firstMatch(source)?.group(0);

      expect(addToCartBody, isNotNull);
      expect(addToCartBody, isNot(contains('showSnackBar')));
      expect(source, isNot(contains('Article ajouté au panier.')));
    },
  );
}

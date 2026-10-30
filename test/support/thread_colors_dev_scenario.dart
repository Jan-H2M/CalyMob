// Fictional memory-only basket; never constructs FirebaseAuth or SharedPreferences.
import 'package:calymob/models/boutique/boutique_product.dart';
import 'package:calymob/providers/boutique_cart_provider.dart';
import 'package:calymob/screens/boutique/boutique_product_detail_screen.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

const fictionalColorProduct = BoutiqueProduct(
  id: 'dev-thread-polo',
  name: 'Polo FICTIF',
  description: 'MOB-052 — aucune commande réelle',
  category: BoutiqueProductCategory.vetements,
  supplierId: 'dev-supplier',
  images: [],
  pricing: BoutiquePrice(salePrice: 25, currency: 'EUR'),
  inventoryMode: BoutiqueInventoryMode.preorder,
  variants: [
    BoutiqueVariant(
        id: 'dev-blue-m',
        label: 'M · Bleu marine',
        attributes: {'size': 'M', 'color': 'Bleu marine'},
        allowBackorder: true)
  ],
  deliveryModes: [BoutiqueDeliveryMode.poolPickup],
  deliverySurcharges: {},
  visibility: 'published',
  personalization: BoutiquePersonalizationConfig(
    enabled: true,
    baseType: 'polo',
    technique: BoutiqueCustomizationTechnique.embroidery,
    productionConstraints: BoutiqueProductionConstraints(
        minimumOrderQuantity: 1, setupCost: 0, groupOrderOnly: false),
    clubLogo:
        BoutiquePersonalizationOption(enabled: false, zones: [], surcharge: 0),
    name: BoutiqueNameOption(
        enabled: true,
        zones: ['back'],
        surcharge: 0,
        pricingMode: BoutiqueNamePricingMode.fixed,
        pricePerCharacter: 0,
        fixedPrice: 4,
        threadColors: BoutiqueThreadColors(
            fixedColor: 'Rouge', choices: ['Rouge', 'Bleu', 'Blanc'])),
    certification: BoutiqueCertificationOption(
        enabled: true,
        zones: ['sleeve_left'],
        surcharge: 2,
        allowedValues: ['P2'],
        threadColors: BoutiqueThreadColors(
            fixedColor: 'Blanc', choices: ['Blanc', 'Or'])),
  ),
);

class FictionalThreadBasket extends ChangeNotifier
    implements BoutiqueCartProvider {
  final List<BoutiqueCartItem> _saved = [];
  @override
  List<BoutiqueCartItem> get items => List.unmodifiable(_saved);
  @override
  Future<void> addItem(BoutiqueCartItem item) async {
    _saved.add(item);
    notifyListeners();
  }

  @override
  Future<void> replaceItem(String key, BoutiqueCartItem replacement) async {
    final index = _saved.indexWhere((item) => item.key == key);
    if (index < 0) throw StateError('Unknown fictional cart line');
    _saved[index] = replacement;
    notifyListeners();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnsupportedError('Fictional basket: unsupported operation');
}

class FictionalThreadColors extends StatefulWidget {
  const FictionalThreadColors({super.key});
  @override
  State<FictionalThreadColors> createState() => _FictionalThreadColorsState();
}

class _FictionalThreadColorsState extends State<FictionalThreadColors> {
  final cart = FictionalThreadBasket();
  @override
  void dispose() {
    cart.dispose();
    super.dispose();
  }

  void open([BoutiqueCartItem? editingItem]) {
    Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => ChangeNotifierProvider<BoutiqueCartProvider>.value(
            value: cart,
            child: BoutiqueProductDetailScreen(
                product: fictionalColorProduct, editingItem: editingItem))));
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
      animation: cart,
      builder: (context, _) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text('MOB-052 · Couleurs FICTIVES'),
              const Text(
                  'Article bleu marine ; fil Rouge / Bleu / Blanc pour le nom. Prix du nom : 4 € quelle que soit la couleur.'),
              FilledButton(
                  onPressed: () => open(),
                  child: const Text('Personnaliser le polo FICTIF')),
              for (final item in cart.items) ...[
                Text(
                    boutiquePersonalizationLines(item.personalization)
                        .join('\n'),
                    key: const Key('dev-thread-saved')),
                Text('Total FICTIF : ${item.lineTotal.toStringAsFixed(2)} €'),
                OutlinedButton(
                    onPressed: () => open(item),
                    child: const Text('Modifier la ligne FICTIVE')),
              ],
            ],
          ));
}

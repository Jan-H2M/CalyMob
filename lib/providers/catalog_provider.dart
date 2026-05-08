import 'package:flutter/foundation.dart';

import '../models/boutique_product.dart';
import '../services/boutique_catalog_service.dart';

/// Provider voor de boutique product catalogus.
///
/// Luistert naar real-time updates van gepubliceerde producten.
/// Biedt filtering op categorie en laad-/error-states.
class CatalogProvider extends ChangeNotifier {
  final BoutiqueCatalogService? _service;

  CatalogProvider({BoutiqueCatalogService? service})
      : _service = service;

  List<BoutiqueProduct> _allProducts = [];
  BoutiqueProductCategory? _categoryFilter;
  bool _isLoading = false;
  String? _error;
  Stream<List<BoutiqueProduct>>? _subscription;

  // ── Getters ──

  /// Alle producten (of gefilterd op categorie).
  List<BoutiqueProduct> get products {
    if (_categoryFilter == null) return _allProducts;
    return _allProducts
        .where((p) => p.category == _categoryFilter)
        .toList();
  }

  List<BoutiqueProduct> get allProducts => _allProducts;
  BoutiqueProductCategory? get categoryFilter => _categoryFilter;
  bool get isLoading => _isLoading;
  String? get error => _error;

  /// Unieke categorieën die in de catalogus voorkomen.
  List<BoutiqueProductCategory> get availableCategories {
    final cats = _allProducts.map((p) => p.category).toSet().toList();
    cats.sort((a, b) => a.label.compareTo(b.label));
    return cats;
  }

  // ── Filter ──

  void setCategoryFilter(BoutiqueProductCategory? category) {
    _categoryFilter = category;
    notifyListeners();
  }

  void clearFilter() {
    _categoryFilter = null;
    notifyListeners();
  }

  // ── Lifecycle ──

  /// Start met luisteren naar de catalogus voor een club.
  void listenToCatalog({required String clubId}) {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final service = _service ?? BoutiqueCatalogService();
      _subscription = service.listenToPublishedProducts(clubId: clubId);

      _subscription!.listen(
        (products) {
          _allProducts = products;
          _isLoading = false;
          _error = null;
          notifyListeners();
        },
        onError: (e) {
          debugPrint('❌ CatalogProvider stream error: $e');
          _error = 'Erreur lors du chargement du catalogue';
          _isLoading = false;
          notifyListeners();
        },
      );
    } catch (e) {
      debugPrint('❌ CatalogProvider init error: $e');
      _error = 'Erreur lors du chargement du catalogue';
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Vernieuw de catalogus (annuleert oude stream, start nieuwe).
  void refresh({required String clubId}) {
    _subscription = null;
    listenToCatalog(clubId: clubId);
  }

  /// Zoek een product op ID in de lokale lijst.
  BoutiqueProduct? getProductById(String productId) {
    try {
      return _allProducts.firstWhere((p) => p.id == productId);
    } catch (_) {
      return null;
    }
  }

  @override
  void dispose() {
    _subscription = null;
    super.dispose();
  }
}

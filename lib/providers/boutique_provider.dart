import 'package:flutter/foundation.dart';
import '../services/boutique_service.dart';
import '../models/boutique_order.dart' show BoutiqueOrder, BoutiqueBankSettings;

/// Provider voor het beheren van boutique bestellingen
///
/// Luistert naar real-time updates van de bestellingen van een lid.
/// Biedt loading state, error handling en filter opties.
class BoutiqueProvider extends ChangeNotifier {
  final BoutiqueService? _service;

  BoutiqueProvider({BoutiqueService? service})
      : _service = service;

  List<BoutiqueOrder> _orders = [];
  bool _isLoading = false;
  String? _error;
  Stream<List<BoutiqueOrder>>? _subscription;

  // Getters
  List<BoutiqueOrder> get orders => _orders;
  bool get isLoading => _isLoading;
  String? get error => _error;

  /// Actieve bestellingen (niet afgerond, niet geannuleerd)
  List<BoutiqueOrder> get activeOrders =>
      _orders.where((o) => o.status.isActive).toList();

  /// Afgeronde bestellingen (delivered of cancelled/refunded)
  List<BoutiqueOrder> get historyOrders =>
      _orders.where((o) => !o.status.isActive).toList();

  /// Start met luisteren naar bestellingen voor een gebruiker
  void listenToOrders({
    required String clubId,
    required String userId,
  }) {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final service = _service ?? BoutiqueService();
      _subscription = service.streamOrdersForUser(userId);

      _subscription!.listen(
        (orders) {
          _orders = orders;
          _isLoading = false;
          _error = null;
          notifyListeners();
        },
        onError: (e) {
          debugPrint('❌ BoutiqueProvider stream error: $e');
          _error = 'Erreur lors du chargement des commandes';
          _isLoading = false;
          notifyListeners();
        },
      );
    } catch (e) {
      debugPrint('❌ BoutiqueProvider init error: $e');
      _error = 'Erreur lors du chargement des commandes';
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Vernieuw de bestellingen (annuleert oude stream, start nieuwe)
  void refresh({
    required String clubId,
    required String userId,
  }) {
    _subscription = null;
    listenToOrders(clubId: clubId, userId: userId);
  }

  /// Haal een specifieke bestelling op uit de lokale lijst
  BoutiqueOrder? getOrderById(String orderId) {
    try {
      return _orders.firstWhere((o) => o.id == orderId);
    } catch (_) {
      return null;
    }
  }

  /// Annuleer een bestelling
  Future<bool> cancelOrder({
    required String clubId,
    required String orderId,
  }) async {
    try {
      final service = _service ?? BoutiqueService();
      await service.cancelOrder(clubId: clubId, orderId: orderId);
      return true;
    } catch (e) {
      _error = 'Impossible d\'annuler la commande';
      notifyListeners();
      return false;
    }
  }

  /// Haal bank settings op voor EPC QR code
  Future<BoutiqueBankSettings?> getBankSettings(String clubId) async {
    final service = _service ?? BoutiqueService();
    return service.getBankSettings(clubId);
  }

  @override
  void dispose() {
    _subscription = null; // Stream wordt automatisch opgeruimd door Firestore
    super.dispose();
  }
}

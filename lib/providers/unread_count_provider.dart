import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Provider qui écoute les compteurs de messages non lus depuis Firestore
/// Le champ unread_counts sur le document member est mis à jour par les Cloud Functions
class UnreadCountProvider extends ChangeNotifier {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  StreamSubscription? _subscription;

  Map<String, dynamic> _counts = {};
  bool _isListening = false;

  // === Getters pour les compteurs ===

  /// Total de tous les éléments non lus (utilisé pour le badge app icon)
  int get total => (_counts['total'] as num?)?.toInt() ?? 0;

  /// Annonces non lues
  int get announcements => (_counts['announcements'] as num?)?.toInt() ?? 0;

  /// Messages d'événements non lus
  int get eventMessages => (_counts['event_messages'] as num?)?.toInt() ?? 0;

  /// Messages d'équipe non lus
  int get teamMessages => (_counts['team_messages'] as num?)?.toInt() ?? 0;

  /// Messages de sessions piscine non lus
  int get sessionMessages => (_counts['session_messages'] as num?)?.toInt() ?? 0;

  /// Certificats médicaux avec mise à jour de statut
  int get medicalCertificates => (_counts['medical_certificates'] as num?)?.toInt() ?? 0;

  /// Vérifier si l'écoute est active
  bool get isListening => _isListening;

  /// Démarrer l'écoute des compteurs pour un utilisateur
  void listen(String clubId, String userId) {
    // Éviter les doublons
    if (_isListening) {
      debugPrint('ℹ️ UnreadCountProvider: déjà en écoute');
      return;
    }

    debugPrint('🔔 UnreadCountProvider: démarrage écoute pour $userId');

    _subscription = _firestore
        .collection('clubs/$clubId/members')
        .doc(userId)
        .snapshots()
        .listen(
      (doc) {
        if (doc.exists && doc.data() != null) {
          final data = doc.data()!;
          final newCounts = data['unread_counts'] as Map<String, dynamic>? ?? {};

          // Seulement notifier si les compteurs ont changé
          if (!_mapsAreEqual(_counts, newCounts)) {
            _counts = Map<String, dynamic>.from(newCounts);
            debugPrint('📊 UnreadCountProvider: total=$total, ann=$announcements, evt=$eventMessages, team=$teamMessages');
            notifyListeners();
          }
        }
      },
      onError: (e) {
        debugPrint('❌ UnreadCountProvider erreur: $e');
      },
    );

    _isListening = true;
  }

  /// Arrêter l'écoute
  void stopListening() {
    _subscription?.cancel();
    _subscription = null;
    _isListening = false;
    debugPrint('🔕 UnreadCountProvider: écoute arrêtée');
  }

  /// Remettre à zéro (utilisé lors du logout)
  void clear() {
    stopListening();
    _counts = {};
    notifyListeners();
  }

  /// Décrémenter un compteur spécifique (appelé quand l'utilisateur lit des messages)
  Future<void> decrementCategory({
    required String clubId,
    required String userId,
    required String category,
    int amount = 1,
  }) async {
    try {
      // Assurer que le montant ne rend pas le compteur négatif
      final currentValue = (_counts[category] as num?)?.toInt() ?? 0;
      final actualDecrement = amount > currentValue ? currentValue : amount;

      if (actualDecrement <= 0) return;

      await _firestore
          .collection('clubs/$clubId/members')
          .doc(userId)
          .update({
        'unread_counts.$category': FieldValue.increment(-actualDecrement),
        'unread_counts.total': FieldValue.increment(-actualDecrement),
        'unread_counts.last_updated': FieldValue.serverTimestamp(),
      });

      debugPrint('📉 UnreadCountProvider: $category -$actualDecrement');
    } catch (e) {
      debugPrint('❌ UnreadCountProvider decrement erreur: $e');
    }
  }

  /// Remettre à zéro une catégorie entière (ex: quand on ouvre un chat et lit tout)
  Future<void> resetCategory({
    required String clubId,
    required String userId,
    required String category,
  }) async {
    try {
      final currentValue = (_counts[category] as num?)?.toInt() ?? 0;
      if (currentValue <= 0) return;

      await _firestore
          .collection('clubs/$clubId/members')
          .doc(userId)
          .update({
        'unread_counts.$category': 0,
        'unread_counts.total': FieldValue.increment(-currentValue),
        'unread_counts.last_updated': FieldValue.serverTimestamp(),
      });

      debugPrint('📉 UnreadCountProvider: $category reset (was $currentValue)');
    } catch (e) {
      debugPrint('❌ UnreadCountProvider reset erreur: $e');
    }
  }

  /// Comparer deux maps pour éviter les notifications inutiles
  bool _mapsAreEqual(Map<String, dynamic> a, Map<String, dynamic> b) {
    if (a.length != b.length) return false;
    for (final key in a.keys) {
      if (a[key] != b[key]) return false;
    }
    return true;
  }

  @override
  void dispose() {
    stopListening();
    super.dispose();
  }
}

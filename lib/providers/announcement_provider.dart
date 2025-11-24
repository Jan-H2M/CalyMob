import 'package:flutter/foundation.dart';
import '../models/announcement.dart';
import '../services/announcement_service.dart';

/// Provider pour la gestion des annonces
class AnnouncementProvider with ChangeNotifier {
  final AnnouncementService _announcementService = AnnouncementService();

  List<Announcement> _announcements = [];
  bool _isLoading = false;
  String? _error;

  List<Announcement> get announcements => _announcements;
  bool get isLoading => _isLoading;
  String? get error => _error;

  /// Charger les annonces pour un club
  Future<void> loadAnnouncements(String clubId) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      _announcements = await _announcementService.getAnnouncements(clubId);
      _error = null;
    } catch (e) {
      _error = e.toString();
      debugPrint('❌ Erreur chargement annonces: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Écouter les annonces en temps réel
  Stream<List<Announcement>> watchAnnouncements(String clubId) {
    return _announcementService.getAnnouncementsStream(clubId);
  }

  /// Créer une nouvelle annonce
  Future<void> createAnnouncement({
    required String clubId,
    required String senderId,
    required String senderName,
    required String title,
    required String message,
    required AnnouncementType type,
  }) async {
    try {
      await _announcementService.createAnnouncement(
        clubId: clubId,
        senderId: senderId,
        senderName: senderName,
        title: title,
        message: message,
        type: type,
      );

      // Recharger les annonces
      await loadAnnouncements(clubId);
    } catch (e) {
      _error = e.toString();
      debugPrint('❌ Erreur création annonce: $e');
      rethrow;
    }
  }

  /// Supprimer une annonce
  Future<void> deleteAnnouncement(String clubId, String announcementId) async {
    try {
      await _announcementService.deleteAnnouncement(clubId, announcementId);

      // Retirer de la liste locale
      _announcements.removeWhere((a) => a.id == announcementId);
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      debugPrint('❌ Erreur suppression annonce: $e');
      rethrow;
    }
  }

  /// Mettre à jour une annonce
  Future<void> updateAnnouncement({
    required String clubId,
    required String announcementId,
    String? title,
    String? message,
    AnnouncementType? type,
  }) async {
    try {
      await _announcementService.updateAnnouncement(
        clubId: clubId,
        announcementId: announcementId,
        title: title,
        message: message,
        type: type,
      );

      // Recharger les annonces
      await loadAnnouncements(clubId);
    } catch (e) {
      _error = e.toString();
      debugPrint('❌ Erreur mise à jour annonce: $e');
      rethrow;
    }
  }

  /// Réinitialiser l'erreur
  void clearError() {
    _error = null;
    notifyListeners();
  }
}

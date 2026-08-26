import 'package:shared_preferences/shared_preferences.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../config/firebase_config.dart';
import '../models/emergency_info.dart';

/// Service qui gère le "nudge" pour inviter l'utilisateur à ajouter
/// une photo de profil et/ou un contact d'urgence.
///
/// Comportement:
/// - Si le profil est incomplet → proposer au démarrage
/// - Si l'utilisateur clique "Plus tard" → ne plus montrer pendant 3 jours
/// - Une absence de contact n'est jamais rappelée après un opt-out explicite
class AvatarNudgeService {
  static const Duration snoozeDuration = Duration(days: 3);
  static const String _prefKeyPrefix = 'avatar_nudge_last_shown_';

  static bool needsEmergencyContact(EmergencyInfo? emergency) {
    if (emergency == null) return true;
    if (!emergency.shareWithStaff) return false;
    return emergency.contacts.isEmpty;
  }

  /// Retourne `true` si le dialog doit s'afficher.
  /// - [hasPhoto] : true si le membre a déjà une photo_url
  /// - [userId]   : uid Firebase utilisé comme clé de préférence
  static Future<bool> shouldShow({
    required String userId,
    required bool hasVisiblePhoto,
    bool needsEmergencyContact = false,
    DateTime? serverSnoozedUntil,
    DateTime? now,
  }) async {
    if (hasVisiblePhoto && !needsEmergencyContact) return false;
    if (userId.isEmpty) return false;
    final currentTime = now ?? DateTime.now();
    if (serverSnoozedUntil != null &&
        serverSnoozedUntil.isAfter(currentTime)) {
      return false;
    }

    final prefs = await SharedPreferences.getInstance();
    final lastShownMs = prefs.getInt('$_prefKeyPrefix$userId');

    if (lastShownMs == null) {
      // Jamais encore affiché pour ce user
      return true;
    }

    final lastShown = DateTime.fromMillisecondsSinceEpoch(lastShownMs);
    final elapsed = currentTime.difference(lastShown);
    return elapsed >= snoozeDuration;
  }

  /// À appeler quand l'utilisateur ferme/reporte le dialog.
  /// Enregistre l'horodatage pour appliquer le snooze de 3 jours.
  static Future<void> markShown(
    String userId, {
    FirebaseFirestore? firestore,
  }) async {
    if (userId.isEmpty) return;
    final now = DateTime.now();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(
      '$_prefKeyPrefix$userId',
      now.millisecondsSinceEpoch,
    );
    try {
      await (firestore ?? FirebaseFirestore.instance)
          .collection('clubs')
          .doc(FirebaseConfig.defaultClubId)
          .collection('members')
          .doc(userId)
          .update({
        'avatar_nudge_snoozed_until':
            Timestamp.fromDate(now.add(snoozeDuration)),
        'updated_at': FieldValue.serverTimestamp(),
      });
    } catch (_) {
      // Best effort; do not log member data. Local snooze remains active.
    }
  }

  /// À appeler si on veut réinitialiser le compteur (ex: debug).
  static Future<void> reset(String userId) async {
    if (userId.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('$_prefKeyPrefix$userId');
  }
}

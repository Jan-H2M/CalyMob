import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'local_read_tracker.dart';

/// Service die ongelezen tellingen berekent via lokale timestamps
/// + Firestore count() queries. Geen read_by arrays meer.
///
/// Logica: als lastRead == null (nooit geopend), gebruiken we een fallback.
/// Bij verse installatie: baseline = NOW (alles is "gelezen").
/// Bij bestaande installatie: baseline = epoch 2024-01-01.
class UnreadCountService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final LocalReadTracker _tracker = LocalReadTracker();

  /// Standaard epoch voor bestaande installaties.
  static final DateTime _defaultEpoch = DateTime(2024, 1, 1);

  /// Fallback datum: als er een installBaseline is (verse install),
  /// gebruik die. Anders de standaard epoch.
  DateTime get _epoch => _tracker.installBaseline ?? _defaultEpoch;

  // ============================================================
  // ANNOUNCEMENTS
  // ============================================================

  Future<int> countUnreadAnnouncements(String clubId) async {
    // Als null (nooit geopend): tel alles sinds epoch als ongelezen
    final lastRead = _tracker.getLastRead('announcements') ?? _epoch;

    try {
      final query = _firestore
          .collection('clubs/$clubId/announcements')
          .where('created_at', isGreaterThan: Timestamp.fromDate(lastRead));

      final snapshot = await query.count().get();
      return snapshot.count ?? 0;
    } catch (e) {
      debugPrint('❌ countUnreadAnnouncements error: $e');
      return 0;
    }
  }

  // ============================================================
  // EVENT MESSAGES — over alle open operaties
  // ============================================================

  Future<int> countUnreadEventMessages(String clubId) async {
    try {
      // Haal open evenementen op
      final opsSnapshot = await _firestore
          .collection('clubs/$clubId/operations')
          .where('type', isEqualTo: 'evenement')
          .where('statut', isEqualTo: 'ouvert')
          .get();

      int total = 0;
      for (final opDoc in opsSnapshot.docs) {
        // Als null (nooit geopend): tel alles sinds epoch als ongelezen
        final lastRead =
            _tracker.getLastRead('operation_${opDoc.id}') ?? _epoch;

        final query = _firestore
            .collection('clubs/$clubId/operations/${opDoc.id}/messages')
            .where('created_at', isGreaterThan: Timestamp.fromDate(lastRead));

        final snapshot = await query.count().get();
        total += snapshot.count ?? 0;
      }
      return total;
    } catch (e) {
      debugPrint('❌ countUnreadEventMessages error: $e');
      return 0;
    }
  }

  // ============================================================
  // EVENT MESSAGES — per individuele operatie
  // ============================================================

  /// Tel ongelezen berichten voor EEN specifieke operatie.
  /// Gebruikt door de operations list voor individuele badges.
  Future<int> countUnreadForOperation(String clubId, String operationId) async {
    try {
      final lastRead =
          _tracker.getLastRead('operation_$operationId') ?? _epoch;

      final query = _firestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .where('created_at', isGreaterThan: Timestamp.fromDate(lastRead));

      final snapshot = await query.count().get();
      return snapshot.count ?? 0;
    } catch (e) {
      debugPrint('❌ countUnreadForOperation error: $e');
      return 0;
    }
  }

  // ============================================================
  // TEAM MESSAGES — per channel
  // ============================================================

  Future<int> countUnreadTeamMessages(
      String clubId, List<String> roles) async {
    final normalizedRoles = roles.map((r) => r.toLowerCase()).toList();
    final channelIds = <String>[];

    if (normalizedRoles.contains('accueil')) {
      channelIds.add('equipe_accueil');
    }
    if (normalizedRoles.contains('encadrant') ||
        normalizedRoles.contains('encadrants')) {
      channelIds.add('equipe_encadrants');
    }
    if (normalizedRoles.contains('gonflage')) {
      channelIds.add('equipe_gonflage');
    }

    if (channelIds.isEmpty) return 0;

    try {
      int total = 0;
      for (final channelId in channelIds) {
        // Als null (nooit geopend): tel alles sinds epoch als ongelezen
        final lastRead = _tracker.getLastRead('team_$channelId') ?? _epoch;

        final query = _firestore
            .collection('clubs/$clubId/team_channels/$channelId/messages')
            .where('created_at', isGreaterThan: Timestamp.fromDate(lastRead));

        final snapshot = await query.count().get();
        total += snapshot.count ?? 0;
      }
      return total;
    } catch (e) {
      debugPrint('❌ countUnreadTeamMessages error: $e');
      return 0;
    }
  }

  // ============================================================
  // SESSION MESSAGES — per actieve sessie
  // ============================================================

  Future<int> countUnreadSessionMessages(
      String clubId, List<String> roles) async {
    final normalizedRoles = roles.map((r) => r.toLowerCase()).toList();
    final hasAccueil = normalizedRoles.contains('accueil');
    final hasEncadrant = normalizedRoles.contains('encadrant') ||
        normalizedRoles.contains('encadrants');

    if (!hasAccueil && !hasEncadrant) return 0;

    try {
      // Haal gepubliceerde sessies op
      final sessionsSnapshot = await _firestore
          .collection('clubs/$clubId/piscine_sessions')
          .where('statut', isEqualTo: 'publie')
          .get();

      int total = 0;
      for (final sessionDoc in sessionsSnapshot.docs) {
        // Voor elke sessie: tel messages per group die de user kan zien
        final groupTypes = <String>[];
        if (hasAccueil) groupTypes.add('accueil');
        if (hasEncadrant) {
          groupTypes.add('encadrants');
          groupTypes.add('niveau');
        }

        for (final groupType in groupTypes) {
          final key = 'session_${sessionDoc.id}_$groupType';
          // Als null (nooit geopend): tel alles sinds epoch als ongelezen
          final lastRead = _tracker.getLastRead(key) ?? _epoch;

          final query = _firestore
              .collection(
                  'clubs/$clubId/piscine_sessions/${sessionDoc.id}/messages')
              .where('group_type', isEqualTo: groupType)
              .where('created_at',
                  isGreaterThan: Timestamp.fromDate(lastRead));

          final snapshot = await query.count().get();
          total += snapshot.count ?? 0;
        }
      }
      return total;
    } catch (e) {
      debugPrint('❌ countUnreadSessionMessages error: $e');
      return 0;
    }
  }

  // ============================================================
  // ALLES SAMEN — refresh alle counts
  // ============================================================

  /// Bereken alle ongelezen counts in één keer.
  /// Retourneert een map met categorie → count.
  Future<Map<String, int>> refreshAllCounts(
      String clubId, List<String> roles) async {
    final results = await Future.wait([
      countUnreadAnnouncements(clubId),
      countUnreadEventMessages(clubId),
      countUnreadTeamMessages(clubId, roles),
      countUnreadSessionMessages(clubId, roles),
    ]);

    return {
      'announcements': results[0],
      'event_messages': results[1],
      'team_messages': results[2],
      'session_messages': results[3],
    };
  }
}

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'local_read_tracker.dart';
import '../utils/club_role_utils.dart';

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

  /// Timeout voor individuele Firestore queries (voorkomt ANR)
  static const Duration _queryTimeout = Duration(seconds: 8);

  /// Fallback datum: als er een installBaseline is (verse install),
  /// gebruik die. Anders de standaard epoch.
  DateTime get _epoch => _tracker.installBaseline ?? _defaultEpoch;

  // ============================================================
  // ANNOUNCEMENTS
  // ============================================================

  Future<int> countUnreadAnnouncements(String clubId) async {
    // Als null (nooit geopend): tel alles sinds epoch als ongelezen
    final lastRead = _tracker.getLastRead('announcements') ?? _epoch;
    final ts = Timestamp.fromDate(lastRead);

    try {
      // Twee queries: nieuwe aankondigingen + aankondigingen met nieuwe replies
      // We halen doc IDs op (geen data) en dedupliceren
      final results = await Future.wait([
        // 1. Nieuwe aankondigingen (created_at > lastRead)
        _firestore
            .collection('clubs/$clubId/announcements')
            .where('created_at', isGreaterThan: ts)
            .get()
            .timeout(_queryTimeout),
        // 2. Aankondigingen met nieuwe replies (last_reply_at > lastRead)
        _firestore
            .collection('clubs/$clubId/announcements')
            .where('last_reply_at', isGreaterThan: ts)
            .get()
            .timeout(_queryTimeout),
      ]);

      // Dedupliceer op doc ID (een nieuw announcement met reply telt maar 1x)
      final unreadIds = <String>{};
      for (final doc in results[0].docs) {
        unreadIds.add(doc.id);
      }
      for (final doc in results[1].docs) {
        unreadIds.add(doc.id);
      }
      return unreadIds.length;
    } catch (e) {
      debugPrint('❌ countUnreadAnnouncements error: $e');
      return 0;
    }
  }

  // ============================================================
  // EVENT MESSAGES — over alle open operaties
  // ============================================================

  /// Max aantal operaties om te tellen (voorkomt ANR bij veel open events)
  static const int _maxOperationsToCount = 10;

  Future<int> countUnreadEventMessages(String clubId) async {
    try {
      // Haal max N meest recente open evenementen op (beperkt queries)
      final opsSnapshot = await _firestore
          .collection('clubs/$clubId/operations')
          .where('type', isEqualTo: 'evenement')
          .where('statut', isEqualTo: 'ouvert')
          .orderBy('date_debut', descending: true)
          .limit(_maxOperationsToCount)
          .get()
          .timeout(_queryTimeout);

      // Tel ongelezen berichten per operatie parallel (sneller dan sequentieel)
      final futures = opsSnapshot.docs.map((opDoc) async {
        final lastRead =
            _tracker.getLastRead('operation_${opDoc.id}') ?? _epoch;

        final query = _firestore
            .collection('clubs/$clubId/operations/${opDoc.id}/messages')
            .where('created_at', isGreaterThan: Timestamp.fromDate(lastRead));

        final snapshot = await query.count().get().timeout(_queryTimeout);
        return snapshot.count ?? 0;
      });

      final counts = await Future.wait(futures);
      return counts.fold<int>(0, (total, value) => total + value);
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
      final lastRead = _tracker.getLastRead('operation_$operationId') ?? _epoch;

      final query = _firestore
          .collection('clubs/$clubId/operations/$operationId/messages')
          .where('created_at', isGreaterThan: Timestamp.fromDate(lastRead));

      final snapshot = await query.count().get().timeout(_queryTimeout);
      return snapshot.count ?? 0;
    } catch (e) {
      debugPrint('❌ countUnreadForOperation error: $e');
      return 0;
    }
  }

  // ============================================================
  // TEAM MESSAGES — per channel
  // ============================================================

  Future<int> countUnreadTeamMessages(String clubId, List<String> roles,
      {bool includeAllChannels = false}) async {
    final channelIds = ClubRoleUtils.getVisibleTeamChannelIds(
      roles,
      includeAllChannels: includeAllChannels,
    );

    try {
      // Parallel queries per channel (sneller dan sequentieel)
      final futures = channelIds.map((channelId) async {
        final lastRead = _tracker.getLastRead('team_$channelId') ?? _epoch;

        final query = _firestore
            .collection('clubs/$clubId/team_channels/$channelId/messages')
            .where('created_at', isGreaterThan: Timestamp.fromDate(lastRead));

        final snapshot = await query.count().get().timeout(_queryTimeout);
        return snapshot.count ?? 0;
      });

      final counts = await Future.wait(futures);
      return counts.fold<int>(0, (total, value) => total + value);
    } catch (e) {
      debugPrint('❌ countUnreadTeamMessages error: $e');
      return 0;
    }
  }

  Future<int> countUnreadForTeamChannel(String clubId, String channelId) async {
    try {
      final lastRead = _tracker.getLastRead('team_$channelId') ?? _epoch;

      final query = _firestore
          .collection('clubs/$clubId/team_channels/$channelId/messages')
          .where('created_at', isGreaterThan: Timestamp.fromDate(lastRead));

      final snapshot = await query.count().get().timeout(_queryTimeout);
      return snapshot.count ?? 0;
    } catch (e) {
      debugPrint('❌ countUnreadForTeamChannel error: $e');
      return 0;
    }
  }

  // ============================================================
  // SESSION MESSAGES — per actieve sessie
  // ============================================================

  /// Max aantal sessies om te tellen (voorkomt ANR bij veel gepubliceerde sessies)
  static const int _maxSessionsToCount = 5;

  Future<int> countUnreadSessionMessages(
      String clubId, List<String> roles) async {
    final normalizedRoles = ClubRoleUtils.normalizeRoles(roles);
    final hasAccueil = normalizedRoles.contains('accueil');
    final hasEncadrant = normalizedRoles.contains('encadrant');

    if (!hasAccueil && !hasEncadrant) return 0;

    try {
      // Haal max N meest recente gepubliceerde sessies op (beperkt queries)
      final sessionsSnapshot = await _firestore
          .collection('clubs/$clubId/piscine_sessions')
          .where('statut', isEqualTo: 'publie')
          .orderBy('date', descending: true)
          .limit(_maxSessionsToCount)
          .get()
          .timeout(_queryTimeout);

      // Bepaal welke group types de user kan zien
      final groupTypes = <String>[];
      if (hasAccueil) groupTypes.add('accueil');
      if (hasEncadrant) {
        groupTypes.add('encadrants');
        groupTypes.add('niveau');
      }

      // Tel ongelezen berichten per sessie+group parallel
      final futures = <Future<int>>[];
      for (final sessionDoc in sessionsSnapshot.docs) {
        for (final groupType in groupTypes) {
          futures.add(
              _countUnreadForSessionGroup(clubId, sessionDoc.id, groupType));
        }
      }

      final counts = await Future.wait(futures);
      return counts.fold<int>(0, (total, value) => total + value);
    } catch (e) {
      debugPrint('❌ countUnreadSessionMessages error: $e');
      return 0;
    }
  }

  /// Helper: tel ongelezen berichten voor één sessie+group combinatie
  Future<int> _countUnreadForSessionGroup(
      String clubId, String sessionId, String groupType) async {
    try {
      final key = 'session_${sessionId}_$groupType';
      final lastRead = _tracker.getLastRead(key) ?? _epoch;

      final query = _firestore
          .collection('clubs/$clubId/piscine_sessions/$sessionId/messages')
          .where('group_type', isEqualTo: groupType)
          .where('created_at', isGreaterThan: Timestamp.fromDate(lastRead));

      final snapshot = await query.count().get().timeout(_queryTimeout);
      return snapshot.count ?? 0;
    } catch (e) {
      return 0;
    }
  }

  // ============================================================
  // ALLES SAMEN — refresh alle counts
  // ============================================================

  /// Bereken alle ongelezen counts in één keer.
  /// Retourneert een map met categorie → count.
  Future<Map<String, int>> refreshAllCounts(String clubId, List<String> roles,
      {bool includeAllTeamChannels = false}) async {
    final results = await Future.wait([
      countUnreadAnnouncements(clubId),
      countUnreadEventMessages(clubId),
      countUnreadTeamMessages(
        clubId,
        roles,
        includeAllChannels: includeAllTeamChannels,
      ),
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

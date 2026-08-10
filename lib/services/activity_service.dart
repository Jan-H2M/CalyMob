import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:rxdart/rxdart.dart';
import '../models/activity_item.dart';
import '../models/operation.dart';
import '../models/piscine_session.dart';

/// Service voor het ophalen van gecombineerde activiteiten
/// Combineert operations en piscine sessions in één stream
class ActivityService {
  final FirebaseFirestore _firestore;

  ActivityService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  /// Gecombineerde stream van operations + piscine sessions
  /// Retourneert alle open events en gepubliceerde piscine sessies
  Stream<List<ActivityItem>> getAllActivitiesStream(
    String clubId, {
    bool includeClosed = false,
    String? currentUserId,
  }) {
    final baseQuery = _firestore
        .collection('clubs/$clubId/operations')
        .where('type', isEqualTo: 'evenement');
    final openStream = baseQuery
        .where('statut', isEqualTo: 'ouvert')
        .snapshots()
        .map((snapshot) => snapshot.docs);
    final closedStream = includeClosed
        ? baseQuery
            .where('statut', isEqualTo: 'ferme')
            .snapshots()
            .map((snapshot) => snapshot.docs)
        : Stream.value(<QueryDocumentSnapshot<Map<String, dynamic>>>[]);

    // Draft queries are scoped server-side to the logged-in user. This is
    // intentionally not a broad draft query followed by client-side filtering:
    // another member's draft must never be delivered to this client.
    final hasUser = currentUserId != null && currentUserId.isNotEmpty;
    final creatorDraftStream = hasUser
        ? baseQuery
            .where('statut', isEqualTo: 'brouillon')
            .where('creator_user_id', isEqualTo: currentUserId)
            .snapshots()
            .map((snapshot) => snapshot.docs)
        : Stream.value(<QueryDocumentSnapshot<Map<String, dynamic>>>[]);
    final legacyDraftStream = hasUser
        ? baseQuery
            .where('statut', isEqualTo: 'brouillon')
            .where('organisateur_id', isEqualTo: currentUserId)
            .snapshots()
            .map((snapshot) => snapshot.docs)
        : Stream.value(<QueryDocumentSnapshot<Map<String, dynamic>>>[]);

    // Stream 2: Gepubliceerde piscine sessies
    final piscineStream = _firestore
        .collection('clubs/$clubId/piscine_sessions')
        .where('statut', isEqualTo: 'publie')
        .snapshots()
        .map((snapshot) {
      debugPrint('🏊 Piscine stream: ${snapshot.docs.length} docs');
      return snapshot.docs;
    });

    // Combineer beide streams met rxdart
    return Rx.combineLatestList<
        List<QueryDocumentSnapshot<Map<String, dynamic>>>>([
      openStream,
      closedStream,
      creatorDraftStream,
      legacyDraftStream,
      piscineStream,
    ]).map((snapshots) {
      final ops = <QueryDocumentSnapshot>[];
      final seen = <String>{};
      for (var index = 0; index < 4; index++) {
        for (final doc in snapshots[index]) {
          if (seen.add(doc.id)) ops.add(doc);
        }
      }
      final sessions = snapshots[4];
      final activities = <ActivityItem>[];

      // Operations → ActivityItems
      for (var doc in ops) {
        try {
          final op = Operation.fromFirestore(doc);
          final isLegacyDraft = op.statut == 'brouillon' &&
              op.creatorUserId == null &&
              op.organisateurId == currentUserId;
          final isOwnedDraft =
              op.statut == 'brouillon' && op.creatorUserId == currentUserId;
          // Exclude piscine category operations (we use piscine_sessions instead)
          if (op.categorie != 'piscine' &&
              (op.statut == 'ouvert' ||
                  (includeClosed && op.statut == 'ferme') ||
                  isOwnedDraft ||
                  isLegacyDraft)) {
            activities.add(ActivityItem.fromOperation(op));
          }
        } catch (e) {
          debugPrint('❌ Error parsing operation ${doc.id}: $e');
        }
      }

      // PiscineSessions → ActivityItems
      for (var doc in sessions) {
        try {
          final session = PiscineSession.fromFirestore(doc);
          activities.add(ActivityItem.fromPiscineSession(session));
        } catch (e) {
          debugPrint('❌ Error parsing piscine session ${doc.id}: $e');
        }
      }

      // Sorteer op datum (oplopend - dichtstbijzijnde eerst)
      activities.sort((a, b) => a.date.compareTo(b.date));

      debugPrint(
        '✅ Combined activities: ${activities.length} total (${ops.length} ops + ${sessions.length} piscine)',
      );

      return activities;
    });
  }

  /// Stream van afgesloten (ferme) evenementen.
  /// Bedoeld voor organisatoren/admins: zo blijven voorbije events bereikbaar
  /// om betalingen te initiëren (de hoofdlijst toont enkel 'ouvert').
  Stream<List<ActivityItem>> getClosedOperationsStream(String clubId) {
    return _firestore
        .collection('clubs/$clubId/operations')
        .where('type', isEqualTo: 'evenement')
        .where('statut', isEqualTo: 'ferme')
        .snapshots()
        .map((snapshot) {
      debugPrint(
        '📦 Closed operations stream: ${snapshot.docs.length} docs',
      );
      final activities = <ActivityItem>[];
      for (var doc in snapshot.docs) {
        try {
          final op = Operation.fromFirestore(doc);
          // Exclude piscine category operations (we use piscine_sessions instead)
          if (op.categorie != 'piscine') {
            activities.add(ActivityItem.fromOperation(op));
          }
        } catch (e) {
          debugPrint('❌ Error parsing closed operation ${doc.id}: $e');
        }
      }
      // Meest recente eerst (handig voor reconciliatie van voorbije events)
      activities.sort((a, b) => b.date.compareTo(a.date));
      return activities;
    });
  }

  /// Haal alleen open operations op (zonder piscine)
  Stream<List<ActivityItem>> getOperationsOnlyStream(String clubId) {
    return _firestore
        .collection('clubs/$clubId/operations')
        .where('type', isEqualTo: 'evenement')
        .where('statut', isEqualTo: 'ouvert')
        .snapshots()
        .map((snapshot) {
      final activities = snapshot.docs
          .map((doc) {
            try {
              return ActivityItem.fromOperation(
                Operation.fromFirestore(doc),
              );
            } catch (e) {
              debugPrint('❌ Error parsing operation ${doc.id}: $e');
              return null;
            }
          })
          .whereType<ActivityItem>()
          .toList();

      activities.sort((a, b) => a.date.compareTo(b.date));
      return activities;
    });
  }

  /// Haal alleen gepubliceerde piscine sessies op
  Stream<List<ActivityItem>> getPiscineOnlyStream(String clubId) {
    return _firestore
        .collection('clubs/$clubId/piscine_sessions')
        .where('statut', isEqualTo: 'publie')
        .snapshots()
        .map((snapshot) {
      final activities = snapshot.docs
          .map((doc) {
            try {
              return ActivityItem.fromPiscineSession(
                PiscineSession.fromFirestore(doc),
              );
            } catch (e) {
              debugPrint('❌ Error parsing piscine session ${doc.id}: $e');
              return null;
            }
          })
          .whereType<ActivityItem>()
          .toList();

      activities.sort((a, b) => a.date.compareTo(b.date));
      return activities;
    });
  }
}

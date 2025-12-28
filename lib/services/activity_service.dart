import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:rxdart/rxdart.dart';
import '../models/activity_item.dart';
import '../models/operation.dart';
import '../models/piscine_session.dart';

/// Service voor het ophalen van gecombineerde activiteiten
/// Combineert operations en piscine sessions in één stream
class ActivityService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Gecombineerde stream van operations + piscine sessions
  /// Retourneert alle open events en gepubliceerde piscine sessies
  Stream<List<ActivityItem>> getAllActivitiesStream(String clubId) {
    // Stream 1: Open evenementen (plongée, sortie, etc.)
    final operationsStream = _firestore
        .collection('clubs/$clubId/operations')
        .where('type', isEqualTo: 'evenement')
        .where('statut', isEqualTo: 'ouvert')
        .snapshots()
        .map((snapshot) {
      debugPrint('📅 Operations stream: ${snapshot.docs.length} docs');
      return snapshot;
    });

    // Stream 2: Gepubliceerde piscine sessies
    final piscineStream = _firestore
        .collection('clubs/$clubId/piscine_sessions')
        .where('statut', isEqualTo: 'publie')
        .snapshots()
        .map((snapshot) {
      debugPrint('🏊 Piscine stream: ${snapshot.docs.length} docs');
      return snapshot;
    });

    // Combineer beide streams met rxdart
    return Rx.combineLatest2(
      operationsStream,
      piscineStream,
      (QuerySnapshot ops, QuerySnapshot sessions) {
        final activities = <ActivityItem>[];

        // Operations → ActivityItems
        for (var doc in ops.docs) {
          try {
            final op = Operation.fromFirestore(doc);
            // Exclude piscine category operations (we use piscine_sessions instead)
            if (op.categorie != 'piscine') {
              activities.add(ActivityItem.fromOperation(op));
            }
          } catch (e) {
            debugPrint('❌ Error parsing operation ${doc.id}: $e');
          }
        }

        // PiscineSessions → ActivityItems
        for (var doc in sessions.docs) {
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
            '✅ Combined activities: ${activities.length} total (${ops.docs.length} ops + ${sessions.docs.length} piscine)');

        return activities;
      },
    );
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
              return ActivityItem.fromOperation(Operation.fromFirestore(doc));
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
                  PiscineSession.fromFirestore(doc));
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

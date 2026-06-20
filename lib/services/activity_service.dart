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
  Stream<List<ActivityItem>> getAllActivitiesStream(String clubId,
      {bool includeClosed = false}) {
    // Stream 1: evenementen (plongée, sortie, etc.)
    // Par défaut : uniquement les événements ouverts.
    // includeClosed=true : on ne filtre que sur 'type' (pour éviter un index
    // composite Firestore) puis on garde ouvert + fermé côté client, afin que
    // les activités terminées restent consultables (données de paiement).
    final baseQuery = _firestore
        .collection('clubs/$clubId/operations')
        .where('type', isEqualTo: 'evenement');
    final operationsStream = (includeClosed
            ? baseQuery
            : baseQuery.where('statut', isEqualTo: 'ouvert'))
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
              // En mode includeClosed on ne garde que les statuts visibles
              // (ouvert/fermé) — jamais brouillon ni annulé.
              if (!includeClosed ||
                  op.statut == 'ouvert' ||
                  op.statut == 'ferme') {
                activities.add(ActivityItem.fromOperation(op));
              }
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
      debugPrint('📦 Closed operations stream: ${snapshot.docs.length} docs');
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

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

/// Service voor de personnes-filter van de Recherche (ET-logica, D4/D10).
class EventSearchService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Retourneert de set operation-ids waar ALLE [memberIds] samen aan deelnamen.
  ///
  /// Gebruikt een collectionGroup-query op 'inscriptions' (veld `membre_id`).
  /// Vereist een collectionGroup-index op `inscriptions.membre_id`.
  Future<Set<String>> operationIdsForAllMembers(
      String clubId, List<String> memberIds) async {
    if (memberIds.isEmpty) return <String>{};

    Set<String>? acc;
    for (final memberId in memberIds) {
      try {
        final snap = await _firestore
            .collectionGroup('inscriptions')
            .where('membre_id', isEqualTo: memberId)
            .get();

        final ops = <String>{};
        for (final doc in snap.docs) {
          // pad: clubs/{clubId}/operations/{opId}/inscriptions/{insId}
          final opRef = doc.reference.parent.parent;
          if (opRef == null) continue;
          final clubRef = opRef.parent.parent;
          if (clubRef != null && clubRef.id != clubId) continue;
          ops.add(opRef.id);
        }

        acc = acc == null ? ops : acc.intersection(ops);
        if (acc.isEmpty) break; // ET: geen gemeenschappelijke -> klaar
      } catch (e) {
        debugPrint('❌ EventSearchService.operationIdsForAllMembers: $e');
        rethrow;
      }
    }
    return acc ?? <String>{};
  }
}

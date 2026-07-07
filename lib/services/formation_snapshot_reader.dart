import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../models/formation_snapshot_doc.dart';

/// WP-10 — Lecteur du document matérialisé `formation_snapshot/current`
/// (produit par la CF WP-09). Aucun calcul : lecture pure.
class FormationSnapshotReader {
  final FirebaseFirestore _firestore;

  FormationSnapshotReader({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  /// Snapshot d'un membre (null si pas encore matérialisé).
  Future<FormationSnapshotDoc?> getSnapshot(String clubId, String memberId) async {
    try {
      final doc = await _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .doc(memberId)
          .collection('formation_snapshot')
          .doc('current')
          .get();
      final data = doc.data();
      if (!doc.exists || data == null) return null;
      return FormationSnapshotDoc.fromMap(memberId, data);
    } catch (e) {
      debugPrint('⚠️ Lecture formation_snapshot impossible ($memberId): $e');
      return null;
    }
  }

  /// Tous les snapshots du club via un collectionGroup (un seul appel).
  /// Seuls les membres en formation possèdent un snapshot → c'est la liste
  /// des élèves. L'appelant joint ensuite les profils (photo/nom).
  Future<List<FormationSnapshotDoc>> getAllSnapshots(String clubId) async {
    try {
      final snap = await _firestore.collectionGroup('formation_snapshot').get();
      final result = <FormationSnapshotDoc>[];
      for (final doc in snap.docs) {
        // Ne garder que les docs du club demandé (chemin clubs/{clubId}/…).
        final path = doc.reference.path;
        if (!path.startsWith('clubs/$clubId/')) continue;
        final memberId = doc.data()['member_id']?.toString() ?? '';
        if (memberId.isEmpty) continue;
        result.add(FormationSnapshotDoc.fromMap(memberId, doc.data()));
      }
      return result;
    } catch (e) {
      debugPrint('⚠️ collectionGroup formation_snapshot impossible: $e');
      return [];
    }
  }
}

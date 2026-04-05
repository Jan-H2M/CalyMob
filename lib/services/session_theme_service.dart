import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/session_theme.dart';

/// Read-only service voor session themes in CalyMob.
/// Thema's worden beheerd in CalyCompta; CalyMob leest enkel.
/// Collection: clubs/{clubId}/session_themes
class SessionThemeService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> _collection(String clubId) {
    return _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('session_themes');
  }

  /// Alle thema's (gesorteerd op titel).
  Stream<List<SessionTheme>> getThemes(String clubId) {
    return _collection(clubId)
        .orderBy('title')
        .snapshots()
        .map((snap) => snap.docs
            .map((d) => SessionTheme.fromFirestore(d))
            .toList());
  }

  /// Thema's gefilterd op niveau.
  Stream<List<SessionTheme>> getThemesForNiveau(
    String clubId, String niveau) {    return _collection(clubId)
        .where('targetNiveaux', arrayContains: niveau)
        .orderBy('title')
        .snapshots()
        .map((snap) => snap.docs
            .map((d) => SessionTheme.fromFirestore(d))
            .toList());
  }

  /// Eén thema ophalen op ID.
  Future<SessionTheme?> getTheme(String clubId, String themeId) async {
    final doc = await _collection(clubId).doc(themeId).get();
    if (!doc.exists) return null;
    return SessionTheme.fromFirestore(doc);
  }
}
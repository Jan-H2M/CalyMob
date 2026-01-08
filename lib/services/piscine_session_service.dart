import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/piscine_session.dart';
import '../models/piscine_attendee.dart';

/// Service voor het beheren van piscine sessies
class PiscineSessionService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Collectie referentie voor piscine sessies
  CollectionReference<Map<String, dynamic>> _sessionsCollection(String clubId) {
    return _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('piscine_sessions');
  }

  /// Stream van komende sessies (gesorteerd op datum)
  Stream<List<PiscineSession>> getUpcomingSessions(String clubId) {
    final now = DateTime.now();
    final startOfDay = DateTime(now.year, now.month, now.day);

    return _sessionsCollection(clubId)
        .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(startOfDay))
        .orderBy('date', descending: false)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => PiscineSession.fromFirestore(doc))
            .toList());
  }

  /// Stream van gepubliceerde sessies (voor leden)
  Stream<List<PiscineSession>> getPublishedSessions(String clubId) {
    final now = DateTime.now();
    final startOfDay = DateTime(now.year, now.month, now.day);

    return _sessionsCollection(clubId)
        .where('statut', isEqualTo: PiscineSessionStatus.publie)
        .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(startOfDay))
        .orderBy('date', descending: false)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => PiscineSession.fromFirestore(doc))
            .toList());
  }

  /// Stream van sessies voor een specifieke maand
  Stream<List<PiscineSession>> getSessionsForMonth(
      String clubId, int year, int month) {
    final startOfMonth = DateTime(year, month, 1);
    final endOfMonth = DateTime(year, month + 1, 1);

    return _sessionsCollection(clubId)
        .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(startOfMonth))
        .where('date', isLessThan: Timestamp.fromDate(endOfMonth))
        .orderBy('date', descending: false)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => PiscineSession.fromFirestore(doc))
            .toList());
  }

  /// Ophalen van een specifieke sessie
  Future<PiscineSession?> getSession(String clubId, String sessionId) async {
    final doc = await _sessionsCollection(clubId).doc(sessionId).get();
    if (!doc.exists) return null;
    return PiscineSession.fromFirestore(doc);
  }

  /// Stream van een specifieke sessie (real-time updates)
  Stream<PiscineSession?> getSessionStream(String clubId, String sessionId) {
    return _sessionsCollection(clubId).doc(sessionId).snapshots().map((doc) {
      if (!doc.exists) return null;
      return PiscineSession.fromFirestore(doc);
    });
  }

  /// Sessies waar een specifiek lid bij betrokken is
  Stream<List<PiscineSession>> getSessionsForMember(
      String clubId, String membreId) {
    final now = DateTime.now();
    final startOfDay = DateTime(now.year, now.month, now.day);

    // We moeten alle gepubliceerde sessies ophalen en dan filteren
    // omdat Firestore geen query op nested arrays ondersteunt
    return _sessionsCollection(clubId)
        .where('statut', isEqualTo: PiscineSessionStatus.publie)
        .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(startOfDay))
        .orderBy('date', descending: false)
        .snapshots()
        .map((snapshot) {
      final sessions =
          snapshot.docs.map((doc) => PiscineSession.fromFirestore(doc)).toList();

      // Filter sessies waar het lid bij betrokken is
      return sessions.where((session) {
        // Check accueil
        if (session.isAccueil(membreId)) return true;

        // Check baptêmes
        if (session.isBaptemeEncadrant(membreId)) return true;

        // Check niveaux encadrants
        for (final level in PiscineLevel.all) {
          if (session.isEncadrantForLevel(membreId, level)) return true;
        }

        return false;
      }).toList();
    });
  }

  /// Update het thema voor een niveau in een sessie
  /// Note: We moeten het hele niveaux object updaten omdat Firestore
  /// geen speciale tekens (zoals *) toestaat in dot notation field paths
  Future<void> updateTheme({
    required String clubId,
    required String sessionId,
    required String level,
    required String theme,
    required String updatedBy,
  }) async {
    final docRef = _sessionsCollection(clubId).doc(sessionId);

    // Eerst de huidige sessie ophalen
    final docSnap = await docRef.get();
    if (!docSnap.exists) {
      throw Exception('Session not found');
    }

    final sessionData = docSnap.data()!;
    final niveaux = Map<String, dynamic>.from(sessionData['niveaux'] ?? {});

    // Update het specifieke niveau
    if (niveaux.containsKey(level)) {
      niveaux[level] = {
        ...Map<String, dynamic>.from(niveaux[level]),
        'theme': theme,
        'theme_updated_by': updatedBy,
        'theme_updated_at': Timestamp.fromDate(DateTime.now()),
      };
    }

    // Schrijf het hele niveaux object terug
    await docRef.update({
      'niveaux': niveaux,
      'updated_at': Timestamp.fromDate(DateTime.now()),
    });
  }

  /// Controleer of een lid toegang heeft tot een sessie
  bool memberHasAccess(PiscineSession session, String membreId, String? userLevel) {
    // Check of lid accueil is
    if (session.isAccueil(membreId)) return true;

    // Check of lid baptême encadrant is
    if (session.isBaptemeEncadrant(membreId)) return true;

    // Check of lid encadrant is voor een niveau
    for (final level in PiscineLevel.all) {
      if (session.isEncadrantForLevel(membreId, level)) return true;
    }

    // Check of lid ingeschreven is voor een niveau (via userLevel)
    if (userLevel != null && session.niveaux.containsKey(userLevel)) {
      return true;
    }

    return false;
  }

  /// Bepaal de rol van een lid in een sessie
  SessionRole? getMemberRole(PiscineSession session, String membreId) {
    // Check accueil
    if (session.isAccueil(membreId)) {
      return SessionRole.accueil;
    }

    // Check baptêmes
    if (session.isBaptemeEncadrant(membreId)) {
      return SessionRole.baptemeEncadrant;
    }

    // Check niveaux encadrants
    for (final level in PiscineLevel.all) {
      if (session.isEncadrantForLevel(membreId, level)) {
        return SessionRole.encadrant;
      }
    }

    return null;
  }

  /// Ophalen van de volgende sessie
  Future<PiscineSession?> getNextSession(String clubId) async {
    final now = DateTime.now();
    final startOfDay = DateTime(now.year, now.month, now.day);

    final snapshot = await _sessionsCollection(clubId)
        .where('statut', isEqualTo: PiscineSessionStatus.publie)
        .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(startOfDay))
        .orderBy('date', descending: false)
        .limit(1)
        .get();

    if (snapshot.docs.isEmpty) return null;
    return PiscineSession.fromFirestore(snapshot.docs.first);
  }

  /// Stream van de volgende sessie (real-time)
  Stream<PiscineSession?> getNextSessionStream(String clubId) {
    final now = DateTime.now();
    final startOfDay = DateTime(now.year, now.month, now.day);

    return _sessionsCollection(clubId)
        .where('statut', isEqualTo: PiscineSessionStatus.publie)
        .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(startOfDay))
        .orderBy('date', descending: false)
        .limit(1)
        .snapshots()
        .map((snapshot) {
      if (snapshot.docs.isEmpty) return null;
      return PiscineSession.fromFirestore(snapshot.docs.first);
    });
  }

  // ========== ATTENDEES (Aanwezigen) ==========

  /// Collectie referentie voor aanwezigen van een sessie
  CollectionReference<Map<String, dynamic>> _attendeesCollection(
      String clubId, String sessionId) {
    return _sessionsCollection(clubId).doc(sessionId).collection('attendees');
  }

  /// Stream van aanwezigen voor een sessie
  Stream<List<PiscineAttendee>> getAttendeesStream(
      String clubId, String sessionId) {
    return _attendeesCollection(clubId, sessionId)
        .orderBy('scannedAt', descending: false)
        .snapshots()
        .map((snapshot) =>
            snapshot.docs.map((doc) => PiscineAttendee.fromFirestore(doc)).toList());
  }

  /// Voeg een aanwezige toe
  Future<void> addAttendee({
    required String clubId,
    required String sessionId,
    required String memberId,
    required String memberName,
    required String scannedBy,
    bool isGuest = false,
  }) async {
    // Check of lid al aanwezig is
    final existing = await _attendeesCollection(clubId, sessionId)
        .where('memberId', isEqualTo: memberId)
        .get();

    if (existing.docs.isNotEmpty) {
      throw Exception('Ce membre est déjà marqué présent');
    }

    await _attendeesCollection(clubId, sessionId).add({
      'memberId': memberId,
      'memberName': memberName,
      'scannedAt': Timestamp.fromDate(DateTime.now()),
      'scannedBy': scannedBy,
      'isGuest': isGuest,
    });
  }

  /// Verwijder een aanwezige
  Future<void> removeAttendee({
    required String clubId,
    required String sessionId,
    required String attendeeId,
  }) async {
    await _attendeesCollection(clubId, sessionId).doc(attendeeId).delete();
  }

  /// Check of een lid al aanwezig is gemarkeerd
  Future<bool> isAttendeePresent({
    required String clubId,
    required String sessionId,
    required String memberId,
  }) async {
    final existing = await _attendeesCollection(clubId, sessionId)
        .where('memberId', isEqualTo: memberId)
        .get();
    return existing.docs.isNotEmpty;
  }

  /// Haal aanwezige op basis van memberId
  Future<PiscineAttendee?> getAttendeeByMemberId({
    required String clubId,
    required String sessionId,
    required String memberId,
  }) async {
    final snapshot = await _attendeesCollection(clubId, sessionId)
        .where('memberId', isEqualTo: memberId)
        .get();
    if (snapshot.docs.isEmpty) return null;
    return PiscineAttendee.fromFirestore(snapshot.docs.first);
  }
}

/// Enum voor de rol van een lid in een sessie
enum SessionRole {
  accueil,
  baptemeEncadrant,
  encadrant,
}

extension SessionRoleExtension on SessionRole {
  String get displayName {
    switch (this) {
      case SessionRole.accueil:
        return 'Accueil';
      case SessionRole.baptemeEncadrant:
        return 'Baptêmes';
      case SessionRole.encadrant:
        return 'Encadrant';
    }
  }

  String get icon {
    switch (this) {
      case SessionRole.accueil:
        return '🎫';
      case SessionRole.baptemeEncadrant:
        return '🏊';
      case SessionRole.encadrant:
        return '🎓';
    }
  }
}

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/piscine_session.dart';
import '../models/piscine_attendee.dart';

/// Service voor het beheren van piscine sessies
class PiscineSessionService {
  final FirebaseFirestore _firestore;

  PiscineSessionService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

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
      final sessions = snapshot.docs
          .map((doc) => PiscineSession.fromFirestore(doc))
          .toList();

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
  bool memberHasAccess(
      PiscineSession session, String membreId, String? userLevel) {
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
        .map((snapshot) => _dedupeAttendees(
            snapshot.docs.map((doc) => PiscineAttendee.fromFirestore(doc))));
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
    final alreadyPresent = await isAttendeePresent(
      clubId: clubId,
      sessionId: sessionId,
      memberId: memberId,
    );

    if (alreadyPresent) {
      throw Exception('Ce membre est déjà marqué présent');
    }

    final data = {
      'memberId': memberId,
      'memberName': memberName,
      'scannedAt': Timestamp.fromDate(DateTime.now()),
      'scannedBy': scannedBy,
      'isGuest': isGuest,
    };

    final attendees = _attendeesCollection(clubId, sessionId);
    if (isGuest) {
      await attendees.add(data);
      return;
    }

    // Canonical identity: one member = one attendee document per session.
    // Older sessions may still contain random-id legacy docs; read/delete paths
    // below remain tolerant so we do not need an immediate live migration.
    await attendees.doc(memberId).set(data, SetOptions(merge: true));
  }

  /// Verwijder een aanwezige
  Future<void> removeAttendee({
    required String clubId,
    required String sessionId,
    required String attendeeId,
  }) async {
    final attendees = _attendeesCollection(clubId, sessionId);
    final refsByPath = <String, DocumentReference<Map<String, dynamic>>>{};

    void remember(DocumentReference<Map<String, dynamic>> ref) {
      refsByPath[ref.path] = ref;
    }

    final targetRef = attendees.doc(attendeeId);
    remember(targetRef);

    String memberId;
    final targetSnap = await targetRef.get();
    if (targetSnap.exists) {
      final data = targetSnap.data() ?? const <String, dynamic>{};
      if (data['isGuest'] == true) {
        await targetRef.delete();
        return;
      }
      memberId = _memberIdFromData(data, attendeeId);
    } else {
      memberId = attendeeId;
    }

    if (memberId.trim().isNotEmpty) {
      final normalizedMemberId = memberId.trim();
      remember(attendees.doc(normalizedMemberId));

      Future<void> collect(String field) async {
        final snapshot = await attendees
            .where(field, isEqualTo: normalizedMemberId)
            .get();
        for (final doc in snapshot.docs) {
          remember(doc.reference);
        }
      }

      await collect('memberId');
      await collect('membre_id');
    }

    final batch = _firestore.batch();
    for (final ref in refsByPath.values) {
      batch.delete(ref);
    }
    await batch.commit();
  }

  /// Restaure un participant supprimé par erreur (undo après [removeAttendee]).
  ///
  /// Recrée le document avec le même [attendeeId] et les mêmes données que
  /// l'original — ce qui permet au stream de refléter immédiatement l'état
  /// précédent comme s'il n'avait jamais été supprimé.
  Future<void> restoreAttendee({
    required String clubId,
    required String sessionId,
    required String attendeeId,
    required Map<String, dynamic> data,
  }) async {
    await _attendeesCollection(clubId, sessionId).doc(attendeeId).set(data);
  }

  /// Check of een lid al aanwezig is gemarkeerd
  Future<bool> isAttendeePresent({
    required String clubId,
    required String sessionId,
    required String memberId,
  }) async {
    final attendees = _attendeesCollection(clubId, sessionId);
    final canonical = await attendees.doc(memberId).get();
    if (canonical.exists) return true;

    try {
      final byMemberId =
          await attendees.where('memberId', isEqualTo: memberId).get();
      if (byMemberId.docs.isNotEmpty) return true;

      final byLegacyMemberId =
          await attendees.where('membre_id', isEqualTo: memberId).get();
      return byLegacyMemberId.docs.isNotEmpty;
    } catch (e) {
      // Fallback: fetch all attendees and filter in memory if an index/rules
      // nuance prevents one of the precise queries.
      final all = await attendees.get();
      return all.docs.any((doc) {
        final data = doc.data();
        return _memberIdFromData(data, doc.id) == memberId;
      });
    }
  }

  /// Haal aanwezige op basis van memberId
  Future<PiscineAttendee?> getAttendeeByMemberId({
    required String clubId,
    required String sessionId,
    required String memberId,
  }) async {
    final attendees = _attendeesCollection(clubId, sessionId);
    final candidatesByPath = <String, DocumentSnapshot<Map<String, dynamic>>>{};

    void remember(DocumentSnapshot<Map<String, dynamic>> doc) {
      if (doc.exists) candidatesByPath[doc.reference.path] = doc;
    }

    remember(await attendees.doc(memberId).get());

    Future<void> collect(String field) async {
      final snapshot = await attendees.where(field, isEqualTo: memberId).get();
      for (final doc in snapshot.docs) {
        candidatesByPath[doc.reference.path] = doc;
      }
    }

    await collect('memberId');
    await collect('membre_id');

    if (candidatesByPath.isEmpty) return null;
    return _preferredAttendee(
      candidatesByPath.values.map((doc) => PiscineAttendee.fromFirestore(doc)),
    );
  }

  static String _memberIdFromData(Map<String, dynamic> data, String fallbackId) {
    return (data['memberId'] ?? data['membre_id'] ?? fallbackId).toString();
  }

  static List<PiscineAttendee> _dedupeAttendees(
      Iterable<PiscineAttendee> attendees) {
    final byMember = <String, PiscineAttendee>{};
    for (final attendee in attendees) {
      final key = attendee.memberId.trim().isNotEmpty
          ? attendee.memberId.trim()
          : attendee.id;
      final current = byMember[key];
      if (current == null ||
          _attendeeScore(attendee) > _attendeeScore(current) ||
          (_attendeeScore(attendee) == _attendeeScore(current) &&
              attendee.scannedAt.isBefore(current.scannedAt))) {
        byMember[key] = attendee;
      }
    }
    return byMember.values.toList()
      ..sort((a, b) => a.scannedAt.compareTo(b.scannedAt));
  }

  static PiscineAttendee _preferredAttendee(Iterable<PiscineAttendee> attendees) {
    return _dedupeAttendees(attendees).reduce((best, attendee) {
      final bestScore = _attendeeScore(best);
      final attendeeScore = _attendeeScore(attendee);
      if (attendeeScore > bestScore) return attendee;
      if (attendeeScore == bestScore &&
          attendee.scannedAt.isBefore(best.scannedAt)) {
        return attendee;
      }
      return best;
    });
  }

  static int _attendeeScore(PiscineAttendee attendee) {
    var score = 0;
    if (attendee.memberName.trim().isNotEmpty) score += 4;
    if (attendee.scannedBy.trim().isNotEmpty) score += 2;
    if (attendee.id == attendee.memberId) score += 1;
    if (attendee.assignedLevel != null) score += 1;
    if (attendee.assignedCourseId != null) score += 1;
    if (attendee.remarks != null) score += 1;
    return score;
  }

  /// Récupère les sessions de piscine où ce membre était présent (scanné)
  /// dans les [days] derniers jours, triées par date descendante.
  ///
  /// Utilisé par le picker de self-declaration (CalyMob "Je l'ai fait"-flow).
  ///
  /// Implémentation: load les sessions des N derniers jours + vérifie
  /// la subcollection `attendees` par session (pas de collectionGroup query
  /// pour éviter les index composites + règles FS).
  Future<List<PiscineSession>> getRecentAttendedSessions({
    required String clubId,
    required String memberId,
    int days = 30,
  }) async {
    try {
      final now = DateTime.now();
      final cutoff = now.subtract(Duration(days: days));

      // 1. Load all sessions in the last N days (past + today)
      final snapshot = await _sessionsCollection(clubId)
          .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(cutoff))
          .where('date', isLessThanOrEqualTo: Timestamp.fromDate(now))
          .orderBy('date', descending: true)
          .get();

      final sessions = snapshot.docs
          .map((doc) => PiscineSession.fromFirestore(doc))
          .toList();

      if (sessions.isEmpty) {
        debugPrint('📅 Aucune session piscine dans les $days derniers jours');
        return [];
      }

      // 2. For each session check attendance in parallel
      final checks = await Future.wait(
        sessions.map((s) async {
          final present = await isAttendeePresent(
            clubId: clubId,
            sessionId: s.id,
            memberId: memberId,
          );
          return present ? s : null;
        }),
      );

      final attended = checks.whereType<PiscineSession>().toList();
      debugPrint(
          '📅 ${attended.length}/${sessions.length} sessions piscine attendues par $memberId');
      return attended;
    } catch (e) {
      debugPrint('❌ Erreur getRecentAttendedSessions: $e');
      return [];
    }
  }

  /// Met à jour l'affectation formation d'un participant scanné
  Future<void> updateAttendeeAssignment({
    required String clubId,
    required String sessionId,
    required String attendeeId,
    String? assignedLevel,
    String? assignedCourseId,
  }) async {
    await _attendeesCollection(clubId, sessionId).doc(attendeeId).update({
      'assignedLevel': assignedLevel ?? FieldValue.delete(),
      'assignedCourseId': assignedCourseId ?? FieldValue.delete(),
    });
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

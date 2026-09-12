import 'dart:convert';
import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../models/operation.dart';
import '../models/member_profile.dart';
import '../models/participant_operation.dart';
import '../models/supplement.dart';
import '../models/tariff.dart';
import '../models/user_event_registration.dart';
import '../utils/tariff_utils.dart';
import 'refund_service.dart';

// Number.MAX_SAFE_INTEGER. It sorts invalid/missing waitlist dates last while
// remaining exactly representable when this service is compiled with dart2js.
const int _missingWaitlistDateSortKey = 9007199254740991;
const int _missingRegistrationDateSortKey = -9007199254740991;

typedef RegisterForEventInvoker = Future<Map<String, dynamic>> Function(
    Map<String, dynamic> payload);
typedef AddGuestToEventInvoker = Future<void> Function(
    Map<String, dynamic> payload);

class RegistrationGuestRequest {
  const RegistrationGuestRequest({
    required this.firstName,
    required this.lastName,
    this.tariffId,
    this.selectedSupplements = const <SelectedSupplement>[],
  });

  final String firstName;
  final String lastName;
  final String? tariffId;
  final List<SelectedSupplement> selectedSupplements;

  Map<String, dynamic> toCallablePayload() => {
        'firstName': firstName,
        'lastName': lastName,
        if (tariffId != null) 'tariffId': tariffId,
        'selectedSupplementIds':
            selectedSupplements.map((supplement) => supplement.id).toList(),
      };
}

class EventRegistrationResult {
  const EventRegistrationResult({
    required this.status,
    required this.inscriptionId,
    required this.guestInscriptionIds,
    required this.idempotent,
  });

  final String status;
  final String inscriptionId;
  final List<String> guestInscriptionIds;
  final bool idempotent;

  factory EventRegistrationResult.fromCallable(Object? value) {
    final data = Map<String, dynamic>.from(value as Map);
    return EventRegistrationResult(
      status: data['status'] as String,
      inscriptionId: data['inscriptionId'] as String,
      guestInscriptionIds: (data['guestInscriptionIds'] as List? ?? const [])
          .map((id) => id as String)
          .toList(growable: false),
      idempotent: data['idempotent'] == true,
    );
  }
}

class PaymentMethodNotAllowedException implements Exception {
  const PaymentMethodNotAllowedException();

  @override
  String toString() =>
      'Ce moyen de paiement n’est plus autorisé pour cette activité.';
}

/// Service de gestion des opérations (événements)
class OperationService {
  final FirebaseFirestore _firestore;
  final FirebaseFunctions? _injectedFunctions;
  final RegisterForEventInvoker? _registerForEventInvoker;
  final AddGuestToEventInvoker? _addGuestToEventInvoker;

  OperationService({
    FirebaseFirestore? firestore,
    FirebaseFunctions? functions,
    RegisterForEventInvoker? registerForEventInvoker,
    AddGuestToEventInvoker? addGuestToEventInvoker,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _injectedFunctions = functions,
        _registerForEventInvoker = registerForEventInvoker,
        _addGuestToEventInvoker = addGuestToEventInvoker;

  FirebaseFunctions get _functions =>
      _injectedFunctions ??
      FirebaseFunctions.instanceFor(region: 'europe-west1');

  Future<String?> _appVersion() async {
    try {
      final info = await PackageInfo.fromPlatform();
      return '${info.version}+${info.buildNumber}';
    } catch (_) {
      return null;
    }
  }

  Map<String, dynamic> _actionMetadata({
    required String action,
    required String actorId,
    required String actorName,
    required String source,
    required String reason,
    String actorRole = 'member',
    String? appVersion,
  }) =>
      {
        'last_action': action,
        'last_action_at': FieldValue.serverTimestamp(),
        'last_action_by': actorId,
        'last_action_by_name': actorName,
        'last_action_by_role': actorRole,
        'last_action_source': source,
        if (appVersion != null) 'last_action_app_version': appVersion,
        'last_action_reason': reason,
      };

  Map<String, dynamic> _cancellationMetadata({
    required String actorId,
    required String actorName,
    required String source,
    required String reason,
    String actorRole = 'member',
    String? appVersion,
  }) =>
      {
        'registration_status': 'canceled',
        'canceled_at': FieldValue.serverTimestamp(),
        'canceled_by': actorId,
        'canceled_by_name': actorName,
        'canceled_by_role': actorRole,
        'canceled_source': source,
        if (appVersion != null) 'canceled_app_version': appVersion,
        'canceled_reason': reason,
        'updated_at': FieldValue.serverTimestamp(),
        ..._actionMetadata(
          action: 'unregistered',
          actorId: actorId,
          actorName: actorName,
          actorRole: actorRole,
          source: source,
          reason: reason,
          appVersion: appVersion,
        ),
      };

  /// Remove diacritics for locale-aware sorting (é→e, è→e, ü→u, etc.)
  static String _removeDiacritics(String str) {
    const diacritics =
        'ÀÁÂÃÄÅàáâãäåÒÓÔÕÖØòóôõöøÈÉÊËèéêëÇçÌÍÎÏìíîïÙÚÛÜùúûüÿÑñŠšŽžÐðÝýÞþ';
    const replacements =
        'AAAAAAaaaaaaOOOOOOooooooEEEEeeeeCcIIIIiiiiUUUUuuuuyNnSsZzDdYyTt';
    for (int i = 0; i < diacritics.length; i++) {
      str = str.replaceAll(diacritics[i], replacements[i]);
    }
    return str;
  }

  /// Sort participants by first name (prénom), then last name as tiebreaker
  /// Uses diacritics-insensitive comparison for proper French name sorting
  static void sortParticipantsByName(List<ParticipantOperation> participants) {
    participants.sort((a, b) {
      final aPrenom = _removeDiacritics((a.membrePrenom ?? '').toLowerCase());
      final bPrenom = _removeDiacritics((b.membrePrenom ?? '').toLowerCase());
      final firstNameCompare = aPrenom.compareTo(bPrenom);
      if (firstNameCompare != 0) return firstNameCompare;
      final aNom = _removeDiacritics((a.membreNom ?? '').toLowerCase());
      final bNom = _removeDiacritics((b.membreNom ?? '').toLowerCase());
      return aNom.compareTo(bNom);
    });
  }

  /// Stream des événements ouverts
  Stream<List<Operation>> getOpenEventsStream(String clubId) {
    return _firestore
        .collection('clubs/$clubId/operations')
        .where('type', isEqualTo: 'evenement')
        .where('statut', isEqualTo: 'ouvert')
        .orderBy('date_debut', descending: false)
        .snapshots()
        .map((snapshot) {
      final operations =
          snapshot.docs.map((doc) => Operation.fromFirestore(doc)).toList();

      debugPrint('📅 ${operations.length} événements ouverts chargés');
      return operations;
    });
  }

  /// Obtenir une opération par ID
  Future<Operation?> getOperationById(String clubId, String operationId) async {
    try {
      final doc = await _firestore
          .collection('clubs/$clubId/operations')
          .doc(operationId)
          .get();

      if (!doc.exists) {
        debugPrint('⚠️ Opération non trouvée: $operationId');
        return null;
      }

      return Operation.fromFirestore(doc);
    } catch (e) {
      debugPrint('❌ Erreur chargement opération: $e');
      return null;
    }
  }

  /// Compter le nombre de participants à une opération
  /// Uses subcollection: clubs/{clubId}/operations/{operationId}/inscriptions
  Future<int> countParticipants(String clubId, String operationId) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .get();

      final count = snapshot.docs
          .where(
            (doc) =>
                doc.data()['registration_status'] != 'canceled' &&
                doc.data()['registration_status'] != 'waitlisted',
          )
          .length;
      debugPrint('👥 $count participants pour opération $operationId');
      return count;
    } catch (e) {
      debugPrint('❌ Erreur comptage participants: $e');
      return 0;
    }
  }

  /// Vérifier si l'utilisateur est déjà inscrit
  /// Uses subcollection: clubs/{clubId}/operations/{operationId}/inscriptions
  Future<bool> isUserRegistered(
    String clubId,
    String operationId,
    String userId,
  ) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .where('membre_id', isEqualTo: userId)
          .get();

      final isRegistered = snapshot.docs.any((doc) {
        final status = doc.data()['registration_status'];
        return status != 'canceled' && status != 'waitlisted';
      });
      debugPrint(
        isRegistered
            ? '✅ Utilisateur $userId déjà inscrit à $operationId'
            : '❌ Utilisateur $userId NON inscrit à $operationId',
      );

      return isRegistered;
    } catch (e) {
      debugPrint('❌ Erreur vérification inscription: $e');
      return false;
    }
  }

  /// Join without reserving capacity or starting a payment flow.
  Future<void> joinWaitlist({
    required String clubId,
    required String operationId,
    required String userId,
    required String userName,
    required Operation operation,
    MemberProfile? memberProfile,
  }) async {
    await _assertOperationAcceptsRegistration(clubId, operationId);
    final existing = await getUserInscription(
      clubId: clubId,
      operationId: operationId,
      userId: userId,
    );
    if (existing != null) {
      throw Exception(
        existing.isWaitlisted
            ? 'Vous êtes déjà sur la liste d’attente'
            : 'Vous êtes déjà inscrit à cet événement',
      );
    }
    final appVersion = await _appVersion();
    await _functions.httpsCallable('joinEventWaitlist').call({
      'clubId': clubId,
      'operationId': operationId,
      'source': 'calymob',
      if (appVersion != null) 'appVersion': appVersion,
    });
  }

  /// S'inscrire à une opération
  /// Uses subcollection: clubs/{clubId}/operations/{operationId}/inscriptions
  Future<EventRegistrationResult> registerToOperation({
    required String clubId,
    required String operationId,
    required String userId,
    required String userName,
    required Operation operation,
    MemberProfile? memberProfile,
    Tariff? selectedTariff,
    List<SelectedSupplement>? selectedSupplements,
    double? supplementTotal,
    String? requestId,
    String? payloadFingerprint,
    List<RegistrationGuestRequest> guests = const <RegistrationGuestRequest>[],
  }) async {
    try {
      final appVersion = await _appVersion();
      final supplements = selectedSupplements ?? const <SelectedSupplement>[];
      final fingerprint = payloadFingerprint ??
          registrationRequestPayloadFingerprint(
            clubId: clubId,
            operationId: operationId,
            selectedSupplements: supplements,
            guests: guests,
          );
      final payload = <String, dynamic>{
        'clubId': clubId,
        'operationId': operationId,
        'requestId': requestId ?? _newRegistrationRequestId(),
        'payloadFingerprint': fingerprint,
        'selectedSupplementIds':
            supplements.map((supplement) => supplement.id).toList(),
        'guests': guests.map((guest) => guest.toCallablePayload()).toList(),
        'source': 'calymob',
        if (appVersion != null) 'appVersion': appVersion,
      };
      final registerForEventInvoker = _registerForEventInvoker;
      Object? response;
      if (registerForEventInvoker != null) {
        response = await registerForEventInvoker(payload);
      } else {
        response =
            (await _functions.httpsCallable('registerForEvent').call(payload))
                .data;
      }

      debugPrint(
        '✅ Inscription transactionnelle réussie: $userName → ${operation.titre}',
      );
      return EventRegistrationResult.fromCallable(response);
    } catch (e) {
      debugPrint('❌ Erreur inscription: $e');
      rethrow;
    }
  }

  String _newRegistrationRequestId() {
    final random = Random.secure().nextInt(0x7fffffff).toRadixString(36);
    return 'calymob_${DateTime.now().microsecondsSinceEpoch}_$random';
  }

  String newRegistrationRequestId() => _newRegistrationRequestId();

  static String registrationRequestPayloadFingerprint({
    required String clubId,
    required String operationId,
    List<SelectedSupplement> selectedSupplements = const <SelectedSupplement>[],
    List<RegistrationGuestRequest> guests = const <RegistrationGuestRequest>[],
  }) {
    final memberSupplementIds =
        selectedSupplements.map((supplement) => supplement.id).toList()..sort();
    final canonicalGuests = guests.map((guest) {
      final guestSupplementIds = guest.selectedSupplements
          .map((supplement) => supplement.id)
          .toList()
        ..sort();
      return <String, dynamic>{
        'firstName': guest.firstName.trim(),
        'lastName': guest.lastName.trim(),
        'tariffId': guest.tariffId,
        'selectedSupplementIds': guestSupplementIds,
      };
    }).toList(growable: false);
    final canonical = jsonEncode(<String, dynamic>{
      'version': 1,
      'clubId': clubId,
      'operationId': operationId,
      'selectedSupplementIds': memberSupplementIds,
      'guests': canonicalGuests,
    });
    return sha256.convert(utf8.encode(canonical)).toString();
  }

  static bool isDefinitiveRegistrationFailure(Object error) {
    if (error is! FirebaseFunctionsException) return false;
    return const {
      'invalid-argument',
      'failed-precondition',
      'permission-denied',
      'unauthenticated',
      'not-found',
      'already-exists',
      'resource-exhausted',
    }.contains(error.code);
  }

  static String guestRequestPayloadFingerprint({
    required String clubId,
    required String operationId,
    String? parentInscriptionId,
    required String guestPrenom,
    required String guestNom,
    String? tariffId,
    List<SelectedSupplement> selectedSupplements = const <SelectedSupplement>[],
  }) {
    final supplementIds =
        selectedSupplements.map((supplement) => supplement.id).toList()..sort();
    final canonical = jsonEncode(<String, dynamic>{
      'version': 1,
      'clubId': clubId,
      'operationId': operationId,
      'parentInscriptionId': parentInscriptionId,
      'firstName': guestPrenom.trim(),
      'lastName': guestNom.trim(),
      'tariffId': tariffId,
      'selectedSupplementIds': supplementIds,
    });
    return sha256.convert(utf8.encode(canonical)).toString();
  }

  static bool isDefinitiveGuestRegistrationFailure(Object error) {
    return isDefinitiveRegistrationFailure(error);
  }

  Future<void> _assertOperationAcceptsRegistration(
    String clubId,
    String operationId,
  ) async {
    final snapshot = await _firestore
        .collection('clubs/$clubId/operations')
        .doc(operationId)
        .get();
    if (!snapshot.exists || snapshot.data()?['statut'] != 'ouvert') {
      throw Exception('Les inscriptions sont fermées pour cet événement');
    }
  }

  /// Se désinscrire d'une opération
  /// Uses subcollection: clubs/{clubId}/operations/{operationId}/inscriptions
  Future<void> unregisterFromOperation({
    required String clubId,
    required String operationId,
    required String inscriptionId,
    required String userId,
    String? guestAction,
  }) async {
    if (inscriptionId.trim().isEmpty) {
      throw ArgumentError.value(
        inscriptionId,
        'inscriptionId',
        'L’identifiant de l’inscription est requis.',
      );
    }
    try {
      // Removing the registration and promoting the oldest waiting member
      // must be atomic, otherwise two simultaneous cancellations can assign
      // the same free place.
      final appVersion = await _appVersion();
      await _functions.httpsCallable('unregisterFromEvent').call({
        'clubId': clubId,
        'operationId': operationId,
        'inscriptionId': inscriptionId,
        if (guestAction != null) 'guestAction': guestAction,
        'source': 'calymob',
        if (appVersion != null) 'appVersion': appVersion,
        'reason': 'self_withdrawal',
      });

      debugPrint('✅ Désinscription réussie: user $userId');
    } catch (e) {
      debugPrint('❌ Erreur désinscription: $e');
      rethrow;
    }
  }

  /// Convert a waitlist date to a cross-platform FIFO sort key.
  @visibleForTesting
  static int waitlistDateSortKey(dynamic value) {
    if (value is Timestamp) return value.millisecondsSinceEpoch;
    if (value is DateTime) return value.millisecondsSinceEpoch;
    return _missingWaitlistDateSortKey;
  }

  /// 1-based FIFO position of a member on the event waitlist.
  Future<int?> getWaitlistPosition({
    required String clubId,
    required String operationId,
    required String userId,
  }) async {
    final snapshot = await _firestore
        .collection('clubs/$clubId/operations/$operationId/inscriptions')
        .where('registration_status', isEqualTo: 'waitlisted')
        .get();
    final waiting = snapshot.docs.toList()
      ..sort((left, right) {
        final byTime = waitlistDateSortKey(
          left.data()['requested_at'] ?? left.data()['date_inscription'],
        ).compareTo(
          waitlistDateSortKey(
            right.data()['requested_at'] ?? right.data()['date_inscription'],
          ),
        );
        return byTime != 0 ? byTime : left.id.compareTo(right.id);
      });
    final index = waiting.indexWhere(
      (doc) => doc.data()['membre_id'] == userId,
    );
    return index < 0 ? null : index + 1;
  }

  /// Annule tous les invités liés à une inscription parente sans effacer leur
  /// historique, leur paiement ou leur transaction.
  Future<int> deleteGuestsForParentInscription({
    required String clubId,
    required String operationId,
    required String parentInscriptionId,
  }) async {
    try {
      final parent = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .doc(parentInscriptionId)
          .get();
      final parentData = parent.data() ?? <String, dynamic>{};
      final actorId = parentData['membre_id'] as String? ?? 'unknown-member';
      final actorName =
          '${parentData['membre_prenom'] ?? ''} ${parentData['membre_nom'] ?? ''}'
              .trim();
      final appVersion = await _appVersion();
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .where('parent_inscription_id', isEqualTo: parentInscriptionId)
          .get();

      final batch = _firestore.batch();
      for (final doc in snapshot.docs) {
        if (doc.data()['registration_status'] == 'canceled') continue;
        batch.update(
          doc.reference,
          _cancellationMetadata(
            actorId: actorId,
            actorName: actorName.isEmpty ? actorId : actorName,
            source: 'calymob',
            reason: 'parent_withdrawal',
            appVersion: appVersion,
          ),
        );
      }
      await batch.commit();
      debugPrint(
        '✅ ${snapshot.docs.length} invité(s) désinscrit(s) avec historique',
      );
      return snapshot.docs.length;
    } catch (e) {
      debugPrint('❌ Erreur deleteGuestsForParentInscription: $e');
      rethrow;
    }
  }

  /// Transfère les invités liés à une inscription parente vers
  /// l'organisateur de l'événement. Utilisé quand un membre se
  /// désinscrit mais veut que ses invités restent inscrits.
  /// Le nouveau parent reçoit la facture groupée.
  ///
  /// Si [organisateurInscriptionId] est null, les invités deviennent
  /// orphelins (parent_inscription_id mis à null) — ils restent dans
  /// la liste mais le paiement doit être géré séparément.
  Future<int> transferGuestsToParent({
    required String clubId,
    required String operationId,
    required String oldParentInscriptionId,
    required String? newParentInscriptionId,
    required String? newParentUserId,
    required String? newParentDisplayName,
  }) async {
    try {
      final appVersion = await _appVersion();
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .where('parent_inscription_id', isEqualTo: oldParentInscriptionId)
          .get();

      final batch = _firestore.batch();
      for (final doc in snapshot.docs) {
        if (doc.data()['registration_status'] == 'canceled') continue;
        final actorId = doc.data()['added_by'] as String? ??
            newParentUserId ??
            'unknown-member';
        final actorName = doc.data()['added_by_name'] as String? ??
            newParentDisplayName ??
            actorId;
        batch.update(doc.reference, {
          'parent_inscription_id': newParentInscriptionId,
          if (newParentUserId != null) 'added_by': newParentUserId,
          if (newParentDisplayName != null)
            'added_by_name': newParentDisplayName,
          'updated_at': FieldValue.serverTimestamp(),
          ..._actionMetadata(
            action: 'guest_transferred',
            actorId: actorId,
            actorName: actorName,
            source: 'calymob',
            reason: 'parent_withdrawal_transfer',
            appVersion: appVersion,
          ),
        });
      }
      await batch.commit();
      debugPrint(
        '✅ ${snapshot.docs.length} invité(s) transféré(s) vers $newParentInscriptionId',
      );
      return snapshot.docs.length;
    } catch (e) {
      debugPrint('❌ Erreur transferGuestsToParent: $e');
      rethrow;
    }
  }

  /// Trouve l'inscription d'un utilisateur (membre) à un événement.
  /// Utile pour récupérer l'inscription de l'organisateur lors d'un
  /// transfert d'invités.
  Future<ParticipantOperation?> findInscriptionForUser({
    required String clubId,
    required String operationId,
    required String userId,
  }) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .where('membre_id', isEqualTo: userId)
          .get();
      for (final document in snapshot.docs) {
        final inscription = ParticipantOperation.fromFirestore(document);
        if (inscription.registrationStatus != 'canceled') return inscription;
      }
      return null;
    } catch (e) {
      debugPrint('❌ Erreur findInscriptionForUser: $e');
      return null;
    }
  }

  /// Update supplements on an existing inscription (F3.6 edit inscription)
  Future<void> updateInscriptionSupplements({
    required String clubId,
    required String operationId,
    required String inscriptionDocId,
    required List<SelectedSupplement> selectedSupplements,
    required double supplementTotal,
  }) async {
    final reference = _firestore
        .collection('clubs/$clubId/operations/$operationId/inscriptions')
        .doc(inscriptionDocId);
    final snapshot = await reference.get();
    if (!snapshot.exists) throw Exception('Inscription non trouvée');
    final data = snapshot.data()!;
    final actorId = data['membre_id'] as String? ?? 'unknown-member';
    final actorName =
        '${data['membre_prenom'] ?? ''} ${data['membre_nom'] ?? ''}'.trim();
    final appVersion = await _appVersion();
    await reference.update({
      'selected_supplements':
          selectedSupplements.map((s) => s.toMap()).toList(),
      'supplement_total': supplementTotal,
      'updated_at': FieldValue.serverTimestamp(),
      ..._actionMetadata(
        action: 'updated',
        actorId: actorId,
        actorName: actorName.isEmpty ? actorId : actorName,
        source: 'calymob',
        reason: 'supplements_updated',
        appVersion: appVersion,
      ),
    });
  }

  /// Obtenir les participants d'une opération (one-time read)
  /// Uses subcollection: clubs/{clubId}/operations/{operationId}/inscriptions
  Future<List<ParticipantOperation>> getParticipants(
    String clubId,
    String operationId,
  ) async {
    try {
      debugPrint(
        '🔍 Recherche participants dans subcollection inscriptions pour operation_id: $operationId',
      );

      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .get();

      final participants = snapshot.docs
          .map((doc) => ParticipantOperation.fromFirestore(doc))
          .where(
            (participant) =>
                participant.registrationStatus != 'canceled' &&
                !participant.isWaitlisted,
          )
          .toList();

      // Sort by first name (prénom), then last name — diacritics-insensitive
      sortParticipantsByName(participants);

      debugPrint(
        '👥 ${participants.length} participants chargés pour $operationId',
      );
      return participants;
    } catch (e) {
      debugPrint('❌ Erreur chargement participants: $e');
      return [];
    }
  }

  /// Stream des participants d'une opération (real-time updates)
  /// Listens to changes in inscriptions subcollection for live payment status updates
  Stream<List<ParticipantOperation>> getParticipantsStream(
    String clubId,
    String operationId,
  ) {
    return _firestore
        .collection('clubs/$clubId/operations/$operationId/inscriptions')
        .snapshots()
        .map((snapshot) {
      final participants = snapshot.docs
          .map((doc) => ParticipantOperation.fromFirestore(doc))
          .where(
            (participant) =>
                participant.registrationStatus != 'canceled' &&
                !participant.isWaitlisted,
          )
          .toList();

      // Sort by first name (prénom), then last name — diacritics-insensitive
      sortParticipantsByName(participants);

      debugPrint(
        '👥 [Stream] ${participants.length} participants mis à jour pour $operationId',
      );
      return participants;
    });
  }

  /// Mettre à jour les exercices sélectionnés pour une inscription
  Future<void> updateExercices({
    required String clubId,
    required String operationId,
    required String userId,
    required List<String> exercices,
  }) async {
    try {
      final appVersion = await _appVersion();
      // Trouver l'inscription
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .where('membre_id', isEqualTo: userId)
          .get();

      if (snapshot.docs.isEmpty) {
        throw Exception('Inscription non trouvée');
      }

      final registration = snapshot.docs.firstWhere(
        (candidate) => candidate.data()['registration_status'] != 'canceled',
        orElse: () => throw Exception('Inscription active non trouvée'),
      );
      final data = registration.data();
      final actorName =
          '${data['membre_prenom'] ?? ''} ${data['membre_nom'] ?? ''}'.trim();
      // Mettre à jour les exercices
      await registration.reference.update({
        'exercices': exercices,
        'updated_at': FieldValue.serverTimestamp(),
        ..._actionMetadata(
          action: 'updated',
          actorId: userId,
          actorName: actorName.isEmpty ? userId : actorName,
          source: 'calymob',
          reason: 'exercises_updated',
          appVersion: appVersion,
        ),
      });

      debugPrint('✅ Exercices mis à jour: ${exercices.length} exercices');
    } catch (e) {
      debugPrint('❌ Erreur mise à jour exercices: $e');
      rethrow;
    }
  }

  /// Obtenir l'inscription d'un utilisateur
  Future<ParticipantOperation?> getUserInscription({
    required String clubId,
    required String operationId,
    required String userId,
  }) async {
    try {
      return await getUserInscriptionStrict(
        clubId: clubId,
        operationId: operationId,
        userId: userId,
      );
    } catch (e) {
      debugPrint('❌ Erreur récupération inscription: $e');
      return null;
    }
  }

  /// Strict variant used after a mutation: read failures must remain visible.
  ///
  /// Legacy data can contain multiple active documents for one member. The
  /// canonical document is deterministic: an actual registration wins over a
  /// waitlist entry, then the newest registration date wins, followed by the
  /// lexicographically smallest document ID as a stable tie-breaker.
  Future<ParticipantOperation?> getUserInscriptionStrict({
    required String clubId,
    required String operationId,
    required String userId,
  }) async {
    final snapshot = await _firestore
        .collection('clubs/$clubId/operations/$operationId/inscriptions')
        .where('membre_id', isEqualTo: userId)
        .get();
    final activeDocuments = snapshot.docs
        .where((document) =>
            document.data()['registration_status'] != 'canceled')
        .toList()
      ..sort(_compareCanonicalUserInscriptions);
    if (activeDocuments.isEmpty) return null;
    return ParticipantOperation.fromFirestore(activeDocuments.first);
  }

  static int _compareCanonicalUserInscriptions(
    QueryDocumentSnapshot<Map<String, dynamic>> left,
    QueryDocumentSnapshot<Map<String, dynamic>> right,
  ) {
    final leftWaitlisted =
        left.data()['registration_status'] == 'waitlisted' ? 1 : 0;
    final rightWaitlisted =
        right.data()['registration_status'] == 'waitlisted' ? 1 : 0;
    final byClass = leftWaitlisted.compareTo(rightWaitlisted);
    if (byClass != 0) return byClass;

    final byDate = _registrationDateSortKey(right.data()).compareTo(
      _registrationDateSortKey(left.data()),
    );
    if (byDate != 0) return byDate;
    return left.id.compareTo(right.id);
  }

  static int _registrationDateSortKey(Map<String, dynamic> data) {
    final value = data['date_inscription'] ?? data['created_at'];
    if (value is Timestamp) return value.millisecondsSinceEpoch;
    if (value is DateTime) return value.millisecondsSinceEpoch;
    return _missingRegistrationDateSortKey;
  }

  /// Marquer une inscription comme présent
  /// Sets present=true with timestamp and user info
  Future<void> markAsPresent({
    required String clubId,
    required String operationId,
    required String memberId,
    required String markedByUserId,
    required String markedByUserName,
  }) async {
    try {
      final appVersion = await _appVersion();
      // Find the inscription
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .where('membre_id', isEqualTo: memberId)
          .get();

      if (snapshot.docs.isEmpty) {
        throw Exception('Inscription non trouvée');
      }

      // Update the inscription with present info
      final registration = snapshot.docs.firstWhere(
        (candidate) => candidate.data()['registration_status'] != 'canceled',
        orElse: () => throw Exception('Inscription active non trouvée'),
      );
      await registration.reference.update({
        'present': true,
        'present_at': FieldValue.serverTimestamp(),
        'present_by': markedByUserId,
        'present_by_name': markedByUserName,
        'updated_at': FieldValue.serverTimestamp(),
        ..._actionMetadata(
          action: 'updated',
          actorId: markedByUserId,
          actorName: markedByUserName,
          source: 'calymob_scanner',
          reason: 'presence_marked',
          actorRole: 'scanner',
          appVersion: appVersion,
        ),
      });

      debugPrint(
        '✅ Membre $memberId marqué présent pour opération $operationId',
      );
    } catch (e) {
      debugPrint('❌ Erreur marquage présent: $e');
      rethrow;
    }
  }

  /// Créer une inscription "walk-in" (sur place) avec présence déjà marquée
  /// Used when scanning a member who wasn't pre-registered
  Future<void> createWalkInInscription({
    required String clubId,
    required String operationId,
    required String operationTitle,
    required MemberProfile member,
    required String markedByUserId,
    required String markedByUserName,
  }) async {
    try {
      final appVersion = await _appVersion();
      // Load the operation to compute the correct tariff for this member.
      // Falling back to 0 silently leaves treasurer cleanup work — better
      // to write the proper price upfront whenever we can.
      double prix = 0.0;
      try {
        final opSnap = await _firestore
            .collection('clubs/$clubId/operations')
            .doc(operationId)
            .get();
        if (opSnap.exists) {
          final operation = Operation.fromFirestore(opSnap);
          prix = TariffUtils.computeRegistrationPrice(
            operation: operation,
            profile: member,
          );
          debugPrint('💰 Walk-in prix calculé: $prix€ pour ${member.fullName}');
        } else {
          debugPrint('⚠️ Walk-in: opération $operationId introuvable, prix=0');
        }
      } catch (e) {
        // Don't block the walk-in if tariff lookup fails — better to have
        // the inscription saved with prix=0 than to refuse the scan.
        debugPrint('⚠️ Walk-in: échec calcul tarif ($e), prix=0');
      }

      // Create inscription with present=true
      final inscriptionData = {
        'operation_id': operationId,
        'operation_titre': operationTitle,
        'membre_id': member.id,
        'membre_nom': member.nom,
        'membre_prenom': member.prenom,
        'prix': prix,
        'paye': false,
        'date_inscription': FieldValue.serverTimestamp(),
        // Already present (scanned)
        'present': true,
        'present_at': FieldValue.serverTimestamp(),
        'present_by': markedByUserId,
        'present_by_name': markedByUserName,
        // Walk-in marker
        'walk_in': true,
        'created_at': FieldValue.serverTimestamp(),
        'updated_at': FieldValue.serverTimestamp(),
        'created_by': markedByUserId,
        'created_by_name': markedByUserName,
        'created_source': 'calymob_scanner',
        if (appVersion != null) 'created_app_version': appVersion,
        ..._actionMetadata(
          action: 'registered',
          actorId: markedByUserId,
          actorName: markedByUserName,
          source: 'calymob_scanner',
          reason: 'walk_in_scan',
          actorRole: 'scanner',
          appVersion: appVersion,
        ),
      };

      await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .add(inscriptionData);

      debugPrint(
        '✅ Inscription walk-in créée: ${member.fullName} → $operationTitle ($prix€)',
      );
    } catch (e) {
      debugPrint('❌ Erreur création inscription walk-in: $e');
      rethrow;
    }
  }

  /// Désinscrire un membre après un scan (correction d'erreur).
  ///
  /// Stratégie :
  /// - Si l'inscription est un walk-in créé par le scanner ET non payée → on
  ///   la marque annulée, sans jamais effacer l'inscription ni sa trace.
  /// - Sinon (inscription pré-existante ou déjà payée) → on réinitialise
  ///   uniquement les champs de présence (`present`, `present_at`,
  ///   `present_by`, `present_by_name`). L'inscription elle-même reste.
  ///
  /// Retourne un [UnmarkPresentResult] qui permet de restaurer l'état
  /// précédent (undo) pendant ~5 secondes côté UI.
  Future<UnmarkPresentResult> unmarkAsPresent({
    required String clubId,
    required String operationId,
    required String memberId,
  }) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .where('membre_id', isEqualTo: memberId)
          .get();

      if (snapshot.docs.isEmpty) {
        throw Exception('Inscription non trouvée');
      }

      final doc = snapshot.docs.firstWhere(
        (candidate) => candidate.data()['registration_status'] != 'canceled',
        orElse: () => throw Exception('Inscription active non trouvée'),
      );
      final data = doc.data();
      final isWalkIn = data['walk_in'] == true;
      final isPaid = data['paye'] == true;

      if (isWalkIn && !isPaid) {
        final actorId = data['present_by'] as String? ?? 'unknown-scanner';
        final actorName = data['present_by_name'] as String? ?? actorId;
        final appVersion = await _appVersion();
        await doc.reference.update({
          ..._cancellationMetadata(
            actorId: actorId,
            actorName: actorName,
            source: 'calymob_scanner',
            reason: 'walk_in_scan_undo',
            actorRole: 'scanner',
            appVersion: appVersion,
          ),
          'present': false,
          'present_at': FieldValue.delete(),
          'present_by': FieldValue.delete(),
          'present_by_name': FieldValue.delete(),
        });
        debugPrint(
          '✅ Walk-in inscription annulée avec historique: member $memberId',
        );
        return UnmarkPresentResult(
          deletedInscription: true,
          inscriptionId: doc.id,
          previousData: Map<String, dynamic>.from(data),
        );
      }

      // Keep inscription, just reset present fields
      final previousPresent = data['present'];
      final previousPresentAt = data['present_at'];
      final previousPresentBy = data['present_by'];
      final previousPresentByName = data['present_by_name'];
      final actorId = previousPresentBy as String? ?? 'unknown-scanner';
      final actorName = previousPresentByName as String? ?? actorId;
      final appVersion = await _appVersion();

      await doc.reference.update({
        'present': false,
        'present_at': FieldValue.delete(),
        'present_by': FieldValue.delete(),
        'present_by_name': FieldValue.delete(),
        'updated_at': FieldValue.serverTimestamp(),
        ..._actionMetadata(
          action: 'updated',
          actorId: actorId,
          actorName: actorName,
          source: 'calymob_scanner',
          reason: 'presence_unmarked',
          actorRole: 'scanner',
          appVersion: appVersion,
        ),
      });

      debugPrint(
        '✅ Présence annulée pour member $memberId (inscription conservée)',
      );
      return UnmarkPresentResult(
        deletedInscription: false,
        inscriptionId: doc.id,
        previousData: {
          'present': previousPresent,
          'present_at': previousPresentAt,
          'present_by': previousPresentBy,
          'present_by_name': previousPresentByName,
        },
      );
    } catch (e) {
      debugPrint('❌ Erreur annulation présence: $e');
      rethrow;
    }
  }

  /// Restaure l'état précédent après un [unmarkAsPresent] — utilisé pour
  /// l'action "Annuler" dans le snackbar après désinscription.
  Future<void> restoreFromUnmark({
    required String clubId,
    required String operationId,
    required UnmarkPresentResult result,
  }) async {
    try {
      final inscriptionsRef = _firestore.collection(
        'clubs/$clubId/operations/$operationId/inscriptions',
      );

      if (result.deletedInscription) {
        // Restore the preserved walk-in instead of recreating a deleted doc.
        final actorId =
            result.previousData['present_by'] as String? ?? 'unknown-scanner';
        final actorName =
            result.previousData['present_by_name'] as String? ?? actorId;
        final appVersion = await _appVersion();
        await inscriptionsRef.doc(result.inscriptionId).update({
          'registration_status':
              result.previousData['registration_status'] ?? 'confirmed',
          'present': result.previousData['present'] ?? true,
          if (result.previousData['present_at'] != null)
            'present_at': result.previousData['present_at'],
          if (result.previousData['present_by'] != null)
            'present_by': result.previousData['present_by'],
          if (result.previousData['present_by_name'] != null)
            'present_by_name': result.previousData['present_by_name'],
          'canceled_at': FieldValue.delete(),
          'canceled_by': FieldValue.delete(),
          'canceled_by_name': FieldValue.delete(),
          'canceled_by_role': FieldValue.delete(),
          'canceled_source': FieldValue.delete(),
          'canceled_app_version': FieldValue.delete(),
          'canceled_reason': FieldValue.delete(),
          'updated_at': FieldValue.serverTimestamp(),
          ..._actionMetadata(
            action: 're_registered',
            actorId: actorId,
            actorName: actorName,
            source: 'calymob_scanner',
            reason: 'walk_in_scan_undo_reverted',
            actorRole: 'scanner',
            appVersion: appVersion,
          ),
        });
        debugPrint('↩️ Walk-in inscription restaurée: ${result.inscriptionId}');
      } else {
        // Restore the present fields on the existing inscription
        final actorId =
            result.previousData['present_by'] as String? ?? 'unknown-scanner';
        final actorName =
            result.previousData['present_by_name'] as String? ?? actorId;
        final appVersion = await _appVersion();
        final update = <String, dynamic>{
          'present': result.previousData['present'] ?? true,
          'updated_at': FieldValue.serverTimestamp(),
          ..._actionMetadata(
            action: 'updated',
            actorId: actorId,
            actorName: actorName,
            source: 'calymob_scanner',
            reason: 'presence_unmark_reverted',
            actorRole: 'scanner',
            appVersion: appVersion,
          ),
        };
        if (result.previousData['present_at'] != null) {
          update['present_at'] = result.previousData['present_at'];
        }
        if (result.previousData['present_by'] != null) {
          update['present_by'] = result.previousData['present_by'];
        }
        if (result.previousData['present_by_name'] != null) {
          update['present_by_name'] = result.previousData['present_by_name'];
        }
        await inscriptionsRef.doc(result.inscriptionId).update(update);
        debugPrint(
          '↩️ Présence restaurée pour inscription ${result.inscriptionId}',
        );
      }
    } catch (e) {
      debugPrint('❌ Erreur restauration: $e');
      rethrow;
    }
  }

  /// Confirme un paiement sur place via la commande serveur autorisée.
  /// Le serveur possède les écritures comptables et l'idempotence.
  Future<void> markParticipantAsPaid({
    required String clubId,
    required String operationId,
    required String participantId,
  }) async {
    await _functions.httpsCallable('recordOnSitePayment').call({
      'clubId': clubId,
      'operationId': operationId,
      'participantId': participantId,
    });
  }

  /// Confirme uniquement la tranche demandée; le serveur contrôle les soldes.
  Future<void> markInstallmentAsPaid({
    required String clubId,
    required String operationId,
    required String participantId,
    required String installmentId,
  }) async {
    await _functions.httpsCallable('recordInstallmentPayment').call({
      'clubId': clubId,
      'operationId': operationId,
      'participantId': participantId,
      'installmentId': installmentId,
    });
  }

  /// Enregistre une communication QR, jamais un règlement comptable.
  /// La vérification locale informe rapidement l'utilisateur; le serveur doit
  /// revérifier les conditions et préserver un paiement déjà réglé.
  Future<void> updatePaymentStatus({
    required String clubId,
    required String operationId,
    required String participantId,
    required String status,
  }) async {
    final requiredMethod = switch (status) {
      'qr_on_site' => 'on_site',
      'qr_email_sent' => 'qr_email',
      _ => throw ArgumentError.value(
          status,
          'status',
          'Communication QR invalide',
        ),
    };
    final operationSnapshot =
        await _firestore.doc('clubs/$clubId/operations/$operationId').get();
    if (!operationSnapshot.exists) {
      throw StateError('Activité introuvable.');
    }
    final operationData = operationSnapshot.data()!;
    final paymentRequired = operationData.containsKey('payment_required')
        ? operationData['payment_required'] == true
        : ((operationData['prix_membre'] as num?) ?? 0) > 0 ||
            ((operationData['event_tariffs'] as List?) ?? const [])
                .whereType<Map>()
                .any((tariff) => ((tariff['price'] as num?) ?? 0) > 0);
    final allowedMethods = (operationData['allowed_payment_methods'] as List?)
            ?.whereType<String>()
            .toSet() ??
        const {'qr_immediate', 'qr_email', 'on_site'};
    if (!paymentRequired || !allowedMethods.contains(requiredMethod)) {
      throw const PaymentMethodNotAllowedException();
    }
    await _functions.httpsCallable('recordPaymentCommunication').call({
      'clubId': clubId,
      'operationId': operationId,
      'participantId': participantId,
      'status': status,
    });
  }

  /// Créer une inscription pour un invité (non-membre)
  ///
  /// Both member-linked and standalone staff guests go through the callable;
  /// price, capacity and authorization are never decided by this client.
  Future<void> createGuestInscription({
    required String clubId,
    required String operationId,
    required String operationTitle,
    required String guestPrenom,
    required String guestNom,
    required double prix,
    required String addedByUserId,
    required String addedByUserName,

    /// When set, links this guest to the inviting member's own inscription.
    /// Used by the member-driven flow in CalyMob (allow_guests=true events).
    /// Null selects the server-authorized standalone staff flow.
    String? parentInscriptionId,

    /// ID of the Tariff entry from operation.event_tariffs[] used to compute
    /// this guest's price ("Invité adulte" / "Invité enfant" / etc.).
    String? tariffId,

    /// Optional supplements selected for this guest (same supplements list
    /// the inviting member sees). Stored exactly like a member's supplements
    /// so totalPrix = prix + supplement_total works automatically and the
    /// parent's aggregated QR includes them.
    List<SelectedSupplement>? selectedSupplements,
    double? supplementTotal,
    String? requestId,
    String? payloadFingerprint,
  }) async {
    try {
      final appVersion = await _appVersion();
      final supplements = selectedSupplements ?? const <SelectedSupplement>[];
      final fingerprint = payloadFingerprint ??
          guestRequestPayloadFingerprint(
            clubId: clubId,
            operationId: operationId,
            parentInscriptionId: parentInscriptionId,
            guestPrenom: guestPrenom,
            guestNom: guestNom,
            tariffId: tariffId,
            selectedSupplements: supplements,
          );
      final payload = <String, dynamic>{
        'clubId': clubId,
        'operationId': operationId,
        if (parentInscriptionId != null)
          'parentInscriptionId': parentInscriptionId,
        'requestId': requestId ?? _newRegistrationRequestId(),
        'payloadFingerprint': fingerprint,
        'guest': {
          'firstName': guestPrenom,
          'lastName': guestNom,
          if (tariffId != null) 'tariffId': tariffId,
          'selectedSupplementIds':
              supplements.map((supplement) => supplement.id).toList(),
        },
        'source': 'calymob',
        if (appVersion != null) 'appVersion': appVersion,
      };
      final invoker = _addGuestToEventInvoker;
      if (invoker != null) {
        await invoker(payload);
      } else {
        await _functions.httpsCallable('addGuestToEvent').call(payload);
      }
    } catch (e) {
      debugPrint('❌ Erreur création inscription invité: $e');
      rethrow;
    }
  }

  /// Stream van alle inscriptions van een gebruiker met bijbehorende Operation data
  /// Uses collectionGroup query to find all inscriptions across all operations
  Stream<List<UserEventRegistration>> getUserRegistrationsStream(
    String clubId,
    String userId,
  ) {
    return _firestore
        .collectionGroup('inscriptions')
        .where('membre_id', isEqualTo: userId)
        .snapshots()
        .asyncMap((snapshot) async {
      final registrations = <UserEventRegistration>[];

      for (var doc in snapshot.docs) {
        try {
          // Verify this inscription belongs to the correct club
          final path = doc.reference.path;
          if (!path.startsWith('clubs/$clubId/')) continue;

          final participant = ParticipantOperation.fromFirestore(doc);
          if (participant.registrationStatus == 'canceled') continue;

          // Get parent operation document
          final operationRef = doc.reference.parent.parent;
          if (operationRef == null) continue;

          final operationDoc = await operationRef.get();
          if (!operationDoc.exists) continue;

          final operation = Operation.fromFirestore(operationDoc);

          registrations.add(
            UserEventRegistration(
              operation: operation,
              participant: participant,
            ),
          );
        } catch (e) {
          debugPrint('⚠️ Erreur parsing registration: $e');
          // Continue with next registration
        }
      }

      // Sort by date (upcoming first)
      registrations.sort((a, b) {
        final dateA = a.operation.dateDebut ?? DateTime(2100);
        final dateB = b.operation.dateDebut ?? DateTime(2100);
        return dateA.compareTo(dateB);
      });

      debugPrint(
        '📋 ${registrations.length} inscriptions chargées pour user $userId',
      );
      return registrations;
    });
  }

  /// Stream van deelnemers die present zijn (voor live scanner lijst)
  /// Returns participants ordered by presentAt descending (newest first)
  Stream<List<ParticipantOperation>> getPresentParticipantsStream(
    String clubId,
    String operationId,
  ) {
    return _firestore
        .collection('clubs/$clubId/operations/$operationId/inscriptions')
        .where('present', isEqualTo: true)
        .snapshots()
        .map((snapshot) {
      final participants = snapshot.docs
          .map((doc) => ParticipantOperation.fromFirestore(doc))
          .where((participant) => participant.registrationStatus != 'canceled')
          .toList();

      // Sort by presentAt descending (newest first)
      participants.sort((a, b) {
        final aTime = a.presentAt ?? DateTime(2000);
        final bTime = b.presentAt ?? DateTime(2000);
        return bTime.compareTo(aTime);
      });

      return participants;
    });
  }

  // ============================================================
  // EVENT CREATION & UPDATE
  // ============================================================

  /// Mettre à jour une opération/événement dans Firestore
  Future<void> updateOperation({
    required String clubId,
    required String operationId,
    required Map<String, dynamic> data,
  }) async {
    try {
      await _firestore
          .collection('clubs/$clubId/operations')
          .doc(operationId)
          .update({...data, 'updated_at': FieldValue.serverTimestamp()});
      debugPrint('✅ Opération mise à jour: $operationId');
    } catch (e) {
      debugPrint('❌ Erreur mise à jour opération: $e');
      rethrow;
    }
  }

  /// Annuler une opération sans supprimer son contexte ni ses sous-collections.
  /// Les inscriptions et leurs journaux restent ainsi toujours consultables.
  Future<void> deleteOperation({
    required String clubId,
    required String operationId,
    required String actorId,
    required String actorName,
  }) async {
    try {
      final operationRef =
          _firestore.collection('clubs/$clubId/operations').doc(operationId);
      final appVersion = await _appVersion();
      await operationRef.update({
        'statut': 'annule',
        'updated_at': FieldValue.serverTimestamp(),
        'canceled_at': FieldValue.serverTimestamp(),
        'canceled_by': actorId,
        'canceled_by_name': actorName,
        'canceled_by_role': 'organizer',
        'canceled_source': 'calymob',
        if (appVersion != null) 'canceled_app_version': appVersion,
        'canceled_reason': 'explicit_event_removal',
      });
      debugPrint('✅ Opération annulée, historique conservé: $operationId');
    } catch (e) {
      debugPrint('❌ Erreur annulation opération: $e');
      rethrow;
    }
  }

  /// Créer une opération/événement dans Firestore
  /// Returns the document ID of the created operation
  Future<String> createOperation({
    required String clubId,
    required Map<String, dynamic> data,
  }) async {
    try {
      final docRef =
          await _firestore.collection('clubs/$clubId/operations').add({
        ...data,
        'created_at': FieldValue.serverTimestamp(),
        'updated_at': FieldValue.serverTimestamp(),
      });

      debugPrint('✅ Opération créée: ${docRef.id} - ${data['titre']}');
      return docRef.id;
    } catch (e) {
      debugPrint('❌ Erreur création opération: $e');
      rethrow;
    }
  }

  /// Generate a unique event number for bank reconciliation
  /// Format: PXXXX for dive events (plongee), SXXXX for other events (sortie)
  /// Uses base-26 letter encoding (A-Z, 4 digits)
  /// Examples: PAAAB (dive #1), PAAAG (dive #6), SAAAE (sortie #4)
  Future<String> generateEventNumber(String clubId, bool isDiveEvent) async {
    final prefix = isDiveEvent ? 'P' : 'S';

    try {
      // Query all operations with event_number in this prefix range
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations')
          .where('event_number', isGreaterThanOrEqualTo: '${prefix}AAAA')
          .where('event_number', isLessThanOrEqualTo: '${prefix}ZZZZ')
          .orderBy('event_number', descending: true)
          .limit(1)
          .get();

      if (snapshot.docs.isEmpty) {
        // First event of this type - start at 1 (AAAB)
        return prefix + _numberToLetterCode(1);
      }

      // Get the highest event_number and increment
      final lastNumber = snapshot.docs.first.data()['event_number'] as String;
      final lastCode = lastNumber.substring(1); // Remove prefix
      final nextNumber = _letterCodeToNumber(lastCode) + 1;

      return prefix + _numberToLetterCode(nextNumber);
    } catch (e) {
      debugPrint('⚠️ Error generating event number, using fallback: $e');
      // Fallback: timestamp-based
      final ts =
          DateTime.now().millisecondsSinceEpoch % 456976; // max for 4 letters
      return prefix + _numberToLetterCode(ts);
    }
  }

  /// Convert number to 4-letter base-26 code (AAAA = 0, AAAB = 1, etc.)
  static String _numberToLetterCode(int number) {
    final d = number % 26;
    final c = (number ~/ 26) % 26;
    final b = (number ~/ (26 * 26)) % 26;
    final a = (number ~/ (26 * 26 * 26)) % 26;

    return String.fromCharCodes([
      65 + a, // A=65
      65 + b,
      65 + c,
      65 + d,
    ]);
  }

  /// Convert 4-letter base-26 code back to number
  static int _letterCodeToNumber(String code) {
    if (code.length != 4) return 0;
    return (code.codeUnitAt(0) - 65) * 26 * 26 * 26 +
        (code.codeUnitAt(1) - 65) * 26 * 26 +
        (code.codeUnitAt(2) - 65) * 26 +
        (code.codeUnitAt(3) - 65);
  }

  /// Copy tariffs from a location with new unique IDs
  static List<Map<String, dynamic>> copyTariffsFromLocation(
    List<Tariff> locationTariffs,
  ) {
    final ts = DateTime.now().millisecondsSinceEpoch;
    return locationTariffs.asMap().entries.map((entry) {
      final index = entry.key;
      final tariff = entry.value;
      return {
        'id': 'tariff_${ts}_$index',
        'label': tariff.label,
        'category': tariff.category,
        'price': tariff.price,
        'is_default': tariff.isDefault,
        'display_order': tariff.displayOrder,
      };
    }).toList();
  }

  /// Compute budget prévisionnel from tariffs and capacity
  static double computeBudgetPrevu(List<Tariff> tariffs, int? capaciteMax) {
    if (tariffs.isEmpty || capaciteMax == null || capaciteMax <= 0) return 0;
    final totalPrice = tariffs.fold<double>(0, (total, t) => total + t.price);
    final avgPrice = totalPrice / tariffs.length;
    return (avgPrice * capaciteMax * 100).roundToDouble() / 100;
  }

  /// Async variant voor refresh (one-time load)
  Future<List<UserEventRegistration>> getUserRegistrations(
    String clubId,
    String userId,
  ) async {
    try {
      final snapshot = await _firestore
          .collectionGroup('inscriptions')
          .where('membre_id', isEqualTo: userId)
          .get();

      final registrations = <UserEventRegistration>[];

      for (var doc in snapshot.docs) {
        try {
          // Verify this inscription belongs to the correct club
          final path = doc.reference.path;
          if (!path.startsWith('clubs/$clubId/')) continue;

          final participant = ParticipantOperation.fromFirestore(doc);
          if (participant.registrationStatus == 'canceled') continue;

          // Get parent operation document
          final operationRef = doc.reference.parent.parent;
          if (operationRef == null) continue;

          final operationDoc = await operationRef.get();
          if (!operationDoc.exists) continue;

          final operation = Operation.fromFirestore(operationDoc);

          registrations.add(
            UserEventRegistration(
              operation: operation,
              participant: participant,
            ),
          );
        } catch (e) {
          debugPrint('⚠️ Erreur parsing registration: $e');
          // Continue with next registration
        }
      }

      // Sort by date (upcoming first)
      registrations.sort((a, b) {
        final dateA = a.operation.dateDebut ?? DateTime(2100);
        final dateB = b.operation.dateDebut ?? DateTime(2100);
        return dateA.compareTo(dateB);
      });

      debugPrint(
        '📋 ${registrations.length} inscriptions chargées pour user $userId',
      );
      return registrations;
    } catch (e) {
      debugPrint('❌ Erreur chargement inscriptions utilisateur: $e');
      return [];
    }
  }

  /// Récupère les opérations (évènements) auxquelles ce membre a été marqué
  /// présent dans les [days] derniers jours, triées par date descendante.
  ///
  /// Utilisé par le picker de self-declaration (CalyMob "Je l'ai fait"-flow).
  /// Filtre sur `present == true` pour ne garder que les évènements où le
  /// membre était effectivement présent (pas seulement inscrit).
  Future<List<Operation>> getRecentAttendedOperations({
    required String clubId,
    required String memberId,
    int days = 30,
  }) async {
    try {
      final now = DateTime.now();
      final cutoff = now.subtract(Duration(days: days));

      // 1. Load all events starting in the last N days
      final snapshot = await _firestore
          .collection('clubs/$clubId/operations')
          .where('type', isEqualTo: 'evenement')
          .where(
            'date_debut',
            isGreaterThanOrEqualTo: Timestamp.fromDate(cutoff),
          )
          .where('date_debut', isLessThanOrEqualTo: Timestamp.fromDate(now))
          .orderBy('date_debut', descending: true)
          .get();

      final operations =
          snapshot.docs.map((doc) => Operation.fromFirestore(doc)).toList();

      if (operations.isEmpty) {
        debugPrint('📅 Aucun évènement dans les $days derniers jours');
        return [];
      }

      // 2. For each operation check presence in parallel
      final checks = await Future.wait(
        operations.map((op) async {
          try {
            final inscriptionSnap = await _firestore
                .collection('clubs/$clubId/operations/${op.id}/inscriptions')
                .where('membre_id', isEqualTo: memberId)
                .where('present', isEqualTo: true)
                .limit(1)
                .get();
            return inscriptionSnap.docs.any((document) =>
                    document.data()['registration_status'] != 'canceled')
                ? op
                : null;
          } catch (_) {
            // Fallback if composite index missing: filter client-side
            final all = await _firestore
                .collection('clubs/$clubId/operations/${op.id}/inscriptions')
                .where('membre_id', isEqualTo: memberId)
                .limit(1)
                .get();
            if (all.docs.isEmpty) return null;
            return all.docs.any((document) =>
                    document.data()['present'] == true &&
                    document.data()['registration_status'] != 'canceled')
                ? op
                : null;
          }
        }),
      );

      final attended = checks.whereType<Operation>().toList();
      debugPrint(
        '📅 ${attended.length}/${operations.length} évènements attendus par $memberId',
      );
      return attended;
    } catch (e) {
      debugPrint('❌ Erreur getRecentAttendedOperations: $e');
      return [];
    }
  }

  // ============================================================
  // INSCRIPTION EDITING — updateMyInscription, updateGuestInscription, removeOneGuest
  // ============================================================

  /// Update the user's own inscription (supplements, guests, delivery address).
  ///
  /// Uses a Firestore batch for atomic writes:
  /// 1. Update parent inscription doc (supplements, total, delivery address)
  /// 2. Upsert new guest inscriptions (GuestUpdate without inscriptionId)
  /// 3. Update existing guest inscriptions (GuestUpdate with inscriptionId)
  /// 4. Delete guest inscriptions (guestIdsToRemove)
  /// 5. Write edit_history entries
  ///
  /// If the price decreases AND the inscription was paid, calls
  /// [RefundService.createInscriptionRefund] after batch commit with an
  /// idempotency key to prevent duplicate refund requests.
  ///
  /// Returns the delta (oldTotal - newTotal). Positive means price decreased
  /// (refund may be needed), negative means price increased.
  /// [forceRefundClaim]: when true, a refund demande is created even if
  /// the parent inscription is not yet marked as paid (`paye=false`).
  /// Used for the "déjà payé, paiement pas encore importé" scenario
  /// where the member has actually paid via bank transfer but the
  /// transaction hasn't been imported/matched yet. The resulting demande
  /// is created with status `a_verifier_paiement` so the admin validates
  /// it against the bank statement. When false (default), the legacy
  /// behaviour applies: refund only when paye=true.
  Future<double> updateMyInscription({
    required String clubId,
    required String operationId,
    required String inscriptionId,
    required List<SelectedSupplement> selectedSupplements,
    required double supplementTotal,
    List<GuestUpdate>? guests,
    List<String>? guestIdsToRemove,
    String? deliveryAddress,
    bool forceRefundClaim = false,
  }) async {
    // Read operation to check deadline
    final operationRef =
        _firestore.collection('clubs/$clubId/operations').doc(operationId);
    final operationSnap = await operationRef.get();
    if (!operationSnap.exists) {
      throw Exception('Opération introuvable');
    }
    final operation = Operation.fromFirestore(operationSnap);
    if (operation.effectiveDeadline != null &&
        DateTime.now().isAfter(operation.effectiveDeadline!)) {
      throw Exception('Le délai de modification est dépassé');
    }

    // Read existing guests BEFORE batch writes
    final existingGuestsSnap = await _firestore
        .collection('clubs/$clubId/operations/$operationId/inscriptions')
        .where('parent_inscription_id', isEqualTo: inscriptionId)
        .get();
    double oldGuestsTotal = 0;
    for (final guestDoc in existingGuestsSnap.docs) {
      final g = guestDoc.data();
      if (g['registration_status'] == 'canceled') continue;
      oldGuestsTotal +=
          (g['prix'] ?? 0).toDouble() + (g['supplement_total'] ?? 0).toDouble();
    }

    double newGuestsTotal = 0;
    if (guests != null) {
      for (final guest in guests) {
        newGuestsTotal += guest.prix + guest.supplementTotal;
      }
    }

    final batch = _firestore.batch();

    try {
      // 1. Read existing inscription
      final inscriptionRef = _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .doc(inscriptionId);
      final inscriptionSnap = await inscriptionRef.get();

      if (!inscriptionSnap.exists) {
        throw Exception('Inscription non trouvée');
      }

      final existingData = inscriptionSnap.data()!;
      final actorId = existingData['membre_id'] as String? ?? 'unknown-member';
      final actorName =
          '${existingData['membre_prenom'] ?? ''} ${existingData['membre_nom'] ?? ''}'
              .trim();
      final appVersion = await _appVersion();
      final existingSupplements = existingData['selected_supplements'] ?? [];
      final existingSupplementTotal =
          (existingData['supplement_total'] ?? 0.0).toDouble();
      final oldTotal = (existingData['prix'] ?? 0.0).toDouble() +
          existingSupplementTotal +
          oldGuestsTotal;
      final newTotal = (existingData['prix'] ?? 0.0).toDouble() +
          supplementTotal +
          newGuestsTotal;
      final isPaid = existingData['paye'] ?? false;

      // 2. Update parent inscription
      final updateData = <String, dynamic>{
        'selected_supplements':
            selectedSupplements.map((s) => s.toMap()).toList(),
        'supplement_total': supplementTotal,
        'updated_at': FieldValue.serverTimestamp(),
        ..._actionMetadata(
          action: 'updated',
          actorId: actorId,
          actorName: actorName.isEmpty ? actorId : actorName,
          source: 'calymob',
          reason: 'registration_details_updated',
          appVersion: appVersion,
        ),
      };
      if (deliveryAddress != null) {
        updateData['delivery_address'] = deliveryAddress;
      }
      batch.update(inscriptionRef, updateData);

      // 3. Handle guest updates (upsert new + update existing)
      final addedGuestIds = <String>[];
      if (guests != null && guests.isNotEmpty) {
        final inscriptionsRef = _firestore.collection(
          'clubs/$clubId/operations/$operationId/inscriptions',
        );

        for (final guest in guests) {
          final now = DateTime.now();
          final guestId = guest.inscriptionId ??
              'guest_${now.millisecondsSinceEpoch}_${Random().nextInt(99999).toString().padLeft(5, '0')}';

          if (guest.inscriptionId == null) {
            // New guest — create document
            final guestData = {
              'operation_id': operationId,
              'membre_id': guestId,
              'membre_nom': guest.nom,
              'membre_prenom': guest.prenom,
              'prix': guest.prix,
              'paye': false,
              'date_inscription': FieldValue.serverTimestamp(),
              'is_guest': true,
              'selected_supplements':
                  guest.selectedSupplements.map((s) => s.toMap()).toList(),
              'supplement_total': guest.supplementTotal,
              'parent_inscription_id': inscriptionId,
              'added_by': existingData['membre_id'],
              'added_by_name':
                  '${existingData['membre_prenom'] ?? ''} ${existingData['membre_nom'] ?? ''}'
                      .trim(),
              if (guest.tariffId != null) 'tariff_id': guest.tariffId,
              'created_at': FieldValue.serverTimestamp(),
              'updated_at': FieldValue.serverTimestamp(),
              'created_by': actorId,
              'created_by_name': actorName.isEmpty ? actorId : actorName,
              'created_source': 'calymob',
              if (appVersion != null) 'created_app_version': appVersion,
              ..._actionMetadata(
                action: 'registered',
                actorId: actorId,
                actorName: actorName.isEmpty ? actorId : actorName,
                source: 'calymob',
                reason: 'guest_added_during_registration_edit',
                appVersion: appVersion,
              ),
            };
            final newGuestRef = inscriptionsRef.doc(guestId);
            batch.set(newGuestRef, guestData);
            addedGuestIds.add(guestId);
          } else {
            // Existing guest — update
            batch.update(inscriptionsRef.doc(guest.inscriptionId!), {
              'membre_nom': guest.nom,
              'membre_prenom': guest.prenom,
              'prix': guest.prix,
              'selected_supplements':
                  guest.selectedSupplements.map((s) => s.toMap()).toList(),
              'supplement_total': guest.supplementTotal,
              if (guest.tariffId != null) 'tariff_id': guest.tariffId,
              'updated_at': FieldValue.serverTimestamp(),
              ..._actionMetadata(
                action: 'updated',
                actorId: actorId,
                actorName: actorName.isEmpty ? actorId : actorName,
                source: 'calymob',
                reason: 'guest_details_updated',
                appVersion: appVersion,
              ),
            });
          }
        }
      }

      // 4. Handle guest removals
      if (guestIdsToRemove != null && guestIdsToRemove.isNotEmpty) {
        final inscriptionsRef = _firestore.collection(
          'clubs/$clubId/operations/$operationId/inscriptions',
        );
        for (final guestId in guestIdsToRemove) {
          batch.update(
            inscriptionsRef.doc(guestId),
            _cancellationMetadata(
              actorId: actorId,
              actorName: actorName.isEmpty ? actorId : actorName,
              source: 'calymob',
              reason: 'guest_removed_during_registration_edit',
              appVersion: appVersion,
            ),
          );
        }
      }

      // 5. Write edit_history entry
      final editHistoryRef = inscriptionRef.collection('edit_history').doc();
      batch.set(editHistoryRef, {
        'action': 'inscription_updated',
        'inscription_id': inscriptionId,
        'timestamp': FieldValue.serverTimestamp(),
        'previous_supplements': existingSupplements,
        'new_supplements': selectedSupplements.map((s) => s.toMap()).toList(),
        'previous_total': existingSupplementTotal,
        'new_total': supplementTotal,
        'guests_added': addedGuestIds,
        'guests_removed': guestIdsToRemove ?? [],
      });

      // Commit batch
      await batch.commit();

      // 6. Handle refund if price decreased.
      //    Trigger condition: delta > 0 AND (parent already paid OR the
      //    user explicitly claimed an already-paid-but-not-yet-imported
      //    payment via [forceRefundClaim]). In the latter case the CF
      //    sets statut='a_verifier_paiement' so the admin can validate.
      final delta = oldTotal - newTotal;
      final unverifiedPayment = !isPaid && forceRefundClaim;
      if (delta > 0 && (isPaid || forceRefundClaim)) {
        // Fire-and-forget: log but don't block the UI on refund creation
        try {
          final refundService = RefundService();
          final editSessionId = 'edit_${inscriptionId}_$newTotal';
          // The Cloud Function REQUIRES description + eventTitre — without
          // them the call is rejected with `invalid-argument` and the
          // refund demande is silently dropped.
          final descriptionPrefix = unverifiedPayment
              ? 'Modification inscription (paiement déclaré, en attente de validation) — '
              : 'Modification inscription — ';
          await refundService.createInscriptionRefund(
            clubId: clubId,
            operationId: operationId,
            inscriptionId: inscriptionId,
            oldAmount: oldTotal,
            newAmount: newTotal,
            editSessionId: editSessionId,
            eventTitre: operation.titre,
            description: '${descriptionPrefix}diminution de '
                '${delta.toStringAsFixed(2)} € '
                '(de ${oldTotal.toStringAsFixed(2)} € à '
                '${newTotal.toStringAsFixed(2)} €).',
            unverifiedPayment: unverifiedPayment,
          );
          debugPrint(
            '✅ Refund requested for inscription $inscriptionId '
            '(delta=$delta, unverified=$unverifiedPayment)',
          );
        } catch (refundError) {
          // Log refund failure — the inscription update already succeeded
          debugPrint('⚠️ Refund creation failed (non-blocking): $refundError');
        }
      }

      debugPrint('✅ Inscription $inscriptionId updated (delta=$delta)');
      return delta;
    } catch (e) {
      debugPrint('❌ Erreur updateMyInscription: $e');
      rethrow;
    }
  }

  /// Update supplement selection for a guest inscription.
  Future<void> updateGuestInscription({
    required String clubId,
    required String operationId,
    required String guestInscriptionId,
    required List<SelectedSupplement> selectedSupplements,
    required double supplementTotal,
  }) async {
    try {
      final batch = _firestore.batch();
      final inscriptionRef = _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .doc(guestInscriptionId);
      final snapshot = await inscriptionRef.get();
      if (!snapshot.exists) throw Exception('Inscription invité introuvable');
      final data = snapshot.data()!;
      final actorId = data['added_by'] as String? ?? 'unknown-member';
      final actorName = data['added_by_name'] as String? ?? actorId;
      final appVersion = await _appVersion();

      batch.update(inscriptionRef, {
        'selected_supplements':
            selectedSupplements.map((s) => s.toMap()).toList(),
        'supplement_total': supplementTotal,
        'updated_at': FieldValue.serverTimestamp(),
        ..._actionMetadata(
          action: 'updated',
          actorId: actorId,
          actorName: actorName,
          source: 'calymob',
          reason: 'guest_supplements_updated',
          appVersion: appVersion,
        ),
      });

      // Write edit_history entry
      final editHistoryRef = inscriptionRef.collection('edit_history').doc();
      batch.set(editHistoryRef, {
        'action': 'guest_inscription_updated',
        'inscription_id': guestInscriptionId,
        'timestamp': FieldValue.serverTimestamp(),
        'new_supplements': selectedSupplements.map((s) => s.toMap()).toList(),
        'new_total': supplementTotal,
      });

      await batch.commit();
      debugPrint('✅ Guest inscription $guestInscriptionId updated');
    } catch (e) {
      debugPrint('❌ Erreur updateGuestInscription: $e');
      rethrow;
    }
  }

  /// Annule exactement 1 invité — sans cascade et sans effacer son historique.
  Future<void> removeOneGuest({
    required String clubId,
    required String operationId,
    required String guestInscriptionId,
  }) async {
    try {
      final batch = _firestore.batch();
      final inscriptionRef = _firestore
          .collection('clubs/$clubId/operations/$operationId/inscriptions')
          .doc(guestInscriptionId);
      final snapshot = await inscriptionRef.get();
      if (!snapshot.exists) throw Exception('Inscription invité introuvable');
      final data = snapshot.data()!;
      final actorId = data['added_by'] as String? ?? 'unknown-member';
      final actorName = data['added_by_name'] as String? ?? actorId;
      final appVersion = await _appVersion();

      batch.update(
        inscriptionRef,
        _cancellationMetadata(
          actorId: actorId,
          actorName: actorName,
          source: 'calymob',
          reason: 'guest_removed',
          appVersion: appVersion,
        ),
      );

      // Keep the existing edit history alongside the preserved guest doc.
      final editHistoryRef = inscriptionRef.collection('edit_history').doc();
      batch.set(editHistoryRef, {
        'action': 'guest_removed',
        'inscription_id': guestInscriptionId,
        'timestamp': FieldValue.serverTimestamp(),
      });

      await batch.commit();
      debugPrint(
        '✅ Guest inscription $guestInscriptionId annulée avec historique',
      );
    } catch (e) {
      debugPrint('❌ Erreur removeOneGuest: $e');
      rethrow;
    }
  }
}

/// Parameters for adding or updating a guest inscription during
/// [OperationService.updateMyInscription].
///
/// - When [inscriptionId] is null, a new guest inscription is created.
/// - When [inscriptionId] is non-null, the existing guest inscription is updated.
class GuestUpdate {
  /// Null for new guests, non-null for existing guests.
  final String? inscriptionId;
  final String prenom;
  final String nom;
  final double prix;
  final String? tariffId;
  final List<SelectedSupplement> selectedSupplements;
  final double supplementTotal;

  GuestUpdate({
    this.inscriptionId,
    required this.prenom,
    required this.nom,
    required this.prix,
    this.tariffId,
    this.selectedSupplements = const [],
    this.supplementTotal = 0,
  });
}

/// Résultat d'un [OperationService.unmarkAsPresent] utilisé pour l'undo.
///
/// - `deletedInscription == true`  → compatibilité UI: le walk-in non payé a
///   été désinscrit, mais son document est conservé avec statut `canceled`.
///   `previousData` permet de rétablir son état via
///   [OperationService.restoreFromUnmark].
/// - `deletedInscription == false` → seuls les champs `present*` ont été
///   réinitialisés. `previousData` contient uniquement ces champs.
class UnmarkPresentResult {
  final bool deletedInscription;
  final String inscriptionId;
  final Map<String, dynamic> previousData;

  UnmarkPresentResult({
    required this.deletedInscription,
    required this.inscriptionId,
    required this.previousData,
  });
}

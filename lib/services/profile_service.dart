import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import '../models/member_profile.dart';

/// Service de gestion des profils membres
class ProfileService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseStorage _storage = FirebaseStorage.instance;

  /// Récupérer le profil d'un membre
  Future<MemberProfile?> getProfile(String clubId, String userId) async {
    try {
      final doc = await _firestore
          .collection('clubs/$clubId/members')
          .doc(userId)
          .get();

      if (!doc.exists) {
        debugPrint('❌ Profil membre $userId non trouvé');
        return null;
      }

      final profile = MemberProfile.fromFirestore(doc);
      debugPrint('✅ Profil chargé: ${profile.fullName}');
      return profile;
    } catch (e) {
      debugPrint('❌ Erreur récupération profil: $e');
      return null;
    }
  }

  /// Stream du profil d'un membre (temps réel)
  Stream<MemberProfile?> watchProfile(String clubId, String userId) {
    return _firestore
        .collection('clubs/$clubId/members')
        .doc(userId)
        .snapshots()
        .map((doc) {
      if (!doc.exists) return null;
      return MemberProfile.fromFirestore(doc);
    });
  }

  /// Uploader une photo de profil
  Future<String> uploadProfilePhoto(
    String clubId,
    String userId,
    File photoFile,
  ) async {
    try {
      debugPrint('📤 Upload photo profil pour $userId...');

      // Chemin dans Storage: clubs/{clubId}/members/{userId}/profile.jpg
      final ref =
          _storage.ref().child('clubs/$clubId/members/$userId/profile.jpg');

      // Upload avec metadata
      final uploadTask = await ref.putFile(
        photoFile,
        SettableMetadata(
          contentType: 'image/jpeg',
          customMetadata: {
            'uploadedBy': userId,
            'uploadedAt': DateTime.now().toIso8601String(),
          },
        ),
      );

      // Récupérer l'URL de téléchargement
      final downloadUrl = await uploadTask.ref.getDownloadURL();

      debugPrint('✅ Photo uploadée: $downloadUrl');
      return downloadUrl;
    } catch (e) {
      debugPrint('❌ Erreur upload photo: $e');
      rethrow;
    }
  }

  /// Mettre à jour la photo de profil
  Future<void> updateProfilePhoto(
    String clubId,
    String userId,
    File photoFile, {
    required bool consentInternalPhoto,
    bool? consentExternalPhoto,
  }) async {
    try {
      // 1. Upload la photo
      final photoUrl = await uploadProfilePhoto(clubId, userId, photoFile);

      // 2. Mettre à jour Firestore (utilise set avec merge pour créer si n'existe pas)
      final updateData = <String, dynamic>{
        'photo_url': photoUrl,
        'photo_uploaded_at': FieldValue.serverTimestamp(),
        'consent_internal_photo': consentInternalPhoto,
        'consent_internal_photo_date':
            consentInternalPhoto ? FieldValue.serverTimestamp() : null,
        'updated_at': FieldValue.serverTimestamp(),
      };

      if (consentExternalPhoto != null) {
        updateData['consent_external_photo'] = consentExternalPhoto;
        updateData['consent_external_photo_date'] =
            consentExternalPhoto ? FieldValue.serverTimestamp() : null;
      }

      await _firestore.collection('clubs/$clubId/members').doc(userId).set(
            updateData,
            SetOptions(merge: true),
          );

      debugPrint('✅ Profil photo mis à jour');
    } catch (e) {
      debugPrint('❌ Erreur mise à jour photo: $e');
      rethrow;
    }
  }

  /// Supprimer la photo de profil
  Future<void> deleteProfilePhoto(String clubId, String userId) async {
    try {
      // 1. Supprimer de Storage
      final ref =
          _storage.ref().child('clubs/$clubId/members/$userId/profile.jpg');
      await ref.delete();

      // 2. Mettre à jour Firestore
      await _firestore.collection('clubs/$clubId/members').doc(userId).update({
        'photo_url': FieldValue.delete(),
        'photo_uploaded_at': FieldValue.delete(),
        'updated_at': FieldValue.serverTimestamp(),
      });

      debugPrint('✅ Photo profil supprimée');
    } catch (e) {
      debugPrint('❌ Erreur suppression photo: $e');
      rethrow;
    }
  }

  /// Mettre à jour les consentements photo
  /// Si consentInternal est retiré (false), la photo sera supprimée conformément au RGPD
  Future<void> updatePhotoConsents(
    String clubId,
    String userId, {
    required bool consentInternal,
    required bool consentExternal,
  }) async {
    try {
      // Si le consentement interne est retiré, supprimer la photo (RGPD Article 17)
      if (!consentInternal) {
        debugPrint('⚠️ Consentement interne retiré - suppression de la photo');

        // Récupérer le profil pour vérifier s'il y a une photo
        final profile = await getProfile(clubId, userId);

        if (profile != null && profile.hasPhoto) {
          // Supprimer la photo de Storage et mettre à jour Firestore
          await deleteProfilePhoto(clubId, userId);
        }

        // Mettre à jour les consentements (mais photo_url est déjà supprimé)
        final updates = <String, dynamic>{
          'consent_internal_photo': false,
          'consent_external_photo': false,
          'consent_internal_photo_date': null,
          'consent_external_photo_date': null,
          'updated_at': FieldValue.serverTimestamp(),
        };

        await _firestore
            .collection('clubs/$clubId/members')
            .doc(userId)
            .update(updates);

        debugPrint('✅ Consentement retiré et photo supprimée');
        return;
      }

      // Cas normal: mise à jour des consentements
      final updates = <String, dynamic>{
        'consent_internal_photo': consentInternal,
        'consent_external_photo': consentExternal,
        'updated_at': FieldValue.serverTimestamp(),
      };

      // Mettre à jour les dates de consentement
      if (consentInternal) {
        updates['consent_internal_photo_date'] = FieldValue.serverTimestamp();
      }
      if (consentExternal) {
        updates['consent_external_photo_date'] = FieldValue.serverTimestamp();
      }

      await _firestore
          .collection('clubs/$clubId/members')
          .doc(userId)
          .update(updates);

      debugPrint('✅ Consentements photo mis à jour');
    } catch (e) {
      debugPrint('❌ Erreur mise à jour consentements: $e');
      rethrow;
    }
  }

  /// Mettre à jour les préférences de partage de contact
  Future<void> updateContactSharing(
    String clubId,
    String userId, {
    required bool shareEmail,
    required bool sharePhone,
  }) async {
    try {
      await _firestore.collection('clubs/$clubId/members').doc(userId).update({
        'share_email': shareEmail,
        'share_phone': sharePhone,
        'updated_at': FieldValue.serverTimestamp(),
      });

      debugPrint('✅ Préférences partage contact mises à jour');
    } catch (e) {
      debugPrint('❌ Erreur mise à jour partage contact: $e');
      rethrow;
    }
  }

  /// Mettre à jour le numéro de téléphone
  Future<void> updatePhoneNumber(
    String clubId,
    String userId,
    String? phoneNumber,
  ) async {
    try {
      await _firestore.collection('clubs/$clubId/members').doc(userId).update({
        'phone_number': phoneNumber,
        'updated_at': FieldValue.serverTimestamp(),
      });

      debugPrint('✅ Numéro de téléphone mis à jour');
    } catch (e) {
      debugPrint('❌ Erreur mise à jour téléphone: $e');
      rethrow;
    }
  }

  /// Mettre à jour les préférences de notifications
  Future<void> updateNotificationSettings(
    String clubId,
    String userId, {
    required bool enabled,
    String? fcmToken,
  }) async {
    try {
      final updates = <String, dynamic>{
        'notifications_enabled': enabled,
        'updated_at': FieldValue.serverTimestamp(),
      };

      if (fcmToken != null) {
        updates['fcm_token'] = fcmToken;
      }

      await _firestore
          .collection('clubs/$clubId/members')
          .doc(userId)
          .update(updates);

      debugPrint('✅ Paramètres notifications mis à jour');
    } catch (e) {
      debugPrint('❌ Erreur mise à jour notifications: $e');
      rethrow;
    }
  }

  /// Récupérer tous les profils (pour "Who's Who")
  Future<List<MemberProfile>> getAllProfiles(String clubId) async {
    try {
      final snapshot =
          await _firestore.collection('clubs/$clubId/members').get();

      final profiles =
          snapshot.docs.map((doc) => MemberProfile.fromFirestore(doc)).toList();

      profiles.sort((a, b) {
        final lastNameCompare =
            a.nom.toLowerCase().compareTo(b.nom.toLowerCase());
        if (lastNameCompare != 0) return lastNameCompare;
        return a.prenom.toLowerCase().compareTo(b.prenom.toLowerCase());
      });

      debugPrint('✅ ${profiles.length} profils chargés');
      return profiles;
    } catch (e) {
      debugPrint('❌ Erreur chargement profils: $e');
      return [];
    }
  }

  /// Rechercher des profils par nom
  Future<List<MemberProfile>> searchProfiles(
    String clubId,
    String query,
  ) async {
    try {
      final allProfiles = await getAllProfiles(clubId);

      // Filtrer localement (Firestore ne supporte pas les recherches textuelles avancées)
      final queryLower = query.toLowerCase();
      final filtered = allProfiles.where((profile) {
        final fullName = profile.fullName.toLowerCase();
        final nom = profile.nom.toLowerCase();
        final prenom = profile.prenom.toLowerCase();

        return fullName.contains(queryLower) ||
            nom.contains(queryLower) ||
            prenom.contains(queryLower);
      }).toList();

      debugPrint('✅ ${filtered.length} profils trouvés pour "$query"');
      return filtered;
    } catch (e) {
      debugPrint('❌ Erreur recherche profils: $e');
      return [];
    }
  }

  /// Supprimer toutes les données utilisateur (RGPD Article 17 - Droit à l'effacement)
  /// Cette méthode supprime:
  /// - La photo de profil dans Storage
  /// - Le document membre dans Firestore
  /// - Les sessions actives
  /// Note: Les inscriptions aux événements et les notes de frais sont conservées
  /// pour des raisons légales/comptables mais anonymisées
  Future<void> deleteUserData(String clubId, String userId) async {
    try {
      debugPrint('🗑️ Suppression des données utilisateur: $userId');

      // 1. Supprimer la photo de profil si elle existe
      try {
        final photoRef =
            _storage.ref().child('clubs/$clubId/members/$userId/profile.jpg');
        await photoRef.delete();
        debugPrint('✅ Photo profil supprimée');
      } catch (e) {
        // Photo n'existe peut-être pas, ce n'est pas une erreur critique
        debugPrint('ℹ️ Pas de photo à supprimer ou erreur: $e');
      }

      // 2. Supprimer les sessions actives
      try {
        final sessionsSnapshot = await _firestore
            .collection('clubs/$clubId/sessions')
            .where('userId', isEqualTo: userId)
            .get();

        for (final doc in sessionsSnapshot.docs) {
          await doc.reference.delete();
        }
        debugPrint('✅ ${sessionsSnapshot.docs.length} session(s) supprimée(s)');
      } catch (e) {
        debugPrint('⚠️ Erreur suppression sessions: $e');
      }

      // 3. Marquer le membre comme supprimé (soft delete pour conserver l'historique)
      // Ceci anonymise les données tout en conservant les références
      await _firestore.collection('clubs/$clubId/members').doc(userId).update({
        'nom': 'Compte supprimé',
        'prenom': '',
        'email': 'deleted@deleted.local',
        'phone_number': null,
        'photo_url': null,
        'fcm_token': null,
        'fcm_tokens': [],
        'notifications_enabled': false,
        'share_email': false,
        'share_phone': false,
        'consent_internal_photo': false,
        'consent_external_photo': false,
        'app_installed': false,
        'account_deleted': true,
        'account_deleted_at': FieldValue.serverTimestamp(),
        'updated_at': FieldValue.serverTimestamp(),
      });

      debugPrint('✅ Données utilisateur anonymisées/supprimées');
    } catch (e) {
      debugPrint('❌ Erreur suppression données utilisateur: $e');
      rethrow;
    }
  }
}

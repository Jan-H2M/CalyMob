import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import '../models/medical_certification.dart';

/// Service de gestion des certificats médicaux
class MedicalCertificationService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseStorage _storage = FirebaseStorage.instance;

  /// Récupérer le certificat médical actuel (le plus récent approuvé ou en attente)
  Future<MedicalCertification?> getCurrentCertification(
    String clubId,
    String userId,
  ) async {
    try {
      // D'abord chercher un certificat approuvé et valide
      final approvedQuery = await _firestore
          .collection('clubs/$clubId/members/$userId/medical_certificates')
          .where('status', isEqualTo: 'approved')
          .orderBy('valid_until', descending: true)
          .limit(1)
          .get();

      if (approvedQuery.docs.isNotEmpty) {
        final cert = MedicalCertification.fromFirestore(approvedQuery.docs.first);
        debugPrint('✅ Certificat approuvé trouvé: ${cert.id}');
        return cert;
      }

      // Sinon chercher un certificat en attente
      final pendingQuery = await _firestore
          .collection('clubs/$clubId/members/$userId/medical_certificates')
          .where('status', isEqualTo: 'pending')
          .orderBy('uploaded_at', descending: true)
          .limit(1)
          .get();

      if (pendingQuery.docs.isNotEmpty) {
        final cert = MedicalCertification.fromFirestore(pendingQuery.docs.first);
        debugPrint('⏳ Certificat en attente trouvé: ${cert.id}');
        return cert;
      }

      debugPrint('ℹ️ Aucun certificat médical trouvé pour $userId');
      return null;
    } catch (e) {
      debugPrint('❌ Erreur récupération certificat: $e');
      return null;
    }
  }

  /// Stream du certificat médical actuel (temps réel)
  /// Priorité: certificat approuvé > certificat en attente
  /// (même logique que getCurrentCertification)
  Stream<MedicalCertification?> watchCurrentCertification(
    String clubId,
    String userId,
  ) {
    // Watch all certificates and apply priority logic locally
    return _firestore
        .collection('clubs/$clubId/members/$userId/medical_certificates')
        .orderBy('uploaded_at', descending: true)
        .snapshots()
        .map((snapshot) {
      if (snapshot.docs.isEmpty) return null;

      final certs = snapshot.docs
          .map((doc) => MedicalCertification.fromFirestore(doc))
          .toList();

      // Priority 1: Find approved certificate (most recent by valid_until)
      final approvedCerts = certs
          .where((c) => c.status == CertificateStatus.approved)
          .toList();
      if (approvedCerts.isNotEmpty) {
        // Sort by valid_until descending
        approvedCerts.sort((a, b) {
          final aDate = a.validUntil ?? DateTime(1900);
          final bDate = b.validUntil ?? DateTime(1900);
          return bDate.compareTo(aDate);
        });
        return approvedCerts.first;
      }

      // Priority 2: Find pending certificate (most recent by uploaded_at)
      final pendingCerts = certs
          .where((c) => c.status == CertificateStatus.pending)
          .toList();
      if (pendingCerts.isNotEmpty) {
        // Already sorted by uploaded_at descending from query
        return pendingCerts.first;
      }

      // Priority 3: Return most recent rejected (for display)
      return certs.first;
    });
  }

  /// Récupérer l'historique des certificats
  Future<List<MedicalCertification>> getCertificationHistory(
    String clubId,
    String userId,
  ) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/members/$userId/medical_certificates')
          .orderBy('uploaded_at', descending: true)
          .get();

      final certs = snapshot.docs
          .map((doc) => MedicalCertification.fromFirestore(doc))
          .toList();

      debugPrint('✅ ${certs.length} certificat(s) trouvé(s)');
      return certs;
    } catch (e) {
      debugPrint('❌ Erreur récupération historique: $e');
      return [];
    }
  }

  /// Détecte le type réel du document à partir de ses octets d'en-tête.
  /// Retourne 'pdf' si le fichier commence par la signature `%PDF-`,
  /// sinon 'image'. En cas d'erreur de lecture, on retombe sur le type
  /// annoncé par l'appelant (normalisé à 'image' si inconnu).
  Future<String> _detectDocumentType(File file, String fallbackType) async {
    try {
      final raf = await file.open();
      final header = await raf.read(5);
      await raf.close();
      final isPdf = header.length >= 5 &&
          header[0] == 0x25 && // %
          header[1] == 0x50 && // P
          header[2] == 0x44 && // D
          header[3] == 0x46 && // F
          header[4] == 0x2D; // -
      if (isPdf) return 'pdf';
      // Le contenu n'est pas un PDF : c'est forcément une image.
      return 'image';
    } catch (e) {
      debugPrint('⚠️ Détection type fichier échouée, fallback "$fallbackType": $e');
      return fallbackType == 'pdf' ? 'pdf' : 'image';
    }
  }

  /// Uploader un nouveau certificat médical
  Future<MedicalCertification> uploadCertification({
    required String clubId,
    required String userId,
    required File file,
    required String documentType, // 'image' ou 'pdf'
    String? fileName,
  }) async {
    try {
      debugPrint('📤 Upload certificat médical pour $userId...');

      // 0. Sécurité: déterminer le VRAI type via les octets d'en-tête.
      // L'extension transmise par l'appelant (file_picker / scanner) n'est pas
      // fiable — notamment nulle sur iOS — ce qui faisait jadis téléverser des
      // PDF étiquetés image/jpeg, affichés cassés dans CalyCompta.
      final effectiveType = await _detectDocumentType(file, documentType);

      // 1. Générer un nom de fichier unique
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final extension = effectiveType == 'pdf' ? 'pdf' : 'jpg';
      final storageName = 'certificat_$timestamp.$extension';

      // 2. Chemin dans Storage
      final ref = _storage
          .ref()
          .child('clubs/$clubId/members/$userId/medical_certificates/$storageName');

      // 3. Upload avec metadata
      final contentType =
          effectiveType == 'pdf' ? 'application/pdf' : 'image/jpeg';
      final uploadTask = await ref.putFile(
        file,
        SettableMetadata(
          contentType: contentType,
          customMetadata: {
            'uploadedBy': userId,
            'uploadedAt': DateTime.now().toIso8601String(),
            'originalFileName': fileName ?? storageName,
          },
        ),
      );

      // 4. Récupérer l'URL de téléchargement
      final downloadUrl = await uploadTask.ref.getDownloadURL();
      debugPrint('✅ Fichier uploadé: $downloadUrl');

      // 5. Créer le document Firestore
      final now = DateTime.now();
      final docRef = _firestore
          .collection('clubs/$clubId/members/$userId/medical_certificates')
          .doc();

      final certification = MedicalCertification(
        id: docRef.id,
        memberId: userId,
        documentUrl: downloadUrl,
        documentType: effectiveType,
        fileName: fileName,
        uploadedAt: now,
        status: CertificateStatus.pending,
      );

      await docRef.set(certification.toFirestore());
      debugPrint('✅ Certificat créé: ${docRef.id}');

      // 6. Update member's has_pending_medical flag
      final memberRef = _firestore.doc('clubs/$clubId/members/$userId');
      await memberRef.update({'has_pending_medical': true});
      debugPrint('✅ Flag has_pending_medical mis à jour');

      return certification;
    } catch (e) {
      debugPrint('❌ Erreur upload certificat: $e');
      rethrow;
    }
  }

  /// Supprimer un certificat médical
  Future<void> deleteCertification(
    String clubId,
    String userId,
    String certId,
  ) async {
    try {
      // 1. Récupérer le document pour avoir l'URL du fichier
      final docRef = _firestore
          .collection('clubs/$clubId/members/$userId/medical_certificates')
          .doc(certId);

      final doc = await docRef.get();
      if (!doc.exists) {
        debugPrint('⚠️ Certificat $certId non trouvé');
        return;
      }

      final cert = MedicalCertification.fromFirestore(doc);

      // 2. Supprimer le fichier de Storage
      try {
        final ref = _storage.refFromURL(cert.documentUrl);
        await ref.delete();
        debugPrint('✅ Fichier supprimé de Storage');
      } catch (e) {
        debugPrint('⚠️ Erreur suppression fichier Storage: $e');
      }

      // 3. Supprimer le document Firestore
      await docRef.delete();
      debugPrint('✅ Certificat $certId supprimé');
    } catch (e) {
      debugPrint('❌ Erreur suppression certificat: $e');
      rethrow;
    }
  }

  /// Vérifier si le membre a un certificat valide
  Future<bool> hasValidCertification(String clubId, String userId) async {
    final cert = await getCurrentCertification(clubId, userId);
    return cert?.canPresent ?? false;
  }
}

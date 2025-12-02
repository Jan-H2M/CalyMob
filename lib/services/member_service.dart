import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/exercice_lifras.dart';

/// Service de gestion des membres
class MemberService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Récupérer le niveau de plongée d'un membre
  Future<NiveauLIFRAS?> getMemberNiveau(String clubId, String memberId) async {
    try {
      final doc = await _firestore
          .collection('clubs/$clubId/members')
          .doc(memberId)
          .get();

      if (!doc.exists) {
        debugPrint('❌ Membre $memberId non trouvé');
        return null;
      }

      final data = doc.data();
      if (data == null) return null;

      // Essayer différents champs possibles
      // CORRECT: plongeur_code est le champ standardisé
      final niveauCode = data['plongeur_code'] ??
                        data['niveau_plongee'] ??
                        data['diveLevel'] ??
                        data['niveau_plongeur'];

      if (niveauCode == null) {
        debugPrint('⚠️ Niveau de plongée non défini pour membre $memberId');
        return null;
      }

      // Convertir le code (ex: "2" → "P2", "MC" → "MC")
      final standardizedCode = _standardizeCode(niveauCode as String);
      final niveau = NiveauLIFRASExtension.fromCode(standardizedCode);

      debugPrint('🏊 Niveau membre $memberId: ${niveau?.label ?? "Non défini"} (code: $niveauCode → $standardizedCode)');
      return niveau;
    } catch (e) {
      debugPrint('❌ Erreur récupération niveau membre: $e');
      return null;
    }
  }

  /// Standardiser le code de niveau
  /// Convertit "1" → "NB", "2" → "P2", etc.
  String _standardizeCode(String code) {
    switch (code.toUpperCase()) {
      case '1':
        return 'NB';  // Non Breveté (Plongeur 1*)
      case '2':
        return 'P2';  // Plongeur 2*
      case '3':
        return 'P3';  // Plongeur 3*
      case '4':
        return 'P4';  // Plongeur 4*
      case 'AM':
        return 'AM';  // Assistant Moniteur
      case 'MC':
        return 'MC';  // Moniteur Club
      case 'MF':
        return 'MC';  // Moniteur Fédéral → treat as MC for now
      default:
        return code.toUpperCase();  // Pass through if already standardized
    }
  }

  /// Récupérer les informations complètes d'un membre
  Future<Map<String, dynamic>?> getMemberData(String clubId, String memberId) async {
    try {
      final doc = await _firestore
          .collection('clubs/$clubId/members')
          .doc(memberId)
          .get();

      if (!doc.exists) {
        debugPrint('❌ Membre $memberId non trouvé');
        return null;
      }

      return doc.data();
    } catch (e) {
      debugPrint('❌ Erreur récupération données membre: $e');
      return null;
    }
  }

  /// Récupérer tous les moniteurs du club (MC, MF, MN, AM)
  Future<List<Map<String, dynamic>>> getMonitors(String clubId) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/members')
          .where('plongeur_code', whereIn: ['MC', 'MF', 'MN', 'AM'])
          .get();

      final monitors = snapshot.docs.map((doc) {
        final data = doc.data();
        return {
          'id': doc.id,
          'nom': data['nom'] ?? '',
          'prenom': data['prenom'] ?? '',
          'displayName': '${data['prenom'] ?? ''} ${data['nom'] ?? ''}'.trim(),
          'plongeur_code': data['plongeur_code'] ?? '',
        };
      }).toList();

      // Sort by displayName
      monitors.sort((a, b) => (a['displayName'] as String)
          .compareTo(b['displayName'] as String));

      debugPrint('👨‍🏫 ${monitors.length} moniteurs trouvés dans le club');
      return monitors;
    } catch (e) {
      debugPrint('❌ Erreur récupération moniteurs: $e');
      return [];
    }
  }

  /// Récupérer tous les membres du club
  Future<List<Map<String, dynamic>>> getAllMembers(String clubId) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/members')
          .orderBy('nom')
          .get();

      final members = snapshot.docs.map((doc) {
        final data = doc.data();
        return {
          'id': doc.id,
          'nom': data['nom'] ?? '',
          'prenom': data['prenom'] ?? '',
          'displayName': '${data['prenom'] ?? ''} ${data['nom'] ?? ''}'.trim(),
          'plongeur_code': data['plongeur_code'] ?? '',
          'email': data['email'] ?? '',
        };
      }).toList();

      debugPrint('👥 ${members.length} membres trouvés dans le club');
      return members;
    } catch (e) {
      debugPrint('❌ Erreur récupération membres: $e');
      return [];
    }
  }

  /// Vérifier si un membre est moniteur (MC, MF, MN, ou AM)
  Future<bool> isMonitor(String clubId, String memberId) async {
    try {
      final data = await getMemberData(clubId, memberId);
      if (data == null) return false;

      final code = data['plongeur_code'] as String?;
      return code == 'MC' || code == 'MF' || code == 'MN' || code == 'AM';
    } catch (e) {
      debugPrint('❌ Erreur vérification moniteur: $e');
      return false;
    }
  }
}

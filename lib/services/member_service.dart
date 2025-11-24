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
}

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/exercice_lifras.dart';
import '../models/member_profile.dart';
import '../utils/member_name.dart';

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

      debugPrint(
          '🏊 Niveau membre $memberId: ${niveau?.label ?? "Non défini"} (code: $niveauCode → $standardizedCode)');
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
        return 'NB'; // Non Breveté (Plongeur 1*)
      case '2':
        return 'P2'; // Plongeur 2*
      case '3':
        return 'P3'; // Plongeur 3*
      case '4':
        return 'P4'; // Plongeur 4*
      case 'AM':
        return 'AM'; // Assistant Moniteur
      case 'MC':
        return 'MC'; // Moniteur Club
      case 'MF':
        return 'MC'; // Moniteur Fédéral → treat as MC for now
      default:
        return code.toUpperCase(); // Pass through if already standardized
    }
  }

  /// Récupérer les informations complètes d'un membre
  Future<Map<String, dynamic>?> getMemberData(
      String clubId, String memberId) async {
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
          .where('plongeur_code', whereIn: ['MC', 'MF', 'MN', 'AM']).get();

      final monitors = snapshot.docs.map((doc) {
        final data = doc.data();
        return {
          'id': doc.id,
          'nom': memberLastName(data) ?? '',
          'prenom': memberFirstName(data) ?? '',
          'displayName': memberDisplayName(data),
          'plongeur_code': data['plongeur_code'] ?? '',
        };
      }).toList();

      // Sort by displayName
      monitors.sort((a, b) =>
          (a['displayName'] as String).compareTo(b['displayName'] as String));

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
      final snapshot =
          await _firestore.collection('clubs/$clubId/members').get();

      final members = snapshot.docs.map((doc) {
        final data = doc.data();
        return {
          'id': doc.id,
          'nom': memberLastName(data) ?? '',
          'prenom': memberFirstName(data) ?? '',
          'displayName': memberDisplayName(data),
          'plongeur_code': data['plongeur_code'] ?? '',
          'email': data['email'] ?? '',
          'member_status': MemberProfile.resolveMemberStatus(data),
        };
      }).where((m) {
        // Montrer seulement les membres actifs (null = actif par défaut)
        final status = m['member_status'] as String?;
        return status == null || status == 'active';
      }).toList();

      members.sort((a, b) =>
          (a['displayName'] as String).compareTo(b['displayName'] as String));

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

  /// Get a single member by ID (for QR scan result)
  Future<MemberProfile?> getMemberById(String clubId, String memberId) async {
    try {
      final doc = await _firestore
          .collection('clubs/$clubId/members')
          .doc(memberId)
          .get();

      if (!doc.exists) {
        debugPrint('❌ Membre $memberId non trouvé');
        return null;
      }

      return MemberProfile.fromFirestore(doc);
    } catch (e) {
      debugPrint('❌ Erreur récupération membre: $e');
      return null;
    }
  }

  /// Search members by name (client-side filtering)
  Future<List<MemberProfile>> searchMembers(String clubId, String query) async {
    try {
      if (query.trim().isEmpty) {
        return [];
      }

      final queryLower = query.toLowerCase().trim();

      // Get all members and filter client-side
      // (Firestore doesn't support full-text search natively)
      final snapshot =
          await _firestore.collection('clubs/$clubId/members').get();

      final members = snapshot.docs
          .map((doc) => MemberProfile.fromFirestore(doc))
          .where((member) {
        // Exclure les membres inactifs/supprimés
        if (!member.isActive) return false;
        final fullName = '${member.prenom} ${member.nom}'.toLowerCase();
        final reverseName = '${member.nom} ${member.prenom}'.toLowerCase();
        return fullName.contains(queryLower) ||
            reverseName.contains(queryLower) ||
            member.email.toLowerCase().contains(queryLower);
      }).toList();

      // Sort by relevance (exact match first, then by name)
      members.sort((a, b) {
        final aFullName = '${a.prenom} ${a.nom}'.toLowerCase();
        final bFullName = '${b.prenom} ${b.nom}'.toLowerCase();
        final aStartsWith = aFullName.startsWith(queryLower);
        final bStartsWith = bFullName.startsWith(queryLower);

        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
        return aFullName.compareTo(bFullName);
      });

      debugPrint('🔍 Recherche "$query": ${members.length} résultats');
      return members.take(20).toList(); // Limit to 20 results
    } catch (e) {
      debugPrint('❌ Erreur recherche membres: $e');
      return [];
    }
  }
}

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

/// Service pour récupérer l'année fiscale courante du club
///
/// Mirroirs [CalyCompta's FiscalYearService.getCurrentFiscalYear].
/// Utilisé par le wizard de création d'événement (et autres écrans mobiles)
/// pour injecter un [fiscal_year_id] valide — la règle Firestore
/// `canModifyFiscalYearData` exige que le document
/// `clubs/{clubId}/fiscal_years/{fiscalYearId}` existe et ait `status == 'open'`.
class FiscalYearService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // Singleton pattern, cohérent avec SessionService
  static final FiscalYearService _instance = FiscalYearService._internal();
  factory FiscalYearService() => _instance;
  FiscalYearService._internal();

  /// Récupérer l'ID de l'année fiscale courante (status = 'open').
  ///
  /// Retourne `null` si aucune année fiscale ouverte n'est trouvée — l'appelant
  /// doit alors afficher un message à l'utilisateur et ne pas créer de document.
  Future<String?> getCurrentOpenFiscalYearId(String clubId) async {
    try {
      final snapshot = await _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('fiscal_years')
          .where('status', isEqualTo: 'open')
          .orderBy('start_date', descending: true)
          .limit(1)
          .get();

      if (snapshot.docs.isEmpty) {
        debugPrint('⚠️ FiscalYearService: aucune année fiscale ouverte trouvée');
        return null;
      }

      final id = snapshot.docs.first.id;
      debugPrint('✅ FiscalYearService: année fiscale courante = $id');
      return id;
    } catch (e) {
      debugPrint('❌ FiscalYearService: erreur lookup fiscal_year — $e');
      // On propage pas — le caller traite null comme "pas d'année ouverte"
      return null;
    }
  }
}

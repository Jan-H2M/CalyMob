import '../models/exercice_lifras.dart';

/// Utility voor het bepalen van brevet-niveau en target-niveau van een plongeur.
///
/// Vertaalt de ruwe `plongeur_code` (Firestore veld op `members/{id}`) naar
/// een canonicale [NiveauLIFRAS] en berekent ook het _target_ niveau waar
/// de member naartoe werkt — afhankelijk van zijn `formation_active`-vlag.
///
/// Mirror van de CalyCompta-kant (`src/utils/plongeurUtils.ts`) zodat beide
/// apps dezelfde logica hanteren.
class PlongeurUtils {
  /// Standardiseer een ruwe plongeur_code naar een canonical niveau-string.
  ///
  /// "1" → "NB", "2" → "P2", "3" → "P3", "4" → "P4", "AM" / "MC" etc. blijven.
  /// Retourneert `null` wanneer de input leeg is of niet herkend wordt.
  static String? standardizeCode(String? rawCode) {
    if (rawCode == null) return null;
    final trimmed = rawCode.trim();
    if (trimmed.isEmpty) return null;
    switch (trimmed.toUpperCase()) {
      case '1':
      case '1*':
        return 'NB';
      case '2':
      case '2*':
        return 'P2';
      case '3':
      case '3*':
        return 'P3';
      case '4':
      case '4*':
        return 'P4';
      case 'AM':
        return 'AM';
      case 'MC':
        return 'MC';
      case 'MF':
        return 'MC'; // treat as MC for now — zelfde als CalyCompta
      case 'MN':
        return 'MC';
      default:
        return trimmed.toUpperCase();
    }
  }

  /// Parse de huidige brevet [NiveauLIFRAS] van een member.
  static NiveauLIFRAS? getCurrentNiveau(String? plongeurCode) {
    final std = standardizeCode(plongeurCode);
    if (std == null) return null;
    return NiveauLIFRASExtension.fromCode(std);
  }

  /// Bepaal het TARGET niveau — het brevet waar de member nu naartoe
  /// traint. Dit is:
  /// - bij `formationActive == true`: de volgende brevet-stap (NB→P2, P2→P3,
  ///   P3→P4, P4→AM, AM→MC)
  /// - anders: hetzelfde als [getCurrentNiveau]
  ///
  /// Retourneert `null` als de huidige code niet herkend wordt of er geen
  /// logische vervolg-brevet is (bv. een MC-ster).
  static NiveauLIFRAS? getTargetNiveau({
    required String? plongeurCode,
    required bool formationActive,
  }) {
    final current = getCurrentNiveau(plongeurCode);
    if (current == null) return null;
    if (!formationActive) return current;

    // Next brevet-stap bij active formation
    switch (current) {
      case NiveauLIFRAS.nb:
        return NiveauLIFRAS.p2;
      case NiveauLIFRAS.p2:
        return NiveauLIFRAS.p3;
      case NiveauLIFRAS.p3:
        return NiveauLIFRAS.p4;
      case NiveauLIFRAS.p4:
        return NiveauLIFRAS.am;
      case NiveauLIFRAS.am:
        return NiveauLIFRAS.mc;
      case NiveauLIFRAS.tn:
        // TN = Technique — blijft gelijk
        return current;
      case NiveauLIFRAS.mc:
      case NiveauLIFRAS.mf:
      case NiveauLIFRAS.mn:
        // Geen verdere progression in LIFRAS keten
        return current;
    }
  }
}

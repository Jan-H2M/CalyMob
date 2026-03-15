/// Constantes pour les créneaux horaires du planning piscine
/// Utilisées pour le gonflage, les disponibilités encadrants, et la théorie

// --- Types de session ---
class SessionType {
  static const String piscine = 'piscine';
  static const String theorie = 'theorie';

  static const List<String> all = [piscine, theorie];

  static String displayName(String type) {
    switch (type) {
      case piscine:
        return 'Piscine';
      case theorie:
        return 'Théorie';
      default:
        return type;
    }
  }

  static String icon(String type) {
    switch (type) {
      case piscine:
        return '🏊';
      case theorie:
        return '📖';
      default:
        return '📋';
    }
  }
}

// --- Créneaux gonflage ---
class GonflageSlots {
  static const String h1945 = '19h45';
  static const String h2015 = '20h15';
  static const String h2130 = '21h30';

  static const List<String> all = [h1945, h2015, h2130];

  static String displayName(String slot) {
    // Les noms de slots sont déjà lisibles
    return slot;
  }
}

// --- Créneaux disponibilité encadrants ---
class EncadrantSlots {
  static const String premiereHeure = '1ere_heure';
  static const String deuxiemeHeure = '2eme_heure';

  static const List<String> all = [premiereHeure, deuxiemeHeure];

  /// Niveaux qui ne font que le 1er créneau (20h15-21h15)
  static const List<String> levelsFirstHourOnly = ['1*'];
  /// Niveaux qui ne font que le 2e créneau (21h15-22h30)
  static const List<String> levelsSecondHourOnly = ['2*', '3*', '4*', 'AM', 'MC'];

  /// Obtenir le créneau horaire d'un niveau (pour affichage)
  static String timeForLevel(String level) {
    if (levelsFirstHourOnly.contains(level)) return '20h15';
    return '21h15';
  }

  static String displayName(String slot) {
    switch (slot) {
      case premiereHeure:
        return '20h15';
      case deuxiemeHeure:
        return '21h15';
      default:
        return slot;
    }
  }
}

// --- Créneaux théorie ---
class TheorieSlots {
  static const String h1930 = '19h30';
  static const String h2145 = '21h45';

  static const List<String> all = [h1930, h2145];

  static String displayName(String slot) {
    switch (slot) {
      case h1930:
        return 'Théorie 19h30';
      case h2145:
        return 'Théorie 21h45';
      default:
        return slot;
    }
  }
}

// --- Créneaux accueil ---
class AccueilSlots {
  static const String h2000 = '20h00';

  static const List<String> all = [h2000];

  /// Heure de début affichée pour l'accueil
  static const String startTime = '20h00';

  static String displayName(String slot) {
    return slot;
  }
}

// --- Utilitaires ---

/// Obtenir le label d'affichage pour un créneau selon le rôle
String getSlotLabel(String role, String slot) {
  if (role == 'accueil') return AccueilSlots.displayName(slot);
  if (role == 'gonflage') return GonflageSlots.displayName(slot);
  if (role == 'encadrant') return EncadrantSlots.displayName(slot);
  if (role == 'theorie') return TheorieSlots.displayName(slot);
  return slot;
}

/// Obtenir tous les créneaux disponibles pour un rôle donné
List<String> getSlotsForRole(String role) {
  switch (role) {
    case 'accueil':
      return AccueilSlots.all;
    case 'gonflage':
      return GonflageSlots.all;
    case 'encadrant':
      return EncadrantSlots.all;
    case 'theorie':
      return TheorieSlots.all;
    default:
      return [];
  }
}

/// Vérifier si un rôle supporte les créneaux horaires
bool roleHasSlots(String role) {
  return role == 'accueil' || role == 'gonflage' || role == 'encadrant' || role == 'theorie';
}

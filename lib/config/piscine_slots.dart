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
  static const String h2115 = '21h15';

  static const List<String> all = [h1945, h2015, h2115];

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

  static String displayName(String slot) {
    switch (slot) {
      case premiereHeure:
        return '1ère heure';
      case deuxiemeHeure:
        return '2ème heure';
      default:
        return slot;
    }
  }
}

// --- Créneaux théorie ---
class TheorieSlots {
  static const String h1930 = '19h30';
  static const String h2145 = '21h45';
  static const String h2230 = '22h30';

  static const List<String> all = [h1930, h2145, h2230];

  static String displayName(String slot) {
    switch (slot) {
      case h1930:
        return 'Théorie 19h30';
      case h2145:
        return 'Théorie 21h45';
      case h2230:
        return 'Théorie 22h30';
      default:
        return slot;
    }
  }
}

// --- Créneaux accueil ---
class AccueilSlots {
  static const String h2015 = '20h15';
  static const String h2115 = '21h15';

  static const List<String> all = [h2015, h2115];

  static String displayName(String slot) {
    // Les noms de slots sont déjà lisibles
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

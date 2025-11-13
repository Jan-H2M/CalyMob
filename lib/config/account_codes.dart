/// Codes comptables pour les dépenses du club Calypso
/// Extrait de calypso-accounts.ts (dépenses uniquement)
class AccountCode {
  final String code;
  final String label;
  final String category;
  final bool isFavorite;

  const AccountCode({
    required this.code,
    required this.label,
    required this.category,
    this.isFavorite = false,
  });

  @override
  String toString() => '$code - $label';
}

/// Liste complète des codes comptables de dépenses
final List<AccountCode> expenseAccountCodes = [
  // Cotisations et affiliations
  AccountCode(
    code: '730-00-610',
    label: 'Lifras - Cotisation club (A)',
    category: 'Cotisations',
  ),
  AccountCode(
    code: '730-00-611',
    label: 'Lifras - Cotisation membres (A)',
    category: 'Cotisations',
  ),
  AccountCode(
    code: '730-00-612',
    label: 'Cotisations des membres plongeurs (A)',
    category: 'Cotisations',
  ),
  AccountCode(
    code: '730-00-613',
    label: 'Cotisations instructeurs (A)',
    category: 'Cotisations',
  ),
  AccountCode(
    code: '730-00-614',
    label: 'Cotisations administrateurs (A)',
    category: 'Cotisations',
  ),
  AccountCode(
    code: '730-00-615',
    label: 'Cotisation autres (A)',
    category: 'Cotisations',
  ),

  // Assurances
  AccountCode(
    code: '611-00-616',
    label: 'Assurance sport',
    category: 'Assurances',
  ),
  AccountCode(
    code: '611-00-618',
    label: 'Assurance "administrateurs"',
    category: 'Assurances',
  ),
  AccountCode(
    code: '611-00-619',
    label: 'Assurance matériel',
    category: 'Assurances',
  ),

  // Piscine
  AccountCode(
    code: '610-00-621',
    label: 'Location piscine',
    category: 'Piscine',
    isFavorite: true,
  ),
  AccountCode(
    code: '610-00-628',
    label: 'Salles de cours & frais',
    category: 'Piscine',
  ),
  AccountCode(
    code: '610-00-629',
    label: 'Portes ouvertes',
    category: 'Piscine',
  ),
  AccountCode(
    code: '612-00-625',
    label: 'Divers dépenses bassin',
    category: 'Piscine',
  ),

  // Matériel
  AccountCode(
    code: '612-00-622',
    label: 'Entretien & réparation matériel',
    category: 'Matériel',
  ),
  AccountCode(
    code: '612-00-623',
    label: 'Frais de compresseur',
    category: 'Matériel',
  ),
  AccountCode(
    code: '612-00-624',
    label: 'Achat de matériel',
    category: 'Matériel',
  ),

  // Sorties et activités
  AccountCode(
    code: '617-00-630',
    label: 'Sortie école de mer année courante (A)',
    category: 'Sorties',
  ),
  AccountCode(
    code: '617-00-634',
    label: 'Sortie école de mer année precedente (A)',
    category: 'Sorties',
  ),
  AccountCode(
    code: '618-00-632',
    label: 'Sorties plongées (A)',
    category: 'Sorties',
    isFavorite: true,
  ),
  AccountCode(
    code: '619-00-633',
    label: 'Sorties non plongées (A)',
    category: 'Sorties',
  ),

  // Boutique et stock
  AccountCode(
    code: '600-00-641',
    label: 'Stock Boutique (A)',
    category: 'Boutique',
  ),
  AccountCode(
    code: '604-00-640',
    label: 'Remboursement Boutique',
    category: 'Boutique',
  ),
  AccountCode(
    code: '713-00-642',
    label: 'Depreciation Stock Boutique',
    category: 'Boutique',
  ),

  // Site web et formation
  AccountCode(
    code: '614-00-643',
    label: 'Site Web',
    category: 'Administration',
  ),
  AccountCode(
    code: '614-00-629',
    label: 'Portes ouvertes',
    category: 'Administration',
  ),
  AccountCode(
    code: '615-00-644',
    label: 'TSA',
    category: 'Administration',
  ),
  AccountCode(
    code: '615-00-646',
    label: 'Divers activités (A)',
    category: 'Activités',
  ),
  AccountCode(
    code: '616-00-645',
    label: 'Frais lié au passage de brevet de moniteur',
    category: 'Formation',
  ),

  // Soirée annuelle
  AccountCode(
    code: '664-00-650',
    label: 'Soirée annuelle - Dépenses (A)',
    category: 'Événements',
  ),

  // Frais bancaires et divers
  AccountCode(
    code: '657-00-660',
    label: 'Frais de banque',
    category: 'Frais bancaires',
  ),
  AccountCode(
    code: '613-00-662',
    label: 'Réunions moniteurs-instructeurs',
    category: 'Réunions',
  ),
  AccountCode(
    code: '613-00-663',
    label: 'Réunions du CA',
    category: 'Réunions',
  ),
  AccountCode(
    code: '613-00-664',
    label: 'Assemblées générales',
    category: 'Réunions',
  ),
  AccountCode(
    code: '620-00-665',
    label: 'Cadeaux (mariages, départ,…)',
    category: 'Divers',
  ),
  AccountCode(
    code: '620-00-666',
    label: 'Divers (A)',
    category: 'Divers',
  ),

  // Reports année suivante
  AccountCode(
    code: '490-00-631',
    label: 'Sortie école de mer année suivante (A)',
    category: 'Reports',
  ),
  AccountCode(
    code: '490-00-635',
    label: 'Frais engagés pour activités année suivante (A)',
    category: 'Reports',
  ),
];

/// Obtenir les catégories uniques
List<String> getCategories() {
  final categories = expenseAccountCodes
      .map((code) => code.category)
      .toSet()
      .toList();
  categories.sort();
  return categories;
}

/// Obtenir les codes par catégorie
List<AccountCode> getCodesByCategory(String category) {
  return expenseAccountCodes
      .where((code) => code.category == category)
      .toList();
}

/// Trouver un code par son code comptable
AccountCode? findByCode(String codeValue) {
  try {
    return expenseAccountCodes.firstWhere(
      (code) => code.code == codeValue,
    );
  } catch (e) {
    return null;
  }
}

/// Obtenir les codes comptables triés (favoris en premier, puis par code)
List<AccountCode> getSortedExpenseAccountCodes() {
  final codes = List<AccountCode>.from(expenseAccountCodes);
  codes.sort((a, b) {
    // Favoris en premier
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    // Puis tri par code
    return a.code.compareTo(b.code);
  });
  return codes;
}

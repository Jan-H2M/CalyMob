import 'activity_item.dart';

enum ExpenseReimbursementType {
  plongee(
    code: 'plongee',
    label: 'Plongée (sorties en milieu naturel)',
    activityCategory: AgendaActivityCategory.plongee,
  ),
  piscine(
    code: 'piscine',
    label: 'Piscine/formation',
    activityCategory: AgendaActivityCategory.piscine,
  ),
  sortie(
    code: 'sortie',
    label: 'Sortie/événement (fête, excursion)',
    activityCategory: AgendaActivityCategory.sortie,
  ),
  boutique(code: 'boutique', label: 'Boutique'),
  materiel(code: 'materiel', label: 'Matériel/entretien (incl. gonflage)'),
  administratif(code: 'administratif', label: 'Administratif/autres');

  const ExpenseReimbursementType({
    required this.code,
    required this.label,
    this.activityCategory,
  });

  final String code;
  final String label;
  final AgendaActivityCategory? activityCategory;

  bool get supportsActivity => activityCategory != null;
  bool get supportsBoutique => this == ExpenseReimbursementType.boutique;

  static ExpenseReimbursementType? fromCode(String? code) {
    if (code == null) return null;
    for (final type in values) {
      if (type.code == code) return type;
    }
    return null;
  }
}

String reimbursementTypeLabel(String? code) =>
    ExpenseReimbursementType.fromCode(code)?.label ?? code ?? '';

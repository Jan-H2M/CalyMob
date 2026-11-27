import 'package:unorm_dart/unorm_dart.dart' as unorm;

const ordinaryMemberTariffProblem =
    'Ajoutez un tarif « Membre » de catégorie « membre » pour les membres ordinaires. '
    'Décochez « Invités uniquement » pour ce tarif.';

final _combiningMarks = RegExp(r'[\u0300-\u036f]');
final _pluralSuffix = RegExp(r's$');

String _normalizedFunction(Object? value) => value is String
    ? unorm
        .nfd(value.trim().toLowerCase())
        .replaceAll(_combiningMarks, '')
        .replaceFirst(_pluralSuffix, '')
    : '';

/// Mirrors the server's category lookup, including the order of label fallbacks.
String registrationTariffCategory(Object? category, Object? label) {
  final explicit = _normalizedFunction(category);
  if (explicit.isNotEmpty) return explicit;
  final normalized = _normalizedFunction(label);
  if (normalized.contains('encadrant')) return 'encadrant';
  if (normalized == 'ca' || normalized.contains('comite')) return 'ca';
  if (normalized.contains('junior')) return 'junior';
  if (normalized.contains('etudiant')) return 'etudiant';
  if (normalized.contains('non-membre') || normalized.contains('non membre')) {
    return 'non-membre';
  }
  return normalized.contains('membre') ? 'membre' : normalized;
}

bool _hasLabel(Object? value) => value is String && value.trim().isNotEmpty;
bool _validPrice(Object? value) => value is num && value.isFinite && value >= 0;
bool _positivePrice(Object? value) =>
    value is num && value.isFinite && value > 0;

bool isOrdinaryMemberTariff(Map tariff) =>
    tariff['is_guest_tariff'] != true &&
    registrationTariffCategory(tariff['category'], tariff['label']) == 'membre';

bool _hasPaidTariffs(Iterable<Map> tariffs) =>
    tariffs.any((tariff) => _positivePrice(tariff['price']));

List<String> eventTariffProblems(
  Map<String, dynamic> config, {
  Iterable<Map<String, dynamic>> previousTariffs = const [],
}) {
  final problems = <String>{};
  final rawTariffs = config['event_tariffs'];
  final tariffs = rawTariffs is List ? rawTariffs : const [];
  if (rawTariffs != null && rawTariffs is! List) {
    problems.add(
        'Recréez la liste des tarifs dans la configuration de l’événement.');
  }
  final ids = <Object?>{};
  for (final row in tariffs) {
    final tariff = row is Map ? row : const {};
    final id = tariff['id'];
    if (!_hasLabel(id) || !ids.add(id)) {
      problems.add('Chaque tarif doit avoir un identifiant unique.');
    }
    if (!_hasLabel(tariff['label'])) {
      problems.add('Donnez un libellé à chaque tarif.');
    }
    if (!_validPrice(tariff['price'])) {
      problems.add(
        'Saisissez un prix valide, supérieur ou égal à zéro, pour chaque tarif.',
      );
    }
    final amounts = tariff['installment_amounts'];
    if (amounts is Map &&
        amounts.values.any((amount) => !_validPrice(amount))) {
      problems
          .add('Chaque montant de tranche doit être valide et positif ou nul.');
    }
  }

  final priceTbd = config['price_tbd'] == true;
  if (config['payment_plan_enabled'] == true && !priceTbd) {
    final rawInstallments = config['payment_installments'];
    final installments = rawInstallments is List ? rawInstallments : const [];
    final installmentIds = <Object?>{};
    if (installments.isEmpty ||
        installments.any((item) =>
            item is! Map ||
            !_hasLabel(item['id']) ||
            !installmentIds.add(item['id']) ||
            !_hasLabel(item['label']))) {
      problems
          .add('Définissez des tranches distinctes avec un nom pour chacune.');
    }
    if (tariffs.isEmpty) {
      problems.add(
          'Ajoutez un tarif membre avant d’activer le paiement en tranches.');
    }
    for (final tariff in tariffs.whereType<Map>()) {
      final label = tariff['label'];
      if (!_hasLabel(label)) continue;
      final perInstallment = tariff['installment_amounts'];
      final amounts = [
        for (final item in installments)
          perInstallment is Map && item is Map
              ? perInstallment[item['id']]
              : null,
      ];
      final price = tariff['price'];
      if (amounts.any((amount) => !_validPrice(amount))) {
        problems.add(
          'Complétez chaque montant de tranche du tarif « $label » dans Tarifs (0 € si aucun montant n’est dû).',
        );
      } else if (price is num &&
          (amounts.cast<num>().fold<num>(0, (sum, amount) => sum + amount) -
                      price)
                  .abs() >
              0.005) {
        problems.add(
            'La somme des tranches du tarif « $label » doit correspondre à son prix.');
      }
    }
  }

  final tariffMaps = tariffs.whereType<Map>();
  if (tariffs.isNotEmpty && !tariffMaps.any(isOrdinaryMemberTariff)) {
    problems.add(ordinaryMemberTariffProblem);
  }
  if (!priceTbd) {
    final legacyPaidPrice = _positivePrice(config['prix_membre']);
    final paymentRequired = config['payment_required'];
    if (tariffs.isEmpty &&
        !legacyPaidPrice &&
        (paymentRequired == true ||
            (paymentRequired != false && _hasPaidTariffs(previousTariffs)))) {
      problems.add(
        'Une activité payante ne peut pas perdre tous ses tarifs et devenir gratuite implicitement. '
        'Ajoutez un tarif membre explicite (0 € si sa gratuité est voulue).',
      );
    }
    final paid = paymentRequired != false &&
        (legacyPaidPrice || _hasPaidTariffs(tariffMaps));
    if (config['allow_guests'] == true &&
        paid &&
        !tariffMaps.any((tariff) => tariff['is_guest_tariff'] == true)) {
      problems.add(
        'Les invités sont autorisés mais leur tarif manque. '
        'Ajoutez un tarif « Invités uniquement » (0 € si leur gratuité est voulue).',
      );
    }
  }
  return problems.toList();
}

double? parseEventPriceInput(String input) {
  final value = double.tryParse(input.trim().replaceAll(',', '.'));
  return value != null && _validPrice(value) ? value : null;
}

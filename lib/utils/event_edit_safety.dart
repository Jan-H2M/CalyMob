import '../models/operation.dart';

class EventSettingsConflict implements Exception {
  final List<String> fields;
  const EventSettingsConflict(this.fields);
}

class EventSettingsInvalid implements Exception {
  final String message;
  const EventSettingsInvalid(this.message);
}

double? parseEventPriceInput(String input) {
  final value = double.tryParse(input.trim().replaceAll(',', '.'));
  return value != null && value.isFinite && value >= 0 ? value : null;
}

/// Paid events with guests need an explicit guest rate, including an
/// explicit zero rate when guests really are free.
void validateEventSettings(Map<String, dynamic> values) {
  final tariffs = values['event_tariffs'] as List? ?? const [];
  for (final tariff in tariffs.whereType<Map>()) {
    final price = tariff['price'];
    if (price is! num || !price.isFinite || price < 0) {
      throw const EventSettingsInvalid('Le prix d’un tarif est invalide.');
    }
  }
  final supplements = values['supplements'] as List? ?? const [];
  for (final supplement in supplements.whereType<Map>()) {
    final price = supplement['price'];
    if (price is! num || !price.isFinite || price < 0) {
      throw const EventSettingsInvalid('Le prix d’un supplément est invalide.');
    }
  }
  if (values['price_tbd'] == true) return;
  if (values['payment_required'] == false &&
      ((values['prix_membre'] is num && (values['prix_membre'] as num) > 0) ||
          tariffs.whereType<Map>().any((tariff) =>
              tariff['price'] is num && (tariff['price'] as num) > 0))) {
    throw const EventSettingsInvalid(
      'Un tarif est payant alors que le paiement est désactivé. Vérifiez les tarifs et les règles de paiement.',
    );
  }
  if (values['payment_required'] != true) return;
  if (values['allow_guests'] == true &&
      !tariffs
          .whereType<Map>()
          .any((tariff) => tariff['is_guest_tariff'] == true)) {
    throw const EventSettingsInvalid(
      'Ajoutez un tarif invité explicite avant d’autoriser les invités.',
    );
  }
}

/// Canonical values shown by the mobile event editor, used for optimistic
/// conflict checks against the current server document.
Map<String, dynamic> eventEditableValues(Operation op) {
  final methods = op.allowedPaymentMethods.toList()..sort();
  return {
    'titre': op.titre.trim(),
    'description': _trimOrNull(op.description),
    'date_debut': op.dateDebut,
    'date_fin': op.dateFin,
    'registration_deadline': op.registrationDeadline,
    'capacite_max': op.capaciteMax,
    'statut': op.statut,
    'event_tariffs': op.eventTariffs
        .map((t) => {...t.toMap(), 'label': t.label.trim()})
        .toList(),
    'supplements': op.supplements
        .map((s) => {...s.toMap(), 'name': s.name.trim()})
        .toList(),
    'price_tbd': op.priceTbd,
    'allow_guests': op.allowGuests,
    'allow_waitlist': op.allowWaitlist,
    'payment_required': op.paymentRequired,
    'prix_membre': op.prixMembre,
    'allowed_payment_methods': methods,
    'registration_confirmation_policy': op.registrationConfirmationPolicy,
    'payment_deadline_days': op.paymentDeadlineDays,
    'communication': _trimOrNull(op.communication),
    'organisateur_id': op.organisateurId,
    'organisateur_nom': op.organisateurNom,
    'montant_prevu': op.montantPrevu,
  };
}

String? _trimOrNull(String? value) {
  final trimmed = value?.trim();
  return trimmed == null || trimmed.isEmpty ? null : trimmed;
}

bool eventEditValueEquals(dynamic a, dynamic b) {
  if (a is DateTime && b is DateTime) return a.isAtSameMomentAs(b);
  if (a is List && b is List) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (!eventEditValueEquals(a[i], b[i])) return false;
    }
    return true;
  }
  if (a is Map && b is Map) {
    if (a.length != b.length) return false;
    return a.keys.every(
        (key) => b.containsKey(key) && eventEditValueEquals(a[key], b[key]));
  }
  return a == b;
}

Map<String, dynamic> changedEventValues(
        Map<String, dynamic> original, Map<String, dynamic> edited) =>
    {
      for (final entry in edited.entries)
        if (!eventEditValueEquals(original[entry.key], entry.value))
          entry.key: entry.value,
    };

List<String> conflictingEventFields(Map<String, dynamic> original,
        Map<String, dynamic> latest, Iterable<String> editedFields) =>
    [
      for (final key in editedFields)
        if (!eventEditValueEquals(original[key], latest[key])) key,
    ];

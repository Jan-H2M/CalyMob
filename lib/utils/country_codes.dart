import 'package:country_picker/country_picker.dart';
import 'package:flutter/widgets.dart';

const supportedCountryNameLocales = <Locale>[
  Locale('fr'),
  Locale('nl'),
  Locale('en'),
];

/// Converts ISO alpha-2 codes and legacy localized country names to the
/// canonical two-letter value stored in Firestore.
String? normalizeCountryCode(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) return null;

  final byCode = CountryParser.tryParseCountryCode(trimmed);
  if (byCode != null) return byCode.countryCode;

  final byName = CountryParser.tryParseCountryName(
    trimmed,
    locales: supportedCountryNameLocales,
  );
  return byName?.countryCode;
}

/// Localized, text-first country label. The ISO code remains visible so the
/// value is never conveyed by a flag alone.
String countryDisplayName(
  String? value, {
  required String languageCode,
  bool includeCode = false,
}) {
  final code = normalizeCountryCode(value);
  if (code == null) return value?.trim() ?? '';
  final locale = switch (languageCode) {
    'nl' => const Locale('nl'),
    'en' => const Locale('en'),
    _ => const Locale('fr'),
  };
  final name = CountryLocalizations(locale).countryName(countryCode: code) ??
      Country.tryParse(code)?.name ??
      code;
  return includeCode ? '$name · $code' : name;
}

String countryDisplayNameForContext(
  BuildContext context,
  String? value, {
  bool includeCode = false,
}) {
  return countryDisplayName(
    value,
    languageCode: Localizations.localeOf(context).languageCode,
    includeCode: includeCode,
  );
}

/// Keeps favorites deterministic and valid for the local country catalogue.
List<String> countryFavorites(Iterable<String?> recentCodes) {
  final result = <String>[];
  for (final raw in [...recentCodes, 'BE', 'NL', 'FR']) {
    final code = normalizeCountryCode(raw);
    if (code != null && !result.contains(code)) result.add(code);
  }
  return result.take(8).toList(growable: false);
}

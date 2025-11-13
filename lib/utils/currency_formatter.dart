import 'package:intl/intl.dart';

/// Formateur de montants en euros
class CurrencyFormatter {
  // Formatter pré-configuré
  static final NumberFormat _currencyFormat = NumberFormat.currency(
    locale: 'fr_FR',
    symbol: '€',
    decimalDigits: 2,
  );

  static final NumberFormat _currencyCompactFormat = NumberFormat.currency(
    locale: 'fr_FR',
    symbol: '€',
    decimalDigits: 0,
  );

  /// Format complet avec 2 décimales: 45,00 €
  static String format(double amount) {
    return _currencyFormat.format(amount);
  }

  /// Format compact sans décimales: 45 €
  static String formatCompact(double amount) {
    // Si le montant a des décimales, utiliser format complet
    if (amount % 1 != 0) {
      return _currencyFormat.format(amount);
    }
    return _currencyCompactFormat.format(amount);
  }

  /// Format avec signe + ou - : +45,00 € ou -25,50 €
  static String formatSigned(double amount) {
    final sign = amount >= 0 ? '+' : '';
    return '$sign${_currencyFormat.format(amount)}';
  }
}

import 'package:intl/intl.dart';

/// Formateur de dates en français
class DateFormatter {
  // Formatters pré-configurés
  static final DateFormat _shortFormat = DateFormat('dd/MM/yyyy', 'fr_FR');
  static final DateFormat _mediumFormat = DateFormat('d MMM yyyy', 'fr_FR');
  static final DateFormat _longFormat = DateFormat('EEEE d MMMM yyyy', 'fr_FR');
  static final DateFormat _timeFormat = DateFormat('HH:mm', 'fr_FR');
  static final DateFormat _dateTimeFormat = DateFormat('d MMM yyyy à HH:mm', 'fr_FR');

  /// Format court: 15/03/2025
  static String formatShort(DateTime date) {
    return _shortFormat.format(date);
  }

  /// Format moyen: 15 mars 2025
  static String formatMedium(DateTime date) {
    return _mediumFormat.format(date);
  }

  /// Format long: samedi 15 mars 2025
  static String formatLong(DateTime date) {
    return _longFormat.format(date);
  }

  /// Format heure: 14:30
  static String formatTime(DateTime date) {
    return _timeFormat.format(date);
  }

  /// Format date + heure: 15 mars 2025 à 14:30
  static String formatDateTime(DateTime date) {
    return _dateTimeFormat.format(date);
  }

  /// Format relatif: "Aujourd'hui", "Demain", "Dans 3 jours", etc.
  static String formatRelative(DateTime date) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final targetDay = DateTime(date.year, date.month, date.day);
    final difference = targetDay.difference(today).inDays;

    if (difference == 0) return 'Aujourd\'hui';
    if (difference == 1) return 'Demain';
    if (difference == -1) return 'Hier';
    if (difference > 1 && difference <= 7) return 'Dans $difference jours';
    if (difference < -1 && difference >= -7) return 'Il y a ${-difference} jours';

    // Si plus loin, format normal
    return formatMedium(date);
  }
}

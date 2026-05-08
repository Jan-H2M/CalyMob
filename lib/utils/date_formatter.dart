import 'package:intl/intl.dart';

/// Formateur de dates en français
class DateFormatter {
  // Formatters pré-configurés
  static final DateFormat _shortFormat = DateFormat('dd/MM/yyyy', 'fr_FR');
  static final DateFormat _mediumFormat = DateFormat('d MMM yyyy', 'fr_FR');
  static final DateFormat _longFormat = DateFormat('EEEE d MMMM yyyy', 'fr_FR');
  /// Avec jour de la semaine, sans année — pour les en-têtes compacts
  /// (ex: 'dimanche 10 mai').
  static final DateFormat _dayMonthFormat = DateFormat('EEEE d MMMM', 'fr_FR');
  /// Encore plus compact, sans année et avec jour/mois abrégés
  /// (ex: 'dim. 10 mai'). Idéal pour les badges où la place est rare.
  static final DateFormat _dayMonthShortFormat = DateFormat('EEE d MMM', 'fr_FR');
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

  /// Format compact avec jour de la semaine, sans année: 'dimanche 10 mai'.
  /// Utile pour les en-têtes où l'année prend trop de place mais où on
  /// veut quand même rappeler le jour de la semaine.
  static String formatDayMonth(DateTime date) {
    return _dayMonthFormat.format(date);
  }

  /// Idem mais avec abréviations (jour + mois) pour les badges où la
  /// place est encore plus restreinte: 'dim. 10 mai'.
  static String formatDayMonthShort(DateTime date) {
    return _dayMonthShortFormat.format(date);
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

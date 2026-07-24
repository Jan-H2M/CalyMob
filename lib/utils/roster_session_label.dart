import 'package:intl/intl.dart';

const unknownRosterSessionDateLabel = 'Date de séance inconnue';

String formatRosterSessionLabel(DateTime? date) {
  if (date == null) return unknownRosterSessionDateLabel;
  return DateFormat('EEE d MMM', 'fr_FR').format(date);
}

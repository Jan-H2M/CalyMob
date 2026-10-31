import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

enum MedicalValidityStatus { valid, expiringSoon, expired, unknown }

tz.Location? _brussels;
tz.Location get _location {
  if (_brussels == null) {
    try {
      _brussels = tz.getLocation('Europe/Brussels');
    } on tz.LocationNotFoundException {
      tz_data.initializeTimeZones();
      _brussels = tz.getLocation('Europe/Brussels');
    }
  }
  return _brussels!;
}

DateTime _day(DateTime d) => DateTime.utc(d.year, d.month, d.day);

/// Administrative dates are calendar dates, never durations of 365 days.
/// Timestamp fields use Brussels; a date-only string keeps its written day.
DateTime? parseMedicalDate(Object? value) {
  if (value == null) return null;
  if (value is String) {
    value = value.trim();
    final legacy =
        RegExp(r'^(\d{1,2})/(\d{1,2})/(\d{4})$').firstMatch(value.trim());
    if (legacy != null) {
      final d = int.parse(legacy[1]!),
          m = int.parse(legacy[2]!),
          y = int.parse(legacy[3]!);
      final parsed = DateTime.utc(y, m, d);
      return parsed.year == y && parsed.month == m && parsed.day == d
          ? parsed
          : null;
    }
  }
  if (value is String && RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(value)) {
    final d = DateTime.tryParse(value);
    return d != null && d.toIso8601String().startsWith(value) ? _day(d) : null;
  }
  if (value is String) {
    final iso = RegExp(
            r'^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$')
        .firstMatch(value);
    if (iso == null) return null; // No host/device-local datetime guesses.
    final y = int.parse(iso[1]!),
        m = int.parse(iso[2]!),
        d = int.parse(iso[3]!);
    final calendar = DateTime.utc(y, m, d);
    if (calendar.year != y ||
        calendar.month != m ||
        calendar.day != d ||
        int.parse(iso[4]!) > 23 ||
        int.parse(iso[5]!) > 59 ||
        int.parse(iso[6] ?? '0') > 59) {
      return null;
    }
    final zone = iso[7]!;
    if (zone != 'Z' &&
        (int.parse(zone.substring(1, 3)) > 14 ||
            int.parse(zone.substring(4, 6)) > 59 ||
            (int.parse(zone.substring(1, 3)) == 14 &&
                zone.substring(4, 6) != '00'))) {
      return null;
    }
  }
  final DateTime? instant = value is Timestamp
      ? value.toDate()
      : value is DateTime
          ? value
          : value is String
              ? DateTime.tryParse(value)
              : null;
  return instant == null ? null : _day(tz.TZDateTime.from(instant, _location));
}

class MedicalValidity {
  final DateTime? expiresOn;
  final int? daysRemaining;
  final MedicalValidityStatus status;
  const MedicalValidity._(this.expiresOn, this.daysRemaining, this.status);

  factory MedicalValidity.evaluate({
    DateTime? issuedOn,
    DateTime? validUntil,
    DateTime? now,
    bool approved = true,
    bool needsReview = false,
  }) {
    final today = _day(tz.TZDateTime.from(now ?? DateTime.now(), _location));
    if (!approved ||
        needsReview ||
        (issuedOn != null && _day(issuedOn).isAfter(today))) {
      return const MedicalValidity._(null, null, MedicalValidityStatus.unknown);
    }
    DateTime? expiry = validUntil == null ? null : _day(validUntil);
    if (issuedOn != null) {
      // Clamp 29 February to 28 February, not 1 March of the next year.
      final lastDay =
          DateTime.utc(issuedOn.year + 1, issuedOn.month + 1, 0).day;
      final anniversary = DateTime.utc(issuedOn.year + 1, issuedOn.month,
          issuedOn.day > lastDay ? lastDay : issuedOn.day);
      if (expiry == null || anniversary.isBefore(expiry)) expiry = anniversary;
      if (expiry.isBefore(_day(issuedOn))) {
        return const MedicalValidity._(
            null, null, MedicalValidityStatus.unknown);
      }
    }
    if (expiry == null) {
      return const MedicalValidity._(null, null, MedicalValidityStatus.unknown);
    }
    final days = expiry.difference(today).inDays;
    return MedicalValidity._(
        expiry,
        days,
        days < 0
            ? MedicalValidityStatus.expired
            : days <= 30
                ? MedicalValidityStatus.expiringSoon
                : MedicalValidityStatus.valid);
  }
}

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:timezone/data/latest.dart' as timezone_data;
import 'package:timezone/timezone.dart' as timezone;

DateTime? _operationEnd(Map<String, dynamic> operation) {
  final raw = operation['date_fin'];
  if (raw is Timestamp) return raw.toDate();
  if (raw is DateTime) return raw;
  return null;
}

/// Exact end of the seven Brussels-calendar-day window in which an event
/// discussion remains countable and must remain navigable from the event list.
DateTime? eventUnreadUntil(Map<String, dynamic> operation) {
  final end = _operationEnd(operation);
  if (end == null) return null;
  timezone_data.initializeTimeZones();
  final brussels = timezone.getLocation('Europe/Brussels');
  final localEnd = timezone.TZDateTime.from(end, brussels);
  return timezone.TZDateTime(
    brussels,
    localEnd.year,
    localEnd.month,
    localEnd.day + 7,
    localEnd.hour,
    localEnd.minute,
    localEnd.second,
    localEnd.millisecond,
    localEnd.microsecond,
  );
}

/// Canonical event-domain predicate shared by aggregate counts and rows.
///
/// Only actual CalyMob events in a member-visible lifecycle state can own an
/// event-discussion badge. Draft/deleted/other operation types and the legacy
/// piscine operation duplicate are excluded because they have no matching row
/// in the Events list.
bool isUnreadEligibleEvent(Map<String, dynamic> operation, DateTime now) {
  final type = operation['type']?.toString().trim().toLowerCase();
  final category = (operation['event_category'] ?? operation['categorie'])
      ?.toString()
      .trim()
      .toLowerCase();
  final status = operation['statut']?.toString().trim().toLowerCase();
  if (type != 'evenement' ||
      category == 'piscine' ||
      operation['deleted_at'] != null ||
      !const {'ouvert', 'ferme', 'annule'}.contains(status)) {
    return false;
  }
  final expiry = eventUnreadUntil(operation);
  return expiry == null ||
      !timezone.TZDateTime.from(
        now,
        timezone.getLocation('Europe/Brussels'),
      ).isAfter(expiry);
}

bool isCountableEventRegistration(Map<String, dynamic> registration) {
  final status =
      registration['registration_status']?.toString().trim().toLowerCase();
  return !const {'canceled', 'waitlisted', 'withdrawn'}.contains(status);
}

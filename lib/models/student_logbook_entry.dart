/// Carnet de Formation — Personal dive logbook entry (Dart model).
///
/// Mirrors `CalyCompta/src/types/carnetFormation.ts → StudentLogbookEntry`.
/// See `CARNET_DE_FORMATION_TECH.md` v2.1 §6.3 + §7 (counter pattern).

import 'package:cloud_firestore/cloud_firestore.dart';

/// Counter pattern — see tech doc §7.
/// Only true values are stored. No `jour` (default when nuit=false), no `air`
/// (default when nitrox/trimix unset).
class LogbookCounters {
  final bool? exo;
  final bool? nitrox;
  final bool? deco;
  final bool? dp;
  final bool? sf;
  final bool? nuit;
  final bool? mer;
  // WP-07 — marée (mer à marée) + surveillance d'exercice (type CIEL).
  final bool? maree;
  final bool? surveillance;

  const LogbookCounters({
    this.exo,
    this.nitrox,
    this.deco,
    this.dp,
    this.sf,
    this.nuit,
    this.mer,
    this.maree,
    this.surveillance,
  });

  factory LogbookCounters.fromMap(Map<String, dynamic>? map) {
    if (map == null) return const LogbookCounters();
    return LogbookCounters(
      exo: map['exo'] as bool?,
      nitrox: map['nitrox'] as bool?,
      deco: map['deco'] as bool?,
      dp: map['dp'] as bool?,
      sf: map['sf'] as bool?,
      nuit: map['nuit'] as bool?,
      mer: map['mer'] as bool?,
      maree: map['maree'] as bool?,
      surveillance: map['surveillance'] as bool?,
    );
  }

  Map<String, dynamic> toMap() {
    final map = <String, dynamic>{};
    if (exo == true) map['exo'] = true;
    if (nitrox == true) map['nitrox'] = true;
    if (deco == true) map['deco'] = true;
    if (dp == true) map['dp'] = true;
    if (sf == true) map['sf'] = true;
    if (nuit == true) map['nuit'] = true;
    if (mer == true) map['mer'] = true;
    if (maree == true) map['maree'] = true;
    if (surveillance == true) map['surveillance'] = true;
    return map;
  }

  LogbookCounters copyWith({
    bool? exo,
    bool? nitrox,
    bool? deco,
    bool? dp,
    bool? sf,
    bool? nuit,
    bool? mer,
    bool? maree,
    bool? surveillance,
  }) {
    return LogbookCounters(
      exo: exo ?? this.exo,
      nitrox: nitrox ?? this.nitrox,
      deco: deco ?? this.deco,
      dp: dp ?? this.dp,
      sf: sf ?? this.sf,
      nuit: nuit ?? this.nuit,
      mer: mer ?? this.mer,
      maree: maree ?? this.maree,
      surveillance: surveillance ?? this.surveillance,
    );
  }

  bool isOn(String key) {
    switch (key) {
      case 'exo': return exo == true;
      case 'nitrox': return nitrox == true;
      case 'deco': return deco == true;
      case 'dp': return dp == true;
      case 'sf': return sf == true;
      case 'nuit': return nuit == true;
      case 'mer': return mer == true;
      case 'maree': return maree == true;
      case 'surveillance': return surveillance == true;
      default: return false;
    }
  }

  LogbookCounters toggle(String key) {
    final on = isOn(key);
    switch (key) {
      case 'exo': return copyWith(exo: !on);
      case 'nitrox': return copyWith(nitrox: !on);
      case 'deco': return copyWith(deco: !on);
      case 'dp': return copyWith(dp: !on);
      case 'sf': return copyWith(sf: !on);
      case 'nuit': return copyWith(nuit: !on);
      case 'mer': return copyWith(mer: !on);
      case 'maree': return copyWith(maree: !on);
      case 'surveillance': return copyWith(surveillance: !on);
      default: return this;
    }
  }
}

class LogbookBuddy {
  final String? memberId;
  final String name;
  final String? externalOrganization;
  final String? confirmationStatus;

  const LogbookBuddy({
    this.memberId,
    required this.name,
    this.externalOrganization,
    this.confirmationStatus,
  });

  factory LogbookBuddy.fromMap(Map<String, dynamic> map) {
    return LogbookBuddy(
      memberId: map['member_id'],
      name: map['name'] ?? '',
      externalOrganization: map['external_organization'],
      confirmationStatus: map['confirmation_status'],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      if (memberId != null) 'member_id': memberId,
      'name': name,
      if (externalOrganization != null) 'external_organization': externalOrganization,
      if (confirmationStatus != null) 'confirmation_status': confirmationStatus,
    };
  }
}

class StudentLogbookEntry {
  final String id;
  final String memberId;
  final String? memberName;
  final String source; // 'calypso_operation' | 'manual' | 'imported'
  final DateTime date;
  final String? locationId;
  final String locationName;
  final String? country;
  final String? operationId;
  final String? operationTitle;
  final String? palanqueeId;
  final double? depthMaxMeters;
  final int? durationMinutes;
  final LogbookCounters counters;
  final List<LogbookBuddy> buddies;
  final String? notes;
  final List<String> exerciseClaimIds;
  final String validationStatus;
  // WP-07 — zone particulière : 'zelande' | 'glace' | 'epave' | null.
  final String? zone;

  const StudentLogbookEntry({
    required this.id,
    required this.memberId,
    this.memberName,
    required this.source,
    required this.date,
    this.locationId,
    required this.locationName,
    this.country,
    this.operationId,
    this.operationTitle,
    this.palanqueeId,
    this.depthMaxMeters,
    this.durationMinutes,
    this.counters = const LogbookCounters(),
    this.buddies = const [],
    this.notes,
    this.exerciseClaimIds = const [],
    this.validationStatus = 'personal',
    this.zone,
  });

  Map<String, dynamic> toMap() {
    return {
      'member_id': memberId,
      if (memberName != null) 'member_name': memberName,
      'source': source,
      'date': Timestamp.fromDate(date),
      if (locationId != null) 'location_id': locationId,
      'location_name': locationName,
      if (country != null) 'country': country,
      if (operationId != null) 'operation_id': operationId,
      if (operationTitle != null) 'operation_title': operationTitle,
      if (palanqueeId != null) 'palanquee_id': palanqueeId,
      if (depthMaxMeters != null) 'depth_max_meters': depthMaxMeters,
      if (durationMinutes != null) 'duration_minutes': durationMinutes,
      'counters': counters.toMap(),
      'buddies': buddies.map((b) => b.toMap()).toList(),
      if (notes != null && notes!.isNotEmpty) 'notes': notes,
      'exercise_claim_ids': exerciseClaimIds,
      'validation_status': validationStatus,
      if (zone != null) 'zone': zone,
    };
  }
}

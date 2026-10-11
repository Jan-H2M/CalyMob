import 'formation_snapshot_doc.dart';

/// Cumulatieve LIFRAS-ervaring voor alle in `settings/mil_requirements`
/// geconfigureerde brevetten.
///
/// De aantallen zijn bewust niet aan een kalenderjaar gekoppeld: een
/// brevetvereiste geldt over het volledige duikverleden van het lid.
class MilExperienceOverview {
  final Map<String, MilBrevetExperience> byBrevet;
  final String? preferredBrevet;
  final String? sourceVersion;
  final bool snapshotFallback;

  const MilExperienceOverview({
    required this.byBrevet,
    this.preferredBrevet,
    this.sourceVersion,
    this.snapshotFallback = false,
  });

  bool get isEmpty => byBrevet.isEmpty;

  String? get initialBrevet {
    final preferred = preferredBrevet;
    if (preferred != null) {
      return byBrevet.containsKey(preferred) ? preferred : null;
    }
    return byBrevet.isEmpty ? null : byBrevet.keys.first;
  }

  /// Compatibiliteit met bestaande formation snapshots. Een legacy snapshot
  /// bevat slechts het doelbrevet, maar de waarden blijven canoniek bruikbaar
  /// wanneer de live settings/carnet-read tijdelijk niet beschikbaar is.
  factory MilExperienceOverview.fromSnapshot(FormationSnapshotDoc snapshot) {
    final code = milBrevetCodeForTarget(snapshot.targetLevel);
    if (code == null ||
        (!snapshot.hasMil && snapshot.milPerRequirement.isEmpty)) {
      return const MilExperienceOverview(byBrevet: {});
    }
    return MilExperienceOverview(
      preferredBrevet: code,
      snapshotFallback: true,
      byBrevet: {
        code: MilBrevetExperience(
          brevetCode: code,
          requirements: snapshot.milPerRequirement,
          modulePct: snapshot.milModulePct ?? 0,
        ),
      },
    );
  }
}

class MilBrevetExperience {
  final String brevetCode;
  final Map<String, SnapshotMilRequirement> requirements;
  final int modulePct;

  const MilBrevetExperience({
    required this.brevetCode,
    required this.requirements,
    required this.modulePct,
  });
}

String? milBrevetCodeForTarget(String? value) {
  return switch (value?.trim().toUpperCase()) {
    '1' || '1*' || 'P1' || 'NB' => '1',
    '2' || '2*' || 'P2' => '2',
    '3' || '3*' || 'P3' => '3',
    '4' || '4*' || 'P4' => '4',
    'AM' => 'AM',
    'MC' => 'MC',
    'MF' => 'MF',
    _ => null,
  };
}

String? milTargetBrevetFromMember({
  String? targetFormationLevel,
  String? currentCode,
}) {
  final explicit = milBrevetCodeForTarget(targetFormationLevel);
  if (explicit != null) return explicit;
  if (targetFormationLevel?.trim().isNotEmpty == true) {
    return targetFormationLevel!.trim().toUpperCase();
  }
  return switch (currentCode?.trim().toUpperCase()) {
    'NB' => '1',
    '1' || '1*' || 'P1' => '2',
    '2' || '2*' || 'P2' => '3',
    '3' || '3*' || 'P3' => '4',
    '4' || '4*' || 'P4' => 'AM',
    'AM' => 'MC',
    'MC' => 'MF',
    _ => null,
  };
}

/// Eén prioriteitsregel voor alle schermen: de actuele ledenfiche is
/// gezaghebbend; alleen wanneer die geen doel kan leveren gebruiken we het
/// (mogelijk oudere) formation snapshot.
String? resolvePreferredMilBrevet({
  String? targetFormationLevel,
  String? currentCode,
  String? snapshotTargetLevel,
}) {
  return milTargetBrevetFromMember(
        targetFormationLevel: targetFormationLevel,
        currentCode: currentCode,
      ) ??
      milBrevetCodeForTarget(snapshotTargetLevel);
}

String milBrevetLabel(String code) {
  final normalized = code.trim().toUpperCase();
  return switch (normalized) {
    '1' || '2' || '3' || '4' => 'Brevet $normalized*',
    _ => 'Brevet $normalized',
  };
}

import 'dart:convert';
import 'dart:io';
import 'package:calymob/services/mil_experience_service.dart';
import 'package:calymob/utils/dive_depth.dart';
import 'package:calymob/models/formation_snapshot_doc.dart';
import 'package:calymob/models/mil_experience_overview.dart';
import 'package:calymob/models/member_formation_dossier.dart';
import 'package:calymob/models/exercice_lifras.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('legacy snapshot cannot reintroduce non-sea-only depth counts', () {
    FormationSnapshotDoc snapshot(String? version) =>
        FormationSnapshotDoc.fromMap('pupil', {
          'target_level': '3*',
          'mil_experience': {
            'module_pct': 100,
            if (version != null) 'counting_version': version,
            'per_requirement': {
              'prof_30m': {'have': 51, 'need': 30},
              'mer': {'have': 85, 'need': 20}
            }
          }
        });
    final old =
        MilExperienceOverview.fromSnapshot(snapshot(null)).byBrevet['3']!;
    expect(old.requirements['prof_30m']!.dataMissing, true);
    expect(old.requirements['mer']!.have, 85);
    final fixed = MilExperienceOverview.fromSnapshot(
            snapshot('cumulative-general-depths-v2'))
        .byBrevet['3']!;
    expect(fixed.requirements['prof_30m']!.dataMissing, false);
    expect(fixed.requirements['prof_30m']!.have, 51);
    final reconstructed = memberDossierSnapshot(
        memberId: 'pupil',
        currentCode: '2',
        target: NiveauLIFRAS.p3,
        catalog: [],
        validations: [],
        source: snapshot('cumulative-general-depths-v2'));
    final fallback = MilExperienceOverview.fromSnapshot(reconstructed)
        .byBrevet['3']!;
    expect(reconstructed.milCountingVersion, 'cumulative-general-depths-v2');
    expect(fallback.requirements['prof_30m']!.dataMissing, false);
    expect(fallback.requirements['prof_30m']!.have, 51);
    final changedTarget = memberDossierSnapshot(
        memberId: 'pupil',
        currentCode: '2',
        target: NiveauLIFRAS.p4,
        catalog: [],
        validations: [],
        source: snapshot('cumulative-general-depths-v2'));
    expect(changedTarget.milCountingVersion, isNull);
    expect(changedTarget.milPerRequirement, isEmpty);
  });
  final cases = jsonDecode(
          File('test/fixtures/mil_depth_cumulative.json').readAsStringSync())
      as List;
  for (final item in cases) {
    test(item['name'], () {
      final counts = computeMilExperienceCounts(
          [Map<String, dynamic>.from(item['entry'])], {});
      for (final expected in (item['expected'] as Map).entries) {
        expect(counts[expected.key], expected.value, reason: expected.key);
      }
    });
  }
  test('depth bins have explicit ranges and reconcile with exact thresholds',
      () {
    final data = DiveDepthDistribution.fromEntries([
      for (final depth in [
        0,
        4.99,
        5,
        25,
        29.99,
        30,
        34.99,
        35,
        39.99,
        40,
        '40,5',
        57,
        null,
        -1,
        double.nan,
        double.infinity
      ])
        {'depth_max_meters': depth},
      {'source': 'piscine', 'depth_max_meters': 500},
    ]);
    expect(data.buckets, [2, 1, 0, 0, 0, 2, 2, 2, 3]);
    expect(diveDepthLabels.last, '40+');
    expect(diveDepthLabels[7], '35–40');
    expect(data.atLeast[30], 7);
    expect(data.atLeast[40], 3);
    expect(data.unknown, 4);
    expect(data.total, 16);
    expect(data.buckets.reduce((a, b) => a + b) + data.unknown, data.total);
    expect(data.atLeast[30], data.buckets.skip(6).reduce((a, b) => a + b));
  });
}

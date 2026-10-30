import 'package:calymob/models/formation_snapshot_doc.dart';
import 'package:calymob/models/mil_experience_overview.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('all required experience categories must be met, not just total dives',
      () {
    const value =
        MilBrevetExperience(brevetCode: '3', modulePct: 100, requirements: {
      'total': SnapshotMilRequirement(have: 75, need: 75, dataMissing: false),
      'mer': SnapshotMilRequirement(have: 19, need: 20, dataMissing: false),
      'unused': SnapshotMilRequirement(have: 0, need: 0, dataMissing: true),
    });
    expect(value.requiredCount, 2);
    expect(value.attainedCount, 1);
    expect(value.hasMissingData, false);
    expect(value.isSufficient, false);
  });

  test('unknown experience is never sufficient despite aggregate or have', () {
    const value =
        MilBrevetExperience(brevetCode: '3', modulePct: 100, requirements: {
      'total': SnapshotMilRequirement(have: 100, need: 75, dataMissing: true),
    });
    expect(value.hasMissingData, true);
    expect(value.attainedCount, 0);
    expect(value.isSufficient, false);
    expect(
        const MilBrevetExperience(
            brevetCode: '3', modulePct: 100, requirements: {}).isSufficient,
        false);
  });

  test('met requirements make the experience sufficient', () {
    const value =
        MilBrevetExperience(brevetCode: '2', modulePct: 0, requirements: {
      'total': SnapshotMilRequirement(have: 25, need: 25, dataMissing: false),
      '20m': SnapshotMilRequirement(have: 12, need: 10, dataMissing: false),
    });
    expect(value.attainedCount, 2);
    expect(value.isSufficient, true);
  });
}

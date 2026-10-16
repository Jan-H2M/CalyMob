import 'package:calymob/models/mil_experience_overview.dart';
import 'package:calymob/services/mil_experience_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const rules = {
    'cumulative': true,
    'tolerance_pct': 10,
    'zelande': {
      'tolerance_mer_max_40m': true,
      'exclude_deco': true,
      'exclude_beyond_40m': true,
    },
  };

  Map<String, dynamic> dive({
    String date = '2026-01-01',
    double? depth,
    bool sea = false,
    Map<String, dynamic> counters = const {},
    String? zone,
  }) {
    return {
      'source': 'manual',
      'date': date,
      if (depth != null) 'depth_max_meters': depth,
      if (sea) 'water_type': 'sea',
      'counters': counters,
      if (zone != null) 'zone': zone,
    };
  }

  test('one shared calculation exposes every configured brevet', () {
    final overview = calculateMilExperienceOverview(
      entries: [
        dive(date: '2024-06-01', depth: 50, sea: true),
        dive(date: '2026-06-01', depth: 18),
      ],
      settings: const {
        'approved_by': 'lifras-admin',
        'source_version': 'test-v1',
        'counting_rules': rules,
        'experience_table': {
          '2': {'total_milieu_naturel': 5, 'prof_20m': 1, 'mer': 1},
          '3': {'total_milieu_naturel': 10, 'mer_50m': 1},
          'AM': {'encadrement': 3},
        },
      },
      preferredBrevet: '3',
    );

    expect(overview, isNotNull);
    expect(overview!.byBrevet.keys, ['2', '3', 'AM']);
    expect(overview.initialBrevet, '3');
    expect(overview.sourceVersion, 'test-v1');
    expect(
      overview.byBrevet['2']!.requirements['total_milieu_naturel']!.have,
      2,
      reason: 'MIL is lifetime-based and must ignore calendar-year filters',
    );
    expect(overview.byBrevet['2']!.requirements['prof_20m']!.have, 1);
    expect(overview.byBrevet['3']!.requirements['mer_50m']!.have, 1);
    expect(
      overview.byBrevet['AM']!.requirements['encadrement']!.dataMissing,
      isTrue,
    );
  });

  test('Zelande and cumulative thresholds match the snapshot rules', () {
    final counts = computeMilExperienceCounts([
      dive(depth: 18),
      dive(depth: 27),
      dive(depth: 36),
      dive(depth: 27, sea: true, zone: 'zelande'),
      dive(
        depth: 35,
        sea: true,
        zone: 'zelande',
        counters: const {'deco': true},
      ),
      dive(depth: 45, sea: true, zone: 'zelande'),
      dive(
        depth: 42,
        sea: true,
        counters: const {
          'deco': true,
          'dp': true,
          'maree': true,
          'nuit': true,
          'surveillance': true,
        },
      ),
      dive(depth: 50, sea: true),
      {
        'source': 'piscine',
        'depth_max_meters': 50,
        'water_type': 'sea',
        'counters': const {'nuit': true},
      },
    ], rules);

    expect(counts['total_milieu_naturel'], 8);
    expect(counts['prof_20m'], 3);
    expect(counts['prof_30m'], 2);
    expect(counts['prof_40m'], 1);
    expect(counts['mer'], 5);
    expect(counts['mer_30m'], 3);
    expect(counts['mer_40m'], 2);
    expect(counts['mer_45m'], 1);
    expect(counts['mer_50m'], 1);
    expect(counts['dp_mer_deco'], 1);
    expect(counts['mer_maree'], 1);
    expect(counts['nuit'], 1);
    expect(counts['surveillance_ciel'], 1);
  });

  test('unapproved or non-finite settings are never presented as validated',
      () {
    expect(
      calculateMilExperienceOverview(
        entries: const [],
        settings: const {
          'experience_table': {
            '2': {'mer': 5},
          },
        },
      ),
      isNull,
    );

    final overview = calculateMilExperienceOverview(
      entries: const [],
      settings: {
        'approved_by': 'admin',
        'experience_table': {
          '2': {'mer': double.infinity, 'nuit': 2},
        },
      },
    );
    expect(overview!.byBrevet['2']!.requirements.keys, ['nuit']);
  });

  test('an explicit target without MIL table does not infer another brevet',
      () {
    expect(
      milTargetBrevetFromMember(
        targetFormationLevel: 'MN',
        currentCode: 'MC',
      ),
      'MN',
    );
    expect(
      milTargetBrevetFromMember(currentCode: '2*'),
      '3',
    );
    expect(
      resolvePreferredMilBrevet(
        targetFormationLevel: '3*',
        currentCode: '1*',
        snapshotTargetLevel: '2*',
      ),
      '3',
    );
    expect(
      resolvePreferredMilBrevet(snapshotTargetLevel: '2*'),
      '2',
    );
  });

  test('production loader filters the lifetime carnet by member_id', () async {
    final firestore = FakeFirebaseFirestore();
    await firestore.doc('clubs/calypso/settings/mil_requirements').set({
      'approved_by': 'admin',
      'source_version': 'test',
      'counting_rules': rules,
      'experience_table': {
        '2': {'total_milieu_naturel': 2},
      },
    });
    final entries =
        firestore.collection('clubs/calypso/student_logbook_entries');
    await entries.add({
      'member_id': 'member-a',
      'source': 'manual',
      'depth_max_meters': 20,
    });
    await entries.add({
      'member_id': 'member-b',
      'source': 'manual',
      'depth_max_meters': 30,
    });

    final overview = await MilExperienceService(firestore: firestore).load(
      clubId: 'calypso',
      memberId: 'member-a',
      preferredBrevet: '2',
    );

    expect(
      overview!.byBrevet['2']!.requirements['total_milieu_naturel']!.have,
      1,
    );
  });
}

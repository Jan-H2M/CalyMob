import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:calymob/models/dive_computer_import.dart';
import 'package:calymob/services/dive_computer_import_service.dart';

void main() {
  late FakeFirebaseFirestore firestore;
  late DiveComputerImportService service;
  const path = 'clubs/calypso/student_logbook_entries';
  final equipment = <String, dynamic>{
    'combi': {'type': 'etanche', 'label': 'Étanche'},
    'combi_type': 'etanche',
    'tank': {'volume_l': 15, 'pressure_bar': 232},
    'lestage_kg': 8,
  };

  setUp(() {
    firestore = FakeFirebaseFirestore();
    service = DiveComputerImportService(firestore: firestore);
  });

  Future<void> seedHistory() async {
    await firestore.doc('$path/older').set({
      'member_id': 'member',
      'date': Timestamp.fromDate(DateTime(2026, 10, 1)),
      'dive_number': 442,
      ...equipment,
      'lestage_kg': 6,
    });
    await firestore.doc('$path/equipped').set({
      'member_id': 'member',
      'date': Timestamp.fromDate(DateTime(2026, 10, 20)),
      'dive_number': 443,
      ...equipment,
    });
    await firestore.doc('$path/empty').set({
      'member_id': 'member',
      'date': Timestamp.fromDate(DateTime(2026, 10, 23)),
      'combi': {},
      'tank': {},
    });
    await firestore.doc('$path/other-member').set({
      'member_id': 'other',
      'date': Timestamp.fromDate(DateTime(2026, 10, 24)),
      'dive_number': 999,
      ...equipment,
      'lestage_kg': 100,
    });
    await firestore.doc('clubs/calypso/dive_locations/ras-il-hobz').set({
      'name': 'Gozo - Ras il-Hobz',
      'latitude': 36.02,
      'longitude': 14.29,
      'country': 'MT',
      'water_type': 'sea',
      'zone': 'epave',
    });
    await firestore.doc('clubs/calypso/dive_locations/further').set({
      'name': 'Further site',
      'latitude': 36.06,
      'longitude': 14.29,
      'country': 'MT',
    });
  }

  for (final name in [null, '', '  ', '(à compléter)']) {
    test(
        'GPS fallback resolves missing site $name and all standard dive fields',
        () async {
      await seedHistory();
      final preview = _preview();
      final id = await service.saveAsNewEntry(
        clubId: 'calypso',
        memberId: 'member',
        memberName: 'Test',
        preview: preview,
        originalBytes: Uint8List(0),
        locationName: name,
      );
      final data = (await firestore.doc('$path/$id').get()).data()!;
      expect(data['location_name'], 'Gozo - Ras il-Hobz');
      expect(data['location_id'], 'ras-il-hobz');
      expect(data['country'], 'MT');
      expect(data['zone'], 'epave');
      expect(data['entry_time_str'], '21:15');
      expect(data['exit_time_str'], '22:21');
      expect((data['exit_time'] as Timestamp).toDate(),
          preview.startedAt.add(Duration(seconds: preview.durationSeconds)));
      expect(data['water_temp_c'], 17.2);
      expect(data['counters'], {'mer': true, 'deco': true, 'nuit': true});
      expect(data['dive_number'], 444);
      for (final key in equipment.keys) {
        expect(data[key], equipment[key]);
      }
      expect(data['tank_summaries'], isNotEmpty);
      expect(data['profile_samples'], isNotEmpty);
      expect(data['computer_events'], isNotEmpty);
      expect(data.containsKey('start_latitude'), isFalse);
      expect(data.containsKey('start_longitude'), isFalse);
    });
  }

  test('a custom site takes precedence over GPS and keeps all its metadata',
      () async {
    await seedHistory();
    final id = await service.saveAsNewEntry(
      clubId: 'calypso',
      memberId: 'member',
      memberName: 'Test',
      preview: _preview(),
      originalBytes: Uint8List(0),
      locationId: 'chosen',
      locationName: 'Chosen site',
      country: 'NL',
      isSea: true,
      zone: 'zelande',
    );
    final data = (await firestore.doc('$path/$id').get()).data()!;
    expect(data['location_name'], 'Chosen site');
    expect(data['location_id'], 'chosen');
    expect(data['country'], 'NL');
    expect(data['zone'], 'zelande');
    expect(data['counters']['mer'], isTrue);
  });

  for (final hashField in [
    'source_hash',
    'computer_source_hash',
    'computer_import'
  ]) {
    test('reimport repairs $hashField in place and preserves member edits',
        () async {
      await seedHistory();
      await firestore.doc('$path/dive-444').set({
        'member_id': 'member',
        'source': 'dive_computer',
        'dive_number': 444,
        'location_name': '(à compléter)',
        'notes': 'Keep these notes',
        'binomes': [
          {'name': 'Buddy'}
        ],
        hashField:
            hashField == 'computer_import' ? {'source_hash': 'hash'} : 'hash',
      });
      final id = await service.saveAsNewEntry(
        clubId: 'calypso',
        memberId: 'member',
        memberName: 'Test',
        preview: _preview(),
        originalBytes: Uint8List(0),
      );
      expect(id, 'dive-444');
      final data = (await firestore.doc('$path/$id').get()).data()!;
      expect(data['location_name'], 'Gozo - Ras il-Hobz');
      expect(data['notes'], 'Keep these notes');
      expect(data['binomes'], [
        {'name': 'Buddy'}
      ]);
      expect(data['dive_number'], 444);
      expect(data['exit_time_str'], '22:21');
      expect(data['counters']['deco'], isTrue);
      expect(data['lestage_kg'], 8);
      expect((await firestore.collection(path).get()).docs, hasLength(5));
      await expectLater(
          service.saveAsNewEntry(
            clubId: 'calypso',
            memberId: 'member',
            memberName: 'Test',
            preview: _preview(),
            originalBytes: Uint8List(0),
          ),
          throwsA(isA<DuplicateDiveComputerImport>()));
    });
  }

  test(
      'repair preserves an existing site, counters, times and custom equipment',
      () async {
    await seedHistory();
    await firestore.doc('$path/dive-444').set({
      'member_id': 'member',
      'source': 'dive_computer',
      'dive_number': 444,
      'computer_source_hash': 'hash',
      'location_name': 'Member corrected site',
      'location_id': 'corrected',
      'country': 'BE',
      'zone': 'glace',
      'entry_time_str': '10:01',
      'exit_time_str': '11:05',
      'counters': {'mer': false, 'exo': true},
      'combi_type': 'humide',
      'lestage_kg': 0,
      'water_temp_c': 12,
    });
    await firestore.doc('$path/dive-444').update({'exit_time_str': ''});
    await service.saveAsNewEntry(
      clubId: 'calypso',
      memberId: 'member',
      memberName: 'Test',
      preview: _preview(),
      originalBytes: Uint8List(0),
      locationName: 'GPS suggestion',
      country: 'MT',
    );
    final data = (await firestore.doc('$path/dive-444').get()).data()!;
    expect(data['location_name'], 'Member corrected site');
    expect(data['location_id'], 'corrected');
    expect(data['country'], 'BE');
    expect(data['zone'], 'glace');
    expect(data['counters']['mer'], isFalse);
    expect(data['counters']['exo'], isTrue);
    expect(data['entry_time_str'], '10:01');
    expect(data['combi_type'], 'humide');
    expect(data['combi'], isNull);
    expect(data['lestage_kg'], 0);
    expect(data['water_temp_c'], 12);
  });

  test('opening a legacy dive 444 heals GPS, exit, temperature and equipment',
      () async {
    await seedHistory();
    final preview = _preview();
    await firestore.doc('$path/dive-444').set({
      'member_id': 'member',
      'source': 'dive_computer',
      'dive_number': 444,
      'date': Timestamp.fromDate(preview.startedAt),
      'location_name': '(à compléter)',
      'start_latitude': 36.02,
      'start_longitude': 14.29,
      'computer_import': preview.computerImportMetadata(importId: 'legacy')
        ..['profile'] = preview.profile.toStorageJson(),
      'notes': 'Keep',
    });
    final data = (await service.repairExistingEntry(
        clubId: 'calypso', memberId: 'member', entryId: 'dive-444'))!;
    expect(data, (await firestore.doc('$path/dive-444').get()).data());
    expect(data['location_name'], 'Gozo - Ras il-Hobz');
    expect(data['location_id'], 'ras-il-hobz');
    expect(data['country'], 'MT');
    expect(data['zone'], 'epave');
    expect(data['exit_time_str'], '22:21');
    expect((data['exit_time'] as Timestamp).toDate(),
        preview.startedAt.add(Duration(seconds: preview.durationSeconds)));
    expect(data['water_temp_c'], 17.2);
    expect(data['counters'], {'mer': true, 'deco': true, 'nuit': true});
    for (final key in equipment.keys) {
      expect(data[key], equipment[key]);
    }
    expect(data['dive_number'], 444);
    expect(data['notes'], 'Keep');
  });

  test('repair never edits a different member or a manual entry', () async {
    for (final source in ['manual', 'dive_computer']) {
      await firestore.doc('$path/protected').set({
        'member_id': 'other',
        'source': source,
        'location_name': '',
      });
      expect(
          await service.repairExistingEntry(
              clubId: 'calypso', memberId: 'member', entryId: 'protected'),
          isNull);
      expect((await firestore.doc('$path/protected').get()).data()!.length, 3);
    }
  });

  test('sea inference and exit fallback work without GPS and across midnight',
      () {
    expect(DiveComputerImportService.isSeaLocation(name: 'Gozo'), isTrue);
    expect(DiveComputerImportService.isSeaLocation(country: 'Malta'), isTrue);
    expect(DiveComputerImportService.isSeaLocation(name: 'Zélande'), isTrue);
    expect(
        DiveComputerImportService.isSeaLocation(name: 'Vodelée', country: 'BE'),
        isFalse);
    final start = DateTime(2026, 10, 24, 23, 45);
    expect(
        DiveComputerImportService.inferredExitTime({
          'date': Timestamp.fromDate(start),
          'duration_minutes': 45,
        }),
        DateTime(2026, 10, 25, 0, 30));
    expect(
        DiveComputerImportService.inferredExitTime({
          'date': Timestamp.fromDate(DateTime(2026, 10, 24)),
          'entry_time_str': '00:00',
          'duration_minutes': 45,
        }),
        DateTime(2026, 10, 24, 0, 45));
  });

  test('privacy filtered source always removes identifiers and route', () {
    final input = Uint8List.fromList(utf8.encode(jsonEncode({
      'DeviceLog': {
        'Device': {'Name': 'private', 'SerialNumber': 'private'},
        'Header': {
          'Personal': {'Name': 'private'}
        },
        'Samples': [
          {
            'Latitude': 1,
            'Longitude': 2,
            'DiveRoute': {'X': 1},
            'Depth': 3
          }
        ]
      }
    })));
    final decoded = jsonDecode(
            utf8.decode(DiveComputerImportService.privacyFilteredSource(input)))
        as Map;
    final text = jsonEncode(decoded);
    expect(text, isNot(contains('Latitude')));
    expect(text, isNot(contains('SerialNumber')));
    expect(text, isNot(contains('Personal')));
    expect(text, isNot(contains('DiveRoute')));
    expect(text, contains('Depth'));
  });
}

DiveComputerImportPreview _preview() {
  final start = DateTime(2026, 10, 24, 21, 15);
  final events = [
    DiveDeviceEvent(at: start, category: 'warning', type: 'ceiling')
  ];
  return DiveComputerImportPreview(
    vendor: 'suunto',
    sourceHash: 'hash',
    startedAt: start,
    startedAtSource: start.toIso8601String(),
    durationSeconds: 4016,
    maxDepthValue: 61.3,
    depthUnit: UnitProvenance.declared,
    minTemperatureValue: 17.2,
    maxTemperatureValue: 25.4,
    temperatureUnit: UnitProvenance.declared,
    tanks: const [
      DiveTankSummary(
          gasNumber: 0,
          startPressureValue: 224.5,
          endPressureValue: 33.3,
          pressureUnit: UnitProvenance.declared)
    ],
    gasNumbers: const [0],
    events: events,
    profile: DiveComputerProfile(depth: [
      DiveProfilePoint(at: start, value: 0, unit: UnitProvenance.declared),
      DiveProfilePoint(
          at: start.add(const Duration(minutes: 1)),
          value: 61.3,
          unit: UnitProvenance.declared),
    ], temperature: [
      DiveProfilePoint(at: start, value: 17.2, unit: UnitProvenance.declared)
    ], pressureByGas: const {}, events: events),
    locationHint: const DiveLocationHint(36.02, 14.29),
    warnings: const [],
  );
}

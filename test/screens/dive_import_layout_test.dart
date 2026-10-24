import 'dart:convert';

import 'package:calymob/config/app_colors.dart';
import 'package:calymob/models/dive_computer_import.dart';
import 'package:calymob/screens/training/logbook_entry_detail_screen.dart';
import 'package:calymob/screens/training/suunto_import_screen.dart';
import 'package:calymob/services/dive_site_source.dart';
import 'package:calymob/widgets/dive_location_picker.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('calymob/suunto_share_inbox');

  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  testWidgets(
      'tapping the suggested chip keeps it selected and clears a custom site',
      (tester) async {
    tester.view.physicalSize = const Size(1000, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final bytes = Uint8List.fromList(utf8.encode(jsonEncode({
      'DeviceLog': {
        'Header': {'DateTime': '2026-10-24T10:00:00Z', 'DiveTime': 3600},
        'Samples': [
          {
            'TimeISO8601': '2026-10-24T10:00:00Z',
            'Depth': 0,
            'DiveRouteOrigin': {'Latitude': 36.02, 'Longitude': 14.29}
          },
          {'TimeISO8601': '2026-10-24T11:00:00Z', 'Depth': 20},
        ],
      },
    })));
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
            channel,
            (call) async => call.method == 'consume'
                ? {
                    'id': 'share',
                    'filename': 'test.json',
                    'uti': 'public.json',
                    'bytes': bytes
                  }
                : null);
    await tester.pumpWidget(MaterialApp(
        home: SuuntoImportScreen(
      memberId: 'member',
      clubId: 'test-club',
      diveSiteSource: _Sites(),
    )));
    await tester.pump();
    await tester.pump();
    final chip = find.byType(ChoiceChip);
    expect(chip, findsOneWidget);
    expect(tester.widget<ChoiceChip>(chip).selected, isTrue);
    await tester.tap(chip);
    await tester.pump();
    expect(tester.widget<ChoiceChip>(chip).selected, isTrue);
    expect(
        tester.widget<ChoiceChip>(chip).selectedColor, AppColors.middenblauw);
    expect(tester.widget<ChoiceChip>(chip).showCheckmark, isTrue);
    expect(tester.widget<ChoiceChip>(chip).checkmarkColor, Colors.white);
    final picker = tester
        .widget<DiveLocationPickerField>(find.byType(DiveLocationPickerField));
    expect(picker.clubId, 'test-club');
    expect(picker.uid, 'member');
    picker.onSelected(const DiveLocationSelection(
        id: 'custom',
        name: 'Custom sea site',
        country: 'NL',
        isSea: true,
        zone: 'zelande'));
    await tester.pump();
    expect(tester.widget<ChoiceChip>(chip).selected, isFalse);
    expect(find.text('Custom sea site'), findsOneWidget);
    expect(
        tester
            .widget<DiveLocationPickerField>(
                find.byType(DiveLocationPickerField))
            .value!
            .isSea,
        isTrue);
    await tester.tap(chip);
    await tester.pump();
    expect(tester.widget<ChoiceChip>(chip).selected, isTrue);
    expect(
        tester
            .widget<DiveLocationPickerField>(
                find.byType(DiveLocationPickerField))
            .value,
        isNull);
  });

  for (final source in ['manual', 'dive_computer']) {
    testWidgets('$source uses the same cards, exit fallback and tank pressure',
        (tester) async {
      tester.view.physicalSize = const Size(1000, 2000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(MaterialApp(
          home: LogbookEntryDetailScreen(
        entryId: 'dive-444',
        data: {
          'source': source,
          'member_id': 'member',
          'dive_number': 444,
          'date': Timestamp.fromDate(DateTime(2026, 10, 24, 10, 15)),
          'duration_minutes': 67,
          'depth_max_meters': 61.3,
          'location_name': 'Gozo - Ras il-Hobz',
          'country': 'MT',
          'notes': 'Notes',
          'tank_summaries': const [
            {'start_pressure_value': 224.5, 'end_pressure_value': 33.3},
          ],
          if (source == 'dive_computer')
            'computer_import': {
              'id': 'import',
              'profile': {
                'recorded': {
                  'depth': [
                    {'value': 0},
                    {'value': 61.3}
                  ],
                  'pressure_by_gas': {
                    '0': [
                      {'value': 224.5},
                      {'value': 33.3}
                    ]
                  },
                }
              },
            },
        },
      )));
      await tester.pump();
      expect(find.byIcon(Icons.waves), findsOneWidget);
      expect(find.text('11:22'), findsOneWidget);
      expect(find.text('—:—'), findsNothing);
      expect(find.text('225 → 33 bar (-191 bar)'), findsOneWidget);
      expect(find.text('Aucun binôme renseigné'), findsOneWidget);
      final labels = [
        'Gozo - Ras il-Hobz',
        'QUAND',
        'PROFONDEUR MAX',
        'COMPTEURS',
        'ÉQUIPEMENT',
        'BINÔMES',
        'Notes',
        'SOURCE'
      ];
      for (var i = 0; i < labels.length - 1; i++) {
        expect(tester.getTopLeft(find.text(labels[i])).dy,
            lessThan(tester.getTopLeft(find.text(labels[i + 1])).dy));
      }
      if (source == 'dive_computer') {
        expect(
            tester.getTopLeft(find.text('SOURCE')).dy,
            lessThan(tester
                .getTopLeft(find.text('PROFIL ENREGISTRÉ PAR L’APPAREIL'))
                .dy));
      }
      expect(tester.takeException(), isNull);
    });
  }
}

class _Sites implements DiveSiteSource {
  @override
  Future<List<DiveSite>> nearby(DiveLocationHint hint) async => const [
        DiveSite(
            id: 'ras',
            name: 'Gozo - Ras il-Hobz',
            latitude: 36.02,
            longitude: 14.29,
            distanceKm: 0.01,
            country: 'MT',
            isSea: true),
      ];
}

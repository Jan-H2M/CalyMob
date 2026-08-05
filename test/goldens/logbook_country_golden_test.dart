import 'dart:io';

import 'package:calymob/config/app_colors.dart';
import 'package:calymob/widgets/country_picker_field.dart';
import 'package:calymob/widgets/dive_location_picker.dart';
import 'package:calymob/widgets/logbook_location_card.dart';
import 'package:country_picker/country_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  setUpAll(_loadGoldenFonts);

  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
  });

  Future<void> setPhoneViewport(WidgetTester tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  }

  Widget app(Widget child) => MaterialApp(
        locale: const Locale('fr'),
        supportedLocales: const [Locale('fr'), Locale('nl'), Locale('en')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
          CountryLocalizations.delegate,
        ],
        debugShowCheckedModeBanner: false,
        theme: ThemeData(fontFamily: 'Roboto', useMaterial3: true),
        home: child,
      );

  testWidgets('final logbook country input', (tester) async {
    await setPhoneViewport(tester);
    await tester.pumpWidget(app(const _CountryInputPreview()));
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(_CountryInputPreview),
      matchesGoldenFile('logbook_country_input.png'),
    );
  });

  testWidgets('final logbook country detail', (tester) async {
    await setPhoneViewport(tester);
    await tester.pumpWidget(app(const _CountryDetailPreview()));
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(_CountryDetailPreview),
      matchesGoldenFile('logbook_country_detail.png'),
    );
  });
}

class _PreviewBackground extends StatelessWidget {
  final Widget child;
  const _PreviewBackground({required this.child});

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF064C75), AppColors.donkerblauw],
          ),
        ),
        child: SafeArea(child: child),
      );
}

class _CountryInputPreview extends StatelessWidget {
  const _CountryInputPreview();

  @override
  Widget build(BuildContext context) => Scaffold(
        body: _PreviewBackground(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Row(
                  children: [
                    Icon(Icons.arrow_back, color: Colors.white),
                    SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'Nouvelle plongée',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 21,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 34),
                const Text(
                  'LIEU',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 7),
                Container(
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.96),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: const Column(
                    children: [
                      DiveLocationPickerField(
                        value: DiveLocationSelection(
                          id: 'marsa-alam',
                          name: 'Marsa Alam · Elphinstone Reef',
                          country: 'EG',
                          isSea: true,
                        ),
                        readOnly: true,
                        onSelected: _ignoreLocation,
                      ),
                      Divider(height: 1),
                      CountryPickerField(
                        value: 'EG',
                        readOnly: true,
                        onChanged: _ignoreCountry,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                Text(
                  'Le pays vient du lieu sélectionné et peut être modifié '
                  'uniquement pour cette plongée.',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.76),
                    fontSize: 12.5,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}

class _CountryDetailPreview extends StatelessWidget {
  const _CountryDetailPreview();

  @override
  Widget build(BuildContext context) => Scaffold(
        body: _PreviewBackground(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Row(
                  children: [
                    Icon(Icons.arrow_back, color: Colors.white),
                    SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'Plongée N°413 du 03/08/2026',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 19,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    Icon(Icons.edit_outlined, color: Colors.white),
                  ],
                ),
                const SizedBox(height: 28),
                const LogbookLocationCard(
                  name: 'Marsa Alam · Elphinstone Reef',
                  country: 'EG',
                  isSea: true,
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.94),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _PreviewStat(icon: Icons.straighten, value: '28 m'),
                      _PreviewStat(icon: Icons.timer_outlined, value: '52 min'),
                      _PreviewStat(
                          icon: Icons.water_drop_outlined, value: '27 °C'),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}

class _PreviewStat extends StatelessWidget {
  final IconData icon;
  final String value;
  const _PreviewStat({required this.icon, required this.value});

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Icon(icon, color: AppColors.middenblauw),
          const SizedBox(height: 5),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      );
}

void _ignoreLocation(DiveLocationSelection _) {}
void _ignoreCountry(String? _) {}

Future<void> _loadGoldenFonts() async {
  var flutterRoot = File(Platform.resolvedExecutable).parent;
  for (var i = 0; i < 8; i++) {
    final marker = File(
      '${flutterRoot.path}/bin/cache/artifacts/material_fonts/Roboto-Regular.ttf',
    );
    if (marker.existsSync()) break;
    flutterRoot = flutterRoot.parent;
  }
  final fonts = '${flutterRoot.path}/bin/cache/artifacts/material_fonts';

  Future<ByteData> font(String name) async {
    final bytes = await File('$fonts/$name').readAsBytes();
    return ByteData.sublistView(Uint8List.fromList(bytes));
  }

  await (FontLoader('Roboto')
        ..addFont(font('Roboto-Regular.ttf'))
        ..addFont(font('Roboto-Medium.ttf'))
        ..addFont(font('Roboto-Bold.ttf')))
      .load();
  await (FontLoader('MaterialIcons')
        ..addFont(font('MaterialIcons-Regular.otf')))
      .load();
}

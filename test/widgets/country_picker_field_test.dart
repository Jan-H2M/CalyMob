import 'package:calymob/widgets/country_picker_field.dart';
import 'package:country_picker/country_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget app(
      {required Locale locale,
      String? value,
      ValueChanged<String?>? onChanged}) {
    return MaterialApp(
      locale: locale,
      supportedLocales: const [Locale('fr'), Locale('nl'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        CountryLocalizations.delegate,
      ],
      home: Scaffold(
        body: CountryPickerField(
          value: value,
          recentCountryCodes: const ['HR', 'PT'],
          onChanged: onChanged ?? (_) {},
        ),
      ),
    );
  }

  testWidgets('shows localized text plus ISO code, never flag-only',
      (tester) async {
    await tester.pumpWidget(app(locale: const Locale('nl'), value: 'HR'));
    await tester.pumpAndSettle();
    expect(find.text('Kroatië · HR'), findsOneWidget);
    expect(find.byIcon(Icons.public), findsOneWidget);
  });

  testWidgets('country is optional and can be cleared', (tester) async {
    String? selected = 'EG';
    await tester.pumpWidget(app(
      locale: const Locale('fr'),
      value: selected,
      onChanged: (value) => selected = value,
    ));
    await tester.pumpAndSettle();
    expect(find.text('Égypte · EG'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('clear-logbook-country')));
    expect(selected, isNull);
  });

  testWidgets('opens a fully local searchable picker with favorites',
      (tester) async {
    await tester.pumpWidget(app(locale: const Locale('fr')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('logbook-country-picker')));
    await tester.pumpAndSettle();
    expect(find.text('Pays de la plongée'), findsOneWidget);
    expect(find.text('Rechercher un pays'), findsOneWidget);
    expect(find.text('Croatie'), findsWidgets);
    expect(find.text('Portugal'), findsWidgets);
  });
}

import 'package:calymob/utils/roster_session_label.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

void main() {
  setUpAll(() => initializeDateFormatting('fr_FR'));

  test('formats a French session date without redundant pool name', () {
    expect(
      formatRosterSessionLabel(DateTime(2026, 7, 21)),
      'mar. 21 juil.',
    );
  });

  test('never falls back to a technical session identifier', () {
    expect(
      formatRosterSessionLabel(null),
      unknownRosterSessionDateLabel,
    );
  });
}

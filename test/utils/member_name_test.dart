import 'package:calymob/utils/member_name.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('canonical member names', () {
    test('prefers canonical snake_case fields', () {
      final data = {
        'first_name': 'Canonical First',
        'last_name': 'Canonical Last',
        'firstName': 'Camel First',
        'lastName': 'Camel Last',
        'prenom': 'Legacy First',
        'nom': 'Legacy Last',
      };

      expect(memberFirstName(data), 'Canonical First');
      expect(memberLastName(data), 'Canonical Last');
      expect(memberDisplayName(data), 'Canonical First Canonical Last');
    });

    test('supports English camelCase-only member records', () {
      final data = {
        'firstName': 'Raffaele',
        'lastName': 'Gradini',
        'displayName': 'Raffaele Gradini',
      };

      expect(memberFirstName(data), 'Raffaele');
      expect(memberLastName(data), 'Gradini');
      expect(memberNameSearchValues(data), contains('Gradini'));
    });

    test('keeps French fields as the final migration fallback', () {
      final data = {'prenom': 'Legacy', 'nom': 'Member'};

      expect(memberDisplayName(data), 'Legacy Member');
    });
  });
}

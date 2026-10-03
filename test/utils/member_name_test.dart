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

    test('organizer label prefers structured names over a stale display label', () {
      final data = {
        'first_name': 'Juan Antonio',
        'last_name': 'MARQUEZ SEQUEIRA',
        'display_name': 'Legacy label',
      };

      expect(
        memberCanonicalOrganizerName(data),
        'Juan Antonio MARQUEZ SEQUEIRA',
      );
    });

    test('organizer label never falls back to email', () {
      expect(memberCanonicalOrganizerName({'email': 'hidden@example.test'}), '');
    });
  });
}

import 'package:calymob/utils/event_unread_policy.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Map<String, dynamic> event({
    String status = 'ouvert',
    DateTime? end,
    Object? deletedAt,
    String? category,
    bool legacyCategory = false,
  }) {
    return {
      'type': 'evenement',
      'statut': status,
      'date_fin': end ?? DateTime.parse('2026-03-28T22:00:00Z'),
      if (deletedAt != null) 'deleted_at': deletedAt,
      if (category != null)
        legacyCategory ? 'categorie' : 'event_category': category,
    };
  }

  test('uses the exact seven Brussels calendar-day boundary across DST', () {
    final operation = event();

    expect(
      isUnreadEligibleEvent(
        operation,
        DateTime.parse('2026-04-03T21:00:00Z'),
      ),
      isTrue,
      reason: '+6 Brussels calendar days remains eligible',
    );
    expect(
      isUnreadEligibleEvent(
        operation,
        DateTime.parse('2026-04-04T21:00:00Z'),
      ),
      isTrue,
      reason: 'the exact +7 boundary remains eligible',
    );
    expect(
      isUnreadEligibleEvent(
        operation,
        DateTime.parse('2026-04-04T21:00:01Z'),
      ),
      isFalse,
      reason: 'one second after +7 is expired',
    );
  });

  test('status, deletion, operation type and piscine aliases are canonical',
      () {
    final now = DateTime.parse('2026-03-29T10:00:00Z');
    for (final status in ['ouvert', 'ferme', 'annule']) {
      expect(isUnreadEligibleEvent(event(status: status), now), isTrue);
    }
    expect(isUnreadEligibleEvent(event(status: 'brouillon'), now), isFalse);
    expect(
      isUnreadEligibleEvent(event(deletedAt: DateTime.now()), now),
      isFalse,
    );
    expect(
      isUnreadEligibleEvent({...event(), 'type': 'cotisation'}, now),
      isFalse,
    );
    expect(
      isUnreadEligibleEvent(event(category: 'piscine'), now),
      isFalse,
    );
    expect(
      isUnreadEligibleEvent(
        event(category: ' PiScInE ', legacyCategory: true),
        now,
      ),
      isFalse,
    );
  });

  test('registration lifecycle excludes non-participants consistently', () {
    for (final status in ['canceled', 'waitlisted', 'withdrawn']) {
      expect(
        isCountableEventRegistration({'registration_status': status}),
        isFalse,
      );
    }
    expect(
      isCountableEventRegistration({'registration_status': 'confirmed'}),
      isTrue,
    );
    expect(isCountableEventRegistration(const {}), isTrue);
  });
}

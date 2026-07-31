import 'package:flutter_test/flutter_test.dart';

import 'package:calymob/models/palanquee.dart';
import 'package:calymob/services/lifras_validation_service.dart';

/// Régression: la profondeur d'une palanquée doit être déterminée par chaque
/// plongeur avec son ENCADRANT (le niveau le plus élevé), pas par toutes les
/// paires entre elles. Bug historique: 4★ + 2★ + 2★ donnait 20m (cellule
/// 2★×2★) au lieu de 40m (2★ encadré par un 4★).
/// Même logique dans CalyCompta (src/services/lifrasValidationService.ts) —
/// garder les deux en phase.
PalanqueeParticipant p(String niveau, [String nom = 'X']) {
  return PalanqueeParticipant(
    membreId: nom,
    membreNom: nom,
    membrePrenom: '',
    niveau: niveau,
  );
}

void main() {
  group('validatePalanquee — profondeur max (§1.7.1)', () {
    test('4★ + 2★ + 2★ → 40m (régression palanquée bloquée à 20m)', () {
      final r = validatePalanquee([p('4*', 'A'), p('2*', 'B'), p('2*', 'C')]);
      expect(r.valid, isTrue);
      expect(r.errors, isEmpty);
      expect(r.maxDepth, 40);
    });

    test('2★ + 2★ autonomes → 20m (cellule 2★×2★ reste applicable)', () {
      final r = validatePalanquee([p('2*', 'A'), p('2*', 'B')]);
      expect(r.valid, isTrue);
      expect(r.maxDepth, 20);
    });

    test('2★ + 4★ → 40m', () {
      final r = validatePalanquee([p('2*', 'A'), p('4*', 'B')]);
      expect(r.maxDepth, 40);
    });

    test('4★ + 3★ → 40m', () {
      final r = validatePalanquee([p('4*', 'A'), p('3*', 'B')]);
      expect(r.maxDepth, 40);
    });

    test('AM + 2★ + 4★ → 40m', () {
      final r = validatePalanquee([p('AM', 'A'), p('2*', 'B'), p('4*', 'C')]);
      expect(r.maxDepth, 40);
    });

    test('3★ + 2★ + 2★ → 30m (encadrant 3★)', () {
      final r = validatePalanquee([p('3*', 'A'), p('2*', 'B'), p('2*', 'C')]);
      expect(r.maxDepth, 30);
    });

    test('4★ + 4★ → 60m', () {
      final r = validatePalanquee([p('4*', 'A'), p('4*', 'B')]);
      expect(r.maxDepth, 60);
    });

    test('MC + NB → 15m (Plongée Découverte)', () {
      final r = validatePalanquee([p('MC', 'A'), p('NB', 'B')]);
      expect(r.valid, isTrue);
      expect(r.maxDepth, 15);
    });

    test('3★ + 1★ + 1★ → 20m (clamp 1★, pas d\'erreur 1★+1★ avec CP)', () {
      final r = validatePalanquee([p('3*', 'A'), p('1*', 'B'), p('1*', 'C')]);
      expect(r.valid, isTrue);
      expect(r.maxDepth, 20);
    });

    test('1★ + 2★ → interdit (pas de CP), maxDepth null', () {
      final r = validatePalanquee([p('1*', 'A'), p('2*', 'B')]);
      expect(r.valid, isFalse);
      expect(r.errors.any((e) => e.code == 'INVALID_PAIR'), isTrue);
      expect(r.maxDepth, isNull);
    });
  });
}

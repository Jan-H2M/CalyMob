import 'package:calymob/screens/training/parcours_hub_screen.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Parcours hub keeps the agreed entry order', () {
    expect(
      parcoursHubEntryDefinitions.map((entry) => entry.title).toList(),
      equals([
        'Mon carnet',
        'Plongées à confirmer',
        'Mes exercices',
        'Mes demandes',
        'Actions & évaluations',
        'Statistiques',
        'Reprendre ma carte papier',
      ]),
    );
  });

  test('Only actionable sections expose badges', () {
    final badgedEntries = parcoursHubEntryDefinitions
        .where((entry) => entry.badge)
        .map((entry) => entry.key)
        .toList();

    expect(badgedEntries, equals(['confirmations', 'actions']));
  });
}

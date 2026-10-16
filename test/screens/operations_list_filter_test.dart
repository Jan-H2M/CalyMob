import 'package:calymob/models/activity_item.dart';
import 'package:calymob/models/operation.dart';
import 'package:calymob/screens/operations/operations_list_filter.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final now = DateTime(2026, 10, 16, 12);

  ActivityItem event(
    String id,
    DateTime date,
    String category, {
    String? status,
  }) =>
      ActivityItem(
        id: id,
        type: 'operation',
        titre: id,
        date: date,
        categorie: category,
        operation: status == null
            ? null
            : Operation(
                id: id,
                type: 'evenement',
                titre: id,
                montantPrevu: 0,
                statut: status,
                dateDebut: date,
                createdAt: now,
                updatedAt: now,
              ),
      );

  test('Passés keeps recent past rows above old rows and removes future rows',
      () {
    final source = [
      event('old', now.subtract(const Duration(days: 30)), 'plongee'),
      event('future', now.add(const Duration(days: 10)), 'sortie'),
      event('recent', now.subtract(const Duration(days: 2)), 'sortie'),
    ];

    final past = filterOperationsForView(
      source,
      selectedFilter: 'all',
      includePast: true,
      now: now,
    );
    expect(past.map((item) => item.id), ['recent', 'old']);

    final defaultList = filterOperationsForView(
      source,
      selectedFilter: 'all',
      includePast: false,
      now: now,
    );
    expect(defaultList.map((item) => item.id), ['old', 'recent', 'future']);
  });

  test('organizer closed filter keeps all supplied rows, newest first', () {
    final source = [
      event('old', now.subtract(const Duration(days: 30)), 'plongee'),
      event('recent', now.subtract(const Duration(days: 2)), 'sortie'),
    ];
    final closed = filterOperationsForView(
      source,
      selectedFilter: 'closed',
      includePast: false,
      now: now,
    );
    expect(closed.map((item) => item.id), ['recent', 'old']);
  });

  test('future closed and cancelled discussions stay reachable after history',
      () {
    final source = [
      event('future-open', now.add(const Duration(days: 1)), 'plongee',
          status: 'ouvert'),
      event('future-closed', now.add(const Duration(days: 2)), 'sortie',
          status: 'ferme'),
      event('future-cancelled', now.add(const Duration(days: 3)), 'plongee',
          status: 'annule'),
      event('recent-past', now.subtract(const Duration(days: 1)), 'sortie',
          status: 'ferme'),
    ];

    final past = filterOperationsForView(
      source,
      selectedFilter: 'all',
      includePast: true,
      now: now,
    );
    expect(past.map((item) => item.id),
        ['recent-past', 'future-closed', 'future-cancelled']);
  });
}

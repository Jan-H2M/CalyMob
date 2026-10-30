import 'dart:math';
import 'dart:async';
import 'package:cloud_functions/cloud_functions.dart';
import '../../models/boutique/boutique_physical_unit.dart';

typedef BoutiqueOperationTransport = Future<Map<String, dynamic>> Function(
    Map<String, dynamic> request);

class BoutiqueOperationsService {
  final BoutiqueOperationTransport? transport;
  const BoutiqueOperationsService({this.transport});
  Future<Map<String, dynamic>> call(String clubId, String action,
      [Map<String, dynamic> params = const {}]) async {
    final request = {'clubId': clubId, 'action': action, ...params};
    if (transport != null) return transport!(request);
    final result = await FirebaseFunctions.instanceFor(region: 'europe-west1')
        .httpsCallable('boutiquePhysicalOperations')
        .call(request);
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<BoutiquePhysicalUnit> lookup(String clubId, String id,
      {String? missionId}) async {
    final result = await call(clubId, 'lookup',
        {'unitId': id, if (missionId != null) 'missionId': missionId});
    return BoutiquePhysicalUnit(
        Map<String, dynamic>.from(result['unit'] as Map));
  }

  /// Read every page before offering a full receipt; never silently use a preview.
  Future<List<BoutiquePhysicalUnit>> listReceivedUnits(String clubId) async {
    final units = <String, BoutiquePhysicalUnit>{};
    final cursors = <String>{};
    String? cursor;
    do {
      final page =
          await call(clubId, 'list', {if (cursor != null) 'cursor': cursor});
      for (final value in page['units'] as List) {
        final unit =
            BoutiquePhysicalUnit(Map<String, dynamic>.from(value as Map));
        units[unit.id] = unit;
      }
      if (page['hasMore'] != true) return units.values.toList();
      cursor = page['nextCursor'] as String?;
      if (cursor == null ||
          cursor.isEmpty ||
          !cursors.add(cursor) ||
          cursors.length > 100) {
        throw const FormatException(
            'La réception complète ne peut pas être chargée. Actualisez avant de sélectionner.');
      }
    } while (true);
  }
  // Poll only while a subscriber exists. Rx switchMap cancels on role/flag change.
  Stream<bool> watchHasAssignment(String clubId) {
    late StreamController<bool> controller;
    Timer? timer;
    bool cancelled = false, running = false;
    Future<void> refresh() async {
      if (running || cancelled) return;
      running = true;
      bool assigned = false;
      try {
        assigned = (await call(clubId, 'access'))['hasAssignments'] == true;
      } catch (_) {}
      if (!cancelled) controller.add(assigned);
      running = false;
    }

    controller = StreamController<bool>(onListen: () {
      refresh();
      timer = Timer.periodic(const Duration(seconds: 30), (_) => refresh());
    }, onCancel: () {
      cancelled = true;
      timer?.cancel();
    });
    return controller.stream;
  }

  static String confirmationKey() {
    final random = Random.secure();
    return List.generate(
            24, (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'))
        .join();
  }

  static bool definitiveFailure(Object error) =>
      error is FirebaseFunctionsException &&
      const {
        'invalid-argument',
        'permission-denied',
        'unauthenticated',
        'not-found',
        'failed-precondition',
        'aborted',
        'already-exists'
      }.contains(error.code);
  static String message(Object error) => error is FirebaseFunctionsException
      ? error.message ?? 'Action impossible. Actualisez le lot.'
      : error is FormatException
          ? error.message
          : 'Connexion interrompue. Réessayez la même confirmation pour vérifier son résultat.';
}

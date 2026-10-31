import 'package:calymob/services/boutique/member_missions_service.dart';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
      'API contract sends no caller-chosen member identity and uses expected status',
      () async {
    final calls = <Map<String, dynamic>>[];
    final service = MemberMissionsService(transport: (request) async {
      calls.add(request);
      return {'version': 1, 'eligible': true, 'missions': []};
    });
    await service.list('club');
    await service.update(
        'club',
        const MemberMission(
            {'id': 'piece', 'batchId': 'batch', 'status': 'ordered'}),
        'handed_over',
        location: 'Piscine');
    expect(calls.first, {'clubId': 'club', 'action': 'list'});
    expect(calls.last, {
      'clubId': 'club',
      'action': 'update',
      'batchId': 'batch',
      'missionId': 'piece',
      'expectedStatus': 'ordered',
      'nextStatus': 'handed_over',
      'location': 'Piscine'
    });
    expect(calls.every((request) => !request.containsKey('memberId')), isTrue);
  });
  test('supplier tasks need no CalyCompta or Boutique manager role', () {
    const access = BoutiqueAccessState(
        canAccess: false,
        visibility: {},
        member: {'member_status': 'active', 'app_role': 'user'},
        hasSupplierMissions: true);
    expect(access.canOpenEntry, isTrue);
    expect(access.canAccessSection('missions'), isTrue);
    expect(access.canAccessSection('gestion'), isFalse);
    expect(access.canAccessSection('produits'), isFalse);
  });
}

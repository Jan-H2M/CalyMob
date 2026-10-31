import 'dart:async';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/services/boutique/member_missions_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

class _Missions extends MemberMissionsService {
  final eligibility = StreamController<bool>.broadcast();
  int calls = 0;
  @override
  Stream<bool> watchEligibility(String clubId) {
    calls++;
    return eligibility.stream;
  }
}

Future<void> flush() async {
  await Future<void>.delayed(Duration.zero);
  await Future<void>.delayed(Duration.zero);
}

void main() {
  test(
    'mobile-only supplier eligibility opens only missions and revokes on membership/account/auth changes',
    () async {
      final db = FakeFirebaseFirestore();
      await db.doc('clubs/club/settings/feature_flags').set({
        'boutiqueEnabled': false,
        'boutiqueMobileEnabled': false,
        'boutiqueAccess': 'masque',
      });
      final member = db.doc('clubs/club/members/owner');
      await member.set({
        'member_status': 'active',
        'has_app_access': false,
        'has_web_access': false,
        'app_role': 'membre',
        'app_status': 'active',
        'isActive': true,
        'actif': true,
      });
      final missions = _Missions(), auth = StreamController<String?>();
      final states = <BoutiqueAccessState>[], errors = <Object>[];
      final subscription =
          BoutiqueAccessService(
                firestore: db,
                missions: missions,
                authUserIds: () => auth.stream,
              )
              .watchBoutiqueAccess(clubId: 'club', userId: 'owner')
              .listen(states.add, onError: errors.add);
      auth.add('owner');
      await flush();
      expect(missions.eligibility.hasListener, isTrue);
      expect(missions.calls, 1);
      missions.eligibility.add(true);
      await flush();
      expect(states.last.canOpenEntry, isTrue);
      expect(states.last.canAccessSection('missions'), isTrue);
      for (final section in ['gestion', 'remises', 'produits', 'panier']) {
        expect(states.last.canAccessSection(section), isFalse);
      }
      // Losing only back-office access must not revoke the member's assignment RPC.
      for (final backoffice in [true, false]) {
        await member.update({'has_app_access': backoffice});
        await flush();
        expect(missions.eligibility.hasListener, isTrue);
        missions.eligibility.add(true);
        await flush();
        expect(states.last.canAccessSection('missions'), isTrue);
      }
      // Server-side supplier unlink/revocation is still observed.
      missions.eligibility.add(false);
      await flush();
      expect(states.last.canOpenEntry, isFalse);
      for (final patch in [
        {'member_status': 'inactive'},
        {'app_status': 'suspended'},
        {'isActive': false},
        {'actif': false},
      ]) {
        await member.update(patch);
        await flush();
        expect(missions.eligibility.hasListener, isFalse);
        expect(states.last.canOpenEntry, isFalse);
        final count = states.length;
        missions.eligibility.add(true);
        await flush();
        expect(states.length, count);
        await member.update({
          'member_status': 'active',
          'app_status': 'active',
          'isActive': true,
          'actif': true,
        });
        await flush();
        expect(missions.eligibility.hasListener, isTrue);
        missions.eligibility.add(true);
        await flush();
        expect(states.last.canAccessSection('missions'), isTrue);
      }
      auth.add('another-member');
      await flush();
      expect(missions.eligibility.hasListener, isFalse);
      expect(errors, isNotEmpty);
      await subscription.cancel();
      await auth.close();
      await missions.eligibility.close();
    },
  );
}

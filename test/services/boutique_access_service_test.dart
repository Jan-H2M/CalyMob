import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/services/feature_flag_service.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const preparation = FeatureFlagService.modePreparation;
  const online = FeatureFlagService.modeTous;

  Map<String, dynamic> member({
    String status = 'active',
    List<String> statuten = const [],
    String appRole = 'user',
    bool legacyFeatureAccess = false,
  }) {
    return {
      'member_status': status,
      'clubStatuten': statuten,
      'app_role': appRole,
      'feature_access': {'boutique': legacyFeatureAccess},
    };
  }

  group('BoutiqueAccessPolicy', () {
    test('preparation accepts active Responsable boutique role variants', () {
      for (final role in const [
        'Responsable boutique',
        'Responsable Boutique',
        'responsable boutique',
        'RESPONSABLE BOUTIQUE',
        'RB',
        'rb',
        'Rb',
        'rB',
      ]) {
        expect(
          BoutiqueAccessPolicy.canAccessMode(
            preparation,
            member(statuten: [role]),
          ),
          isTrue,
          reason: 'role variant $role should be accepted',
        );
      }
    });

    test('preparation rejects ordinary and inactive members', () {
      expect(
        BoutiqueAccessPolicy.canAccessMode(preparation, member()),
        isFalse,
      );
      expect(
        BoutiqueAccessPolicy.canAccessMode(
          preparation,
          member(status: 'inactive', statuten: const ['Responsable boutique']),
        ),
        isFalse,
      );
    });

    test('admin and legacy feature access do not grant preparation access', () {
      expect(
        BoutiqueAccessPolicy.canAccessMode(
          preparation,
          member(appRole: 'superadmin', legacyFeatureAccess: true),
        ),
        isFalse,
      );
    });

    test('online accepts every active member but never an inactive member', () {
      expect(BoutiqueAccessPolicy.canAccessMode(online, member()), isTrue);
      expect(
        BoutiqueAccessPolicy.canAccessMode(
          online,
          member(status: 'inactive', statuten: const ['RB']),
        ),
        isFalse,
      );
      expect(
        BoutiqueAccessPolicy.canAccessMode(online, member(status: 'ACTIVE')),
        isFalse,
      );
      expect(BoutiqueAccessPolicy.canAccessMode(online, null), isFalse);
    });

    test('legacy hidden and unknown modes remain denied', () {
      final responsible = member(statuten: const ['Responsable boutique']);
      expect(
        BoutiqueAccessPolicy.canAccessMode(
          FeatureFlagService.modeMasque,
          responsible,
        ),
        isFalse,
      );
      expect(
        BoutiqueAccessPolicy.canAccessMode('unknown', responsible),
        isFalse,
      );
    });
  });

  group('FeatureFlagService Boutique parsing', () {
    test(
      'missing document defaults module and all sections to preparation',
      () {
        final parsed = FeatureFlagService.parseBoutiqueVisibility(null);

        expect(parsed['access'], preparation);
        for (final key in FeatureFlagService.boutiqueSectionKeys) {
          expect(parsed[key], preparation, reason: '$key should follow access');
        }
      },
    );

    test(
      'missing and invalid section values follow normalized global mode',
      () {
        final parsed = FeatureFlagService.parseBoutiqueVisibility({
          'boutiqueAccess': online,
          'boutiqueSections': {
            'produits': preparation,
            'panier': 'invalid',
            'commandes': FeatureFlagService.modeMasque,
          },
        });

        expect(parsed['access'], online);
        expect(parsed['produits'], preparation);
        expect(parsed['panier'], online);
        expect(parsed['commandes'], FeatureFlagService.modeMasque);
        expect(parsed['cotisation'], online);
        expect(parsed['pretsMateriel'], online);
      },
    );

    test('invalid global mode normalizes to preparation for every section', () {
      final parsed = FeatureFlagService.parseBoutiqueVisibility({
        'boutiqueAccess': 'invalid',
      });

      expect(parsed['access'], preparation);
      for (final key in FeatureFlagService.boutiqueSectionKeys) {
        expect(parsed[key], preparation, reason: '$key should follow access');
      }
    });

    test('legacy hidden mode remains a defensive all-sections fallback', () {
      final parsed = FeatureFlagService.parseBoutiqueVisibility({
        'boutiqueAccess': FeatureFlagService.modeMasque,
      });

      expect(parsed['access'], FeatureFlagService.modeMasque);
      for (final key in FeatureFlagService.boutiqueSectionKeys) {
        expect(
          parsed[key],
          FeatureFlagService.modeMasque,
          reason: '$key should remain hidden for legacy data',
        );
      }
    });

    test('all five fallback sections use the same member access policy', () {
      final responsible = member(statuten: const ['RB']);
      final ordinary = member();

      for (final mode in [
        preparation,
        online,
        FeatureFlagService.modeMasque,
      ]) {
        final parsed = FeatureFlagService.parseBoutiqueVisibility({
          'boutiqueAccess': mode,
        });

        for (final key in FeatureFlagService.boutiqueSectionKeys) {
          expect(
            BoutiqueAccessPolicy.canAccessMode(parsed[key], responsible),
            mode != FeatureFlagService.modeMasque,
            reason: '$key should follow $mode for a responsible member',
          );
          expect(
            BoutiqueAccessPolicy.canAccessMode(parsed[key], ordinary),
            mode == online,
            reason: '$key should follow $mode for an ordinary active member',
          );
        }
      }
    });
  });

  group('BoutiqueAccessService', () {
    test('requires an enable flag in addition to the access mode', () {
      final responsible = member(statuten: const ['RB']);

      expect(
        BoutiqueAccessService.canAccessFromData(
          flags: const {'boutiqueAccess': preparation},
          member: responsible,
        ),
        isFalse,
      );
      expect(
        BoutiqueAccessService.canAccessFromData(
          flags: const {
            'boutiqueAccess': preparation,
            'boutiqueMobileEnabled': true,
          },
          member: responsible,
        ),
        isTrue,
      );
    });

    test('stream reacts when preparation changes to online', () async {
      final firestore = FakeFirebaseFirestore();
      final flags = firestore
          .collection('clubs')
          .doc('calypso')
          .collection('settings')
          .doc('feature_flags');
      final memberRef = firestore
          .collection('clubs')
          .doc('calypso')
          .collection('members')
          .doc('member-1');
      await flags.set({'boutiqueEnabled': true, 'boutiqueAccess': preparation});
      await memberRef.set(member());

      final service = BoutiqueAccessService(firestore: firestore);
      final access = service.watchCanAccessBoutique(
        clubId: 'calypso',
        userId: 'member-1',
      );
      final expectation = expectLater(access, emitsInOrder([isFalse, isTrue]));
      await Future<void>.delayed(Duration.zero);
      await flags.update({'boutiqueAccess': online});
      await expectation;
    });

    test('live state reacts to responsibility and active status changes',
        () async {
      final firestore = FakeFirebaseFirestore();
      final flags = firestore
          .collection('clubs')
          .doc('calypso')
          .collection('settings')
          .doc('feature_flags');
      final memberRef = firestore
          .collection('clubs')
          .doc('calypso')
          .collection('members')
          .doc('member-1');
      await flags.set({'boutiqueEnabled': true, 'boutiqueAccess': preparation});
      await memberRef.set(member());

      final service = BoutiqueAccessService(firestore: firestore);
      final states = service.watchBoutiqueAccess(
        clubId: 'calypso',
        userId: 'member-1',
      );
      final expectation = expectLater(
        states,
        emitsInOrder([
          predicate<BoutiqueAccessState>(
            (state) => !state.canAccess,
            'ordinary preparation member is denied',
          ),
          predicate<BoutiqueAccessState>(
            (state) =>
                state.canAccess &&
                FeatureFlagService.boutiqueSectionKeys.every(
                  state.canAccessSection,
                ),
            'new Boutique responsibility grants every fallback section',
          ),
          predicate<BoutiqueAccessState>(
            (state) =>
                !state.canAccess &&
                FeatureFlagService.boutiqueSectionKeys.every(
                  (key) => !state.canAccessSection(key),
                ),
            'inactive status removes module and section access',
          ),
        ]),
      );

      await Future<void>.delayed(Duration.zero);
      await memberRef.update({
        'clubStatuten': ['RB']
      });
      await Future<void>.delayed(Duration.zero);
      await memberRef.update({'member_status': 'inactive'});
      await expectation;
    });
  });
}

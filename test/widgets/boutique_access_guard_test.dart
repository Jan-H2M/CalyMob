import 'dart:async';

import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/widgets/boutique/boutique_access_guard.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const clubId = 'calypso';
  const userId = 'member-1';

  Future<
      ({
        FakeFirebaseFirestore firestore,
        BoutiqueAccessService service,
      })> onlineAccess() async {
    final firestore = FakeFirebaseFirestore();
    await firestore
        .collection('clubs')
        .doc(clubId)
        .collection('settings')
        .doc('feature_flags')
        .set({
      'boutiqueEnabled': true,
      'boutiqueMobileEnabled': true,
      'boutiqueAccess': 'tous',
    });
    await firestore
        .collection('clubs')
        .doc(clubId)
        .collection('members')
        .doc(userId)
        .set({
      'member_status': 'active',
      'clubStatuten': <String>[],
    });
    return (
      firestore: firestore,
      service: BoutiqueAccessService(firestore: firestore),
    );
  }

  Future<void> pumpAccessEvent(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));
  }

  Future<void> openGuardedProbe(
    WidgetTester tester, {
    required BoutiqueAccessService service,
    required String label,
    required String section,
    VoidCallback? onDispose,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              key: const Key('open-guarded-route'),
              onPressed: () => Navigator.of(context).push(
                boutiqueAccessGuardedRoute<void>(
                  accessService: service,
                  clubId: clubId,
                  userId: userId,
                  requiredSection: section,
                  builder: (_) => _CachedProbe(
                    label: label,
                    onDispose: onDispose,
                  ),
                ),
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.byKey(const Key('open-guarded-route')));
    await pumpAccessEvent(tester);
  }

  final guardedRoutes = <(String, String)>[
    ('products', 'produits'),
    ('product-detail', 'produits'),
    ('cart', 'panier'),
    ('orders', 'commandes'),
    ('checkout', 'panier'),
  ];

  for (final (label, section) in guardedRoutes) {
    testWidgets(
      '$label cached route is hidden and disposed on live revocation',
      (tester) async {
        final access = await onlineAccess();
        var disposeCount = 0;
        await openGuardedProbe(
          tester,
          service: access.service,
          label: label,
          section: section,
          onDispose: () => disposeCount += 1,
        );

        expect(find.byKey(Key('cached-$label')), findsOneWidget);
        await access.firestore
            .collection('clubs')
            .doc(clubId)
            .collection('members')
            .doc(userId)
            .update({'member_status': 'inactive'});
        await pumpAccessEvent(tester);

        expect(find.byKey(Key('cached-$label')), findsNothing);
        expect(
          find.byKey(const Key('boutique-access-unavailable')),
          findsOneWidget,
        );
        expect(disposeCount, 1);
      },
    );
  }

  testWidgets('section denial is fail-closed while another section stays open',
      (tester) async {
    final access = await onlineAccess();
    final flags = access.firestore
        .collection('clubs')
        .doc(clubId)
        .collection('settings')
        .doc('feature_flags');
    await flags.update({
      'boutiqueSections': {
        'produits': 'tous',
        'panier': 'masque',
      },
    });

    await openGuardedProbe(
      tester,
      service: access.service,
      label: 'denied-cart',
      section: 'panier',
    );
    expect(find.byKey(const Key('cached-denied-cart')), findsNothing);
    expect(
      find.byKey(const Key('boutique-access-unavailable')),
      findsOneWidget,
    );

    await tester.pageBack();
    await tester.pumpAndSettle();
    await openGuardedProbe(
      tester,
      service: access.service,
      label: 'allowed-product',
      section: 'produits',
    );
    expect(find.byKey(const Key('cached-allowed-product')), findsOneWidget);
  });

  testWidgets('nested routes inherit the injected service, club and member',
      (tester) async {
    const alternateClub = 'alternate-club';
    const alternateUser = 'alternate-member';
    final firestore = FakeFirebaseFirestore();
    await firestore
        .collection('clubs')
        .doc(alternateClub)
        .collection('settings')
        .doc('feature_flags')
        .set({
      'boutiqueEnabled': true,
      'boutiqueAccess': 'tous',
    });
    final member = firestore
        .collection('clubs')
        .doc(alternateClub)
        .collection('members')
        .doc(alternateUser);
    await member.set({
      'member_status': 'active',
      'clubStatuten': <String>[],
    });
    final service = BoutiqueAccessService(firestore: firestore);

    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            key: const Key('open-parent-route'),
            onPressed: () => Navigator.of(context).push(
              boutiqueAccessGuardedRoute<void>(
                accessService: service,
                clubId: alternateClub,
                userId: alternateUser,
                requiredSection: 'produits',
                builder: (guardedContext) => Scaffold(
                  body: TextButton(
                    key: const Key('open-nested-route'),
                    onPressed: () => Navigator.of(guardedContext).push(
                      boutiqueAccessGuardedRoute<void>(
                        sourceContext: guardedContext,
                        requiredSection: 'panier',
                        builder: (_) => const Scaffold(
                          body: Text(
                            'nested content',
                            key: Key('nested-inherited-content'),
                          ),
                        ),
                      ),
                    ),
                    child: const Text('Nested'),
                  ),
                ),
              ),
            ),
            child: const Text('Parent'),
          ),
        ),
      ),
    );
    await tester.tap(find.byKey(const Key('open-parent-route')));
    await pumpAccessEvent(tester);
    await tester.tap(find.byKey(const Key('open-nested-route')));
    await pumpAccessEvent(tester);

    expect(find.byKey(const Key('nested-inherited-content')), findsOneWidget);
    await member.update({'member_status': 'inactive'});
    await pumpAccessEvent(tester);
    expect(find.byKey(const Key('nested-inherited-content')), findsNothing);
    expect(
      find.byKey(const Key('boutique-access-unavailable')),
      findsWidgets,
    );
  });

  testWidgets('a missing member fails closed and never exposes the child',
      (tester) async {
    final access = await onlineAccess();
    await tester.pumpWidget(
      MaterialApp(
        home: BoutiqueAccessGuard(
          accessService: access.service,
          clubId: clubId,
          userId: 'missing-member',
          builder: (_, __) => const Text(
            'must stay hidden',
            key: Key('unguarded-child'),
          ),
        ),
      ),
    );
    expect(find.byKey(const Key('unguarded-child')), findsNothing);
    await pumpAccessEvent(tester);
    expect(find.byKey(const Key('unguarded-child')), findsNothing);
    expect(
      find.byKey(const Key('boutique-access-unavailable')),
      findsOneWidget,
    );
  });

  testWidgets('a missing auth provider/user fails closed', (tester) async {
    final access = await onlineAccess();
    await tester.pumpWidget(
      MaterialApp(
        home: BoutiqueAccessGuard(
          accessService: access.service,
          clubId: clubId,
          builder: (_, __) => const Text(
            'must stay hidden',
            key: Key('null-user-child'),
          ),
        ),
      ),
    );

    expect(find.byKey(const Key('null-user-child')), findsNothing);
    expect(
      find.byKey(const Key('boutique-access-unavailable')),
      findsOneWidget,
    );
  });

  testWidgets('loading and stream errors stay fail-closed', (tester) async {
    final controller = StreamController<BoutiqueAccessState>();
    addTearDown(controller.close);
    final service = _StreamBoutiqueAccessService(controller.stream);
    await tester.pumpWidget(
      MaterialApp(
        home: BoutiqueAccessGuard(
          accessService: service,
          clubId: clubId,
          userId: userId,
          builder: (_, __) => const Text(
            'must stay hidden',
            key: Key('loading-error-child'),
          ),
        ),
      ),
    );
    expect(find.byKey(const Key('boutique-access-loading')), findsOneWidget);
    expect(find.byKey(const Key('loading-error-child')), findsNothing);

    controller.addError(StateError('simulated stream failure'));
    await tester.pump();
    expect(
      find.byKey(const Key('boutique-access-unavailable')),
      findsOneWidget,
    );
    expect(find.byKey(const Key('loading-error-child')), findsNothing);
  });
}

class _StreamBoutiqueAccessService extends BoutiqueAccessService {
  final Stream<BoutiqueAccessState> stream;

  _StreamBoutiqueAccessService(this.stream)
      : super(firestore: FakeFirebaseFirestore());

  @override
  Stream<BoutiqueAccessState> watchBoutiqueAccess({
    required String clubId,
    required String userId,
  }) {
    return stream;
  }
}

class _CachedProbe extends StatefulWidget {
  final String label;
  final VoidCallback? onDispose;

  const _CachedProbe({required this.label, this.onDispose});

  @override
  State<_CachedProbe> createState() => _CachedProbeState();
}

class _CachedProbeState extends State<_CachedProbe> {
  @override
  void dispose() {
    widget.onDispose?.call();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Text(widget.label, key: Key('cached-${widget.label}')),
    );
  }
}

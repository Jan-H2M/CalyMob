import 'dart:async';

import 'package:calymob/providers/auth_provider.dart';
import 'package:calymob/services/boutique/boutique_access_service.dart';
import 'package:calymob/widgets/boutique/boutique_access_guard.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' show User;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:provider/provider.dart';

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
                  testUserIdOverride: userId,
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

  Future<void> openSensitiveRouteStack(
    WidgetTester tester, {
    required BoutiqueAccessService service,
    required _MutableAuthProvider auth,
    required Map<String, int> creations,
    required Map<String, int> disposals,
  }) async {
    const labels = ['orders', 'order-detail', 'confirmation'];

    Widget routePage(int index) {
      final label = labels[index];
      return _SensitiveRouteProbe(
        label: label,
        onCreated: () => creations[label] = (creations[label] ?? 0) + 1,
        onDispose: () => disposals[label] = (disposals[label] ?? 0) + 1,
        nextLabel: index + 1 < labels.length ? labels[index + 1] : null,
        onOpenNext: index + 1 < labels.length
            ? (context) => Navigator.of(context).push(
                  boutiqueAccessGuardedRoute<void>(
                    sourceContext: context,
                    requiredSection: 'commandes',
                    builder: (_) => routePage(index + 1),
                  ),
                )
            : null,
      );
    }

    await tester.pumpWidget(
      ChangeNotifierProvider<AuthProvider>.value(
        value: auth,
        child: MaterialApp(
          home: BoutiqueAccessGuard(
            accessService: service,
            clubId: clubId,
            builder: (guardedContext, _) => Scaffold(
              body: TextButton(
                key: const Key('open-orders'),
                onPressed: () => Navigator.of(guardedContext).push(
                  boutiqueAccessGuardedRoute<void>(
                    sourceContext: guardedContext,
                    requiredSection: 'commandes',
                    builder: (_) => routePage(0),
                  ),
                ),
                child: const Text('Orders'),
              ),
            ),
          ),
        ),
      ),
    );
    await pumpAccessEvent(tester);
    await tester.tap(find.byKey(const Key('open-orders')));
    await pumpAccessEvent(tester);
    await tester.tap(find.byKey(const Key('open-order-detail')));
    await pumpAccessEvent(tester);
    await tester.tap(find.byKey(const Key('open-confirmation')));
    await pumpAccessEvent(tester);
    expect(find.byKey(const Key('cached-confirmation')), findsOneWidget);
    for (final label in labels) {
      expect(creations[label], 1);
    }
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

  testWidgets(
    'loaded orders, detail and confirmation fail closed on logout and B login',
    (tester) async {
      final access = await onlineAccess();
      await access.firestore
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .doc('member-2')
          .set({
        'member_status': 'active',
        'clubStatuten': <String>[],
      });
      final auth = _MutableAuthProvider(userId);
      addTearDown(auth.dispose);
      final creations = <String, int>{};
      final disposals = <String, int>{};
      await openSensitiveRouteStack(
        tester,
        service: access.service,
        auth: auth,
        creations: creations,
        disposals: disposals,
      );

      auth.setUser(null);
      await tester.pump();
      for (final label in const ['orders', 'order-detail', 'confirmation']) {
        expect(
          find.byKey(Key('cached-$label'), skipOffstage: false),
          findsNothing,
        );
        expect(disposals[label], 1);
      }
      expect(
        find.byKey(const Key('boutique-access-unavailable')),
        findsWidgets,
      );

      auth.setUser('member-2');
      await pumpAccessEvent(tester);
      expect(
        find.byKey(const Key('cached-confirmation'), skipOffstage: false),
        findsNothing,
      );
      expect(creations['confirmation'], 1);
      expect(
        find.byKey(const Key('boutique-access-unavailable')),
        findsWidgets,
      );
    },
  );

  testWidgets(
    'A to B to A recreates cached sensitive routes instead of retaining state',
    (tester) async {
      final access = await onlineAccess();
      await access.firestore
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .doc('member-2')
          .set({
        'member_status': 'active',
        'clubStatuten': <String>[],
      });
      final auth = _MutableAuthProvider(userId);
      addTearDown(auth.dispose);
      final creations = <String, int>{};
      final disposals = <String, int>{};
      await openSensitiveRouteStack(
        tester,
        service: access.service,
        auth: auth,
        creations: creations,
        disposals: disposals,
      );

      auth.setUser('member-2');
      await tester.pump();
      expect(
        find.byKey(const Key('cached-confirmation'), skipOffstage: false),
        findsNothing,
      );
      expect(disposals['confirmation'], 1);

      auth.setUser(userId);
      await pumpAccessEvent(tester);
      expect(find.byKey(const Key('cached-confirmation')), findsOneWidget);
      for (final label in const ['orders', 'order-detail', 'confirmation']) {
        expect(creations[label], 2);
        expect(disposals[label], 1);
      }
    },
  );

  testWidgets('a real AuthProvider takes precedence over the test uid override',
      (tester) async {
    final access = await onlineAccess();
    await access.firestore
        .collection('clubs')
        .doc(clubId)
        .collection('members')
        .doc('member-2')
        .set({
      'member_status': 'active',
      'clubStatuten': <String>[],
      'marker': 'live-auth-user',
    });
    final auth = _MutableAuthProvider('member-2');
    addTearDown(auth.dispose);

    await tester.pumpWidget(
      ChangeNotifierProvider<AuthProvider>.value(
        value: auth,
        child: MaterialApp(
          home: BoutiqueAccessGuard(
            accessService: access.service,
            clubId: clubId,
            testUserIdOverride: userId,
            builder: (_, state) => Text(
              state.member?['marker']?.toString() ?? 'wrong-member',
              key: const Key('auth-precedence-child'),
            ),
          ),
        ),
      ),
    );
    await pumpAccessEvent(tester);

    expect(find.text('live-auth-user'), findsOneWidget);
    expect(find.text('wrong-member'), findsNothing);
  });

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
                testUserIdOverride: alternateUser,
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
          testUserIdOverride: 'missing-member',
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
          testUserIdOverride: userId,
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

class _MutableAuthProvider extends Mock
    with ChangeNotifier
    implements AuthProvider {
  User? _currentUser;

  _MutableAuthProvider(String? userId) {
    setUser(userId, notify: false);
  }

  @override
  User? get currentUser => _currentUser;

  @override
  bool get isLoading => false;

  void setUser(String? userId, {bool notify = true}) {
    _currentUser = userId == null ? null : _TestUser(userId);
    if (notify) notifyListeners();
  }
}

class _TestUser extends Mock implements User {
  final String _uid;

  _TestUser(this._uid);

  @override
  String get uid => _uid;
}

class _SensitiveRouteProbe extends StatefulWidget {
  final String label;
  final String? nextLabel;
  final VoidCallback onCreated;
  final VoidCallback onDispose;
  final void Function(BuildContext context)? onOpenNext;

  const _SensitiveRouteProbe({
    required this.label,
    required this.onCreated,
    required this.onDispose,
    this.nextLabel,
    this.onOpenNext,
  });

  @override
  State<_SensitiveRouteProbe> createState() => _SensitiveRouteProbeState();
}

class _SensitiveRouteProbeState extends State<_SensitiveRouteProbe> {
  @override
  void initState() {
    super.initState();
    widget.onCreated();
  }

  @override
  void dispose() {
    widget.onDispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Text(widget.label, key: Key('cached-${widget.label}')),
          if (widget.onOpenNext != null)
            TextButton(
              key: Key('open-${widget.nextLabel}'),
              onPressed: () => widget.onOpenNext!(context),
              child: Text('Open ${widget.nextLabel}'),
            ),
        ],
      ),
    );
  }
}

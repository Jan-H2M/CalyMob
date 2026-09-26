import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../services/boutique/boutique_access_service.dart';

typedef BoutiqueAccessGuardBuilder = Widget Function(
  BuildContext context,
  BoutiqueAccessState access,
);

/// Fail-closed live guard for every member-facing Boutique route.
class BoutiqueAccessGuard extends StatefulWidget {
  final BoutiqueAccessGuardBuilder builder;
  final String? requiredSection;
  final BoutiqueAccessService? accessService;
  final String clubId;
  final String? _authBoundUserId;

  /// Allows isolated widget tests to exercise the guard without constructing
  /// Firebase Auth. A real [AuthProvider], when present, always remains the
  /// source of truth and this override is ignored.
  @visibleForTesting
  final String? testUserIdOverride;

  const BoutiqueAccessGuard({
    super.key,
    required this.builder,
    this.requiredSection,
    this.accessService,
    this.clubId = FirebaseConfig.defaultClubId,
    this.testUserIdOverride,
  }) : _authBoundUserId = null;

  const BoutiqueAccessGuard._forRoute({
    required this.builder,
    required String? authBoundUserId,
    this.requiredSection,
    this.accessService,
    this.clubId = FirebaseConfig.defaultClubId,
    this.testUserIdOverride,
  }) : _authBoundUserId = authBoundUserId;

  @override
  State<BoutiqueAccessGuard> createState() => _BoutiqueAccessGuardState();
}

class _BoutiqueAccessGuardState extends State<BoutiqueAccessGuard> {
  late BoutiqueAccessService _accessService;
  String? _accessStreamKey;
  Stream<BoutiqueAccessState>? _accessStream;

  @override
  void initState() {
    super.initState();
    _accessService = widget.accessService ?? BoutiqueAccessService();
  }

  @override
  void didUpdateWidget(covariant BoutiqueAccessGuard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.accessService != widget.accessService ||
        oldWidget.clubId != widget.clubId ||
        oldWidget._authBoundUserId != widget._authBoundUserId ||
        oldWidget.testUserIdOverride != widget.testUserIdOverride) {
      _accessService = widget.accessService ?? BoutiqueAccessService();
      _resetStream();
    }
  }

  void _resetStream() {
    _accessStreamKey = null;
    _accessStream = null;
  }

  Stream<BoutiqueAccessState>? _watchAccess(String? userId) {
    if (userId == null) {
      _resetStream();
      return null;
    }

    final streamKey = '${widget.clubId}/$userId';
    if (_accessStreamKey != streamKey) {
      _accessStreamKey = streamKey;
      _accessStream = _accessService.watchBoutiqueAccess(
        clubId: widget.clubId,
        userId: userId,
      );
    }
    return _accessStream;
  }

  @override
  Widget build(BuildContext context) {
    // Always observe AuthProvider, including on routes that were opened from a
    // guarded parent. A nested route is bound to the account that opened it;
    // logout/account switching must therefore hide its cached child instead of
    // continuing to authorize the old uid.
    final auth = context.watch<AuthProvider?>();
    final hasAuthProvider = auth != null;
    final userId =
        auth == null ? widget.testUserIdOverride : auth.currentUser?.uid;
    final authIdentityChanged =
        widget._authBoundUserId != null && userId != widget._authBoundUserId;

    if (auth?.isLoading == true) {
      _resetStream();
      return const _BoutiqueAccessLoading();
    }
    if (userId == null || authIdentityChanged) {
      _resetStream();
      return const BoutiqueAccessUnavailable();
    }

    return StreamBuilder<BoutiqueAccessState>(
      key: ValueKey('${widget.clubId}/$userId'),
      stream: _watchAccess(userId),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return const BoutiqueAccessUnavailable();
        }
        if (!snapshot.hasData) {
          return const _BoutiqueAccessLoading();
        }

        final access = snapshot.requireData;
        final allowed = widget.requiredSection == null
            ? access.canAccess
            : access.canAccessSection(widget.requiredSection!);
        if (!allowed) return const BoutiqueAccessUnavailable();

        return BoutiqueAccessScope(
          accessService: _accessService,
          clubId: widget.clubId,
          userId: userId,
          testUserIdOverride:
              hasAuthProvider ? null : widget.testUserIdOverride,
          child: Builder(
            builder: (scopedContext) => widget.builder(scopedContext, access),
          ),
        );
      },
    );
  }
}

/// Carries the exact live-access source into Boutique routes opened from an
/// already guarded route. This keeps test injection and non-default clubs from
/// silently falling back to the production singleton/default club.
class BoutiqueAccessScope extends InheritedWidget {
  final BoutiqueAccessService accessService;
  final String clubId;
  final String userId;
  final String? testUserIdOverride;

  const BoutiqueAccessScope({
    super.key,
    required this.accessService,
    required this.clubId,
    required this.userId,
    this.testUserIdOverride,
    required super.child,
  });

  static BoutiqueAccessScope? maybeOf(BuildContext context) {
    return context.getInheritedWidgetOfExactType<BoutiqueAccessScope>();
  }

  @override
  bool updateShouldNotify(BoutiqueAccessScope oldWidget) {
    return accessService != oldWidget.accessService ||
        clubId != oldWidget.clubId ||
        userId != oldWidget.userId ||
        testUserIdOverride != oldWidget.testUserIdOverride;
  }
}

class BoutiqueAccessUnavailable extends StatelessWidget {
  const BoutiqueAccessUnavailable({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Boutique')),
      body: const Center(
        key: Key('boutique-access-unavailable'),
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'La Boutique n’est pas disponible pour le moment.',
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}

class _BoutiqueAccessLoading extends StatelessWidget {
  const _BoutiqueAccessLoading();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: CircularProgressIndicator(
          key: Key('boutique-access-loading'),
        ),
      ),
    );
  }
}

MaterialPageRoute<T> boutiqueAccessGuardedRoute<T>({
  required WidgetBuilder builder,
  BuildContext? sourceContext,
  String? requiredSection,
  BoutiqueAccessService? accessService,
  String? clubId,
  @visibleForTesting String? testUserIdOverride,
  RouteSettings? settings,
  bool fullscreenDialog = false,
}) {
  final inherited =
      sourceContext == null ? null : BoutiqueAccessScope.maybeOf(sourceContext);
  return MaterialPageRoute<T>(
    settings: settings,
    fullscreenDialog: fullscreenDialog,
    builder: (context) => BoutiqueAccessGuard._forRoute(
      requiredSection: requiredSection,
      accessService: accessService ?? inherited?.accessService,
      clubId: clubId ?? inherited?.clubId ?? FirebaseConfig.defaultClubId,
      authBoundUserId:
          inherited?.testUserIdOverride == null ? inherited?.userId : null,
      testUserIdOverride: testUserIdOverride ?? inherited?.testUserIdOverride,
      builder: (context, _) => builder(context),
    ),
  );
}

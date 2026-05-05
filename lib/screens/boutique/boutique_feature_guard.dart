import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/member_provider.dart';
import '../../services/feature_flag_service.dart';

class BoutiqueFeatureGuard extends StatefulWidget {
  final Widget child;

  const BoutiqueFeatureGuard({super.key, required this.child});

  @override
  State<BoutiqueFeatureGuard> createState() => _BoutiqueFeatureGuardState();
}

class _BoutiqueFeatureGuardState extends State<BoutiqueFeatureGuard> {
  bool _redirectScheduled = false;

  @override
  Widget build(BuildContext context) {
    final flags = context.watch<FeatureFlagService>();
    final memberProvider = context.watch<MemberProvider>();
    final visible = flags.isBoutiqueVisibleForMemberProvider(memberProvider);

    if (flags.isLoading || memberProvider.isLoading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (!visible) {
      if (!_redirectScheduled) {
        _redirectScheduled = true;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          Navigator.of(
            context,
          ).pushNamedAndRemoveUntil('/home', (route) => false);
        });
      }
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return widget.child;
  }
}

import 'package:flutter/material.dart';

import '../config/app_colors.dart';
import '../utils/dive_number_policy.dart';

/// Makes the client-side estimate visibly provisional until the server has
/// persisted and returned the definitive number.
class DiveNumberProvisionalNotice extends StatelessWidget {
  final bool visible;

  const DiveNumberProvisionalNotice({
    super.key,
    required this.visible,
  });

  @override
  Widget build(BuildContext context) {
    if (!visible) return const SizedBox.shrink();
    return const Padding(
      key: ValueKey('dive-number-provisional-notice'),
      padding: EdgeInsets.only(top: 8),
      child: Text(
        automaticDiveNumberNotice,
        style: TextStyle(fontSize: 12, color: AppColors.donkerblauw),
      ),
    );
  }
}

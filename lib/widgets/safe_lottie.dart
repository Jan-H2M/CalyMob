import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';

/// Safe Lottie widget that handles loading errors gracefully (especially on web)
/// Use this instead of Lottie.asset() for decorative animations that should fail silently
class SafeLottie extends StatelessWidget {
  final String asset;
  final double? width;
  final double? height;
  final bool repeat;
  final AnimationController? controller;

  const SafeLottie({
    super.key,
    required this.asset,
    this.width,
    this.height,
    this.repeat = true,
    this.controller,
  });

  @override
  Widget build(BuildContext context) {
    return Lottie.asset(
      asset,
      width: width,
      height: height,
      repeat: repeat,
      controller: controller,
      errorBuilder: (context, error, stackTrace) {
        // On error, return empty container (silent fail for decorative animations)
        debugPrint('⚠️ Lottie load error for $asset: $error');
        return SizedBox(width: width, height: height);
      },
    );
  }
}

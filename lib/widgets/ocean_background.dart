import 'package:flutter/material.dart';
import '../config/app_assets.dart';

/// Herbruikbare underwater achtergrond widget
class OceanBackground extends StatelessWidget {
  final Widget child;
  final bool useFullBackground; // true = donker (home), false = licht (content)
  final bool showHeader; // toon water oppervlak header

  const OceanBackground({
    Key? key,
    required this.child,
    this.useFullBackground = true,
    this.showHeader = false,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      height: double.infinity,
      decoration: BoxDecoration(
        image: DecorationImage(
          image: AssetImage(
            useFullBackground ? AppAssets.backgroundFull : AppAssets.backgroundLight,
          ),
          fit: BoxFit.cover,
        ),
      ),
      child: showHeader
          ? Column(
              children: [
                // Water oppervlak header
                Image.asset(
                  AppAssets.backgroundTop,
                  width: double.infinity,
                  height: 120,
                  fit: BoxFit.cover,
                ),
                Expanded(child: child),
              ],
            )
          : child,
    );
  }
}

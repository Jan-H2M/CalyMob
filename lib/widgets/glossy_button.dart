import 'package:flutter/material.dart';
import '../config/app_assets.dart';
import '../config/app_colors.dart';

/// Glossy 3D knop met underwater thema
class GlossyButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final double size;
  final Color? tintColor; // Optionele kleur tint
  final bool isEnabled;

  const GlossyButton({
    Key? key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.size = 110,
    this.tintColor,
    this.isEnabled = true,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: isEnabled ? 1.0 : 0.4,
      child: GestureDetector(
        onTap: isEnabled ? onTap : null,
        child: SizedBox(
          width: size,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // De glossy knop
              SizedBox(
                width: size,
                height: size,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    // De knop afbeelding met optionele tint (geen boxShadow)
                    tintColor != null
                        ? ColorFiltered(
                            colorFilter: ColorFilter.mode(
                              tintColor!.withOpacity(0.3),
                              BlendMode.srcATop,
                            ),
                            child: Image.asset(
                              AppAssets.buttonBlue,
                              width: size,
                              height: size,
                              fit: BoxFit.contain,
                            ),
                          )
                        : Image.asset(
                            AppAssets.buttonBlue,
                            width: size,
                            height: size,
                            fit: BoxFit.contain,
                          ),
                    // Het icoon
                    Icon(
                      icon,
                      size: size * 0.42,
                      color: Colors.white,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              // Label
              Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

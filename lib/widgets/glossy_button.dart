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
    this.size = 100,
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
                width: size * 0.85,
                height: size * 0.85,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    // Glow effect achter de knop
                    Container(
                      width: size * 0.8,
                      height: size * 0.8,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: (tintColor ?? AppColors.lightCyan).withOpacity(0.4),
                            blurRadius: 15,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                    ),
                    // De knop afbeelding met optionele tint
                    tintColor != null
                        ? ColorFiltered(
                            colorFilter: ColorFilter.mode(
                              tintColor!.withOpacity(0.3),
                              BlendMode.srcATop,
                            ),
                            child: Image.asset(
                              AppAssets.buttonBlue,
                              width: size * 0.85,
                              height: size * 0.85,
                              fit: BoxFit.contain,
                            ),
                          )
                        : Image.asset(
                            AppAssets.buttonBlue,
                            width: size * 0.85,
                            height: size * 0.85,
                            fit: BoxFit.contain,
                          ),
                    // Het icoon
                    Icon(
                      icon,
                      size: size * 0.35,
                      color: Colors.white,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              // Label
              Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  shadows: [
                    Shadow(
                      color: Colors.black45,
                      offset: Offset(1, 1),
                      blurRadius: 2,
                    ),
                  ],
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

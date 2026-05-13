import 'package:flutter/material.dart';
import '../config/app_colors.dart';

/// Phase C (2026-05-13) — shared "glossy" tile widget extracted from
/// `landing_screen.dart` so the same maritime aesthetic can be reused
/// on Mon Profil and other hubs.
///
/// Two variants:
///   - [ProfileTile.large]  → 90×90 circle used on the LandingScreen and
///                            the Mon Profil grid. The badge counter is
///                            rendered on the top-right corner.
///   - [ProfileTile.list]   → rectangular row used inside Mon Profil's
///                            section cards. Same gradient theme but
///                            optimised for legibility in a list.
///
/// Both variants honour the same color vocabulary (white →
/// AppColors.middenblauw → AppColors.donkerblauw) and respect Calypso's
/// ocean theme so screens remain visually coherent over the OceanBackground.
class ProfileTile extends StatelessWidget {
  /// Visible label below the icon (large) or after the icon (list).
  final String title;

  /// Optional helper / hint text shown only in the `list` variant.
  final String? subtitle;

  final IconData icon;
  final VoidCallback onTap;

  /// Unread/action count rendered as a red bubble on the top-right.
  /// `0` means hidden. Capped visually at `99+`.
  final int badgeCount;

  /// Set true to dim the tile and treat taps as no-op until ready.
  final bool disabled;

  /// Layout variant. See [ProfileTile.large] / [ProfileTile.list].
  final ProfileTileVariant variant;

  /// Override the gradient colors. Defaults to the maritime palette.
  final Gradient? gradientOverride;

  const ProfileTile.large({
    super.key,
    required this.title,
    required this.icon,
    required this.onTap,
    this.badgeCount = 0,
    this.disabled = false,
    this.gradientOverride,
  })  : subtitle = null,
        variant = ProfileTileVariant.large;

  const ProfileTile.list({
    super.key,
    required this.title,
    required this.icon,
    required this.onTap,
    this.subtitle,
    this.badgeCount = 0,
    this.disabled = false,
    this.gradientOverride,
  }) : variant = ProfileTileVariant.list;

  @override
  Widget build(BuildContext context) {
    if (variant == ProfileTileVariant.list) return _buildListVariant(context);
    return _buildLargeVariant(context);
  }

  // ---------------------------------------------------------------------------
  // Large (circular) variant — used on LandingScreen + ProfileScreen grid.
  // ---------------------------------------------------------------------------
  Widget _buildLargeVariant(BuildContext context) {
    final gradient = gradientOverride ??
        RadialGradient(
          center: const Alignment(-0.3, -0.4),
          colors: [
            Colors.white.withValues(alpha: disabled ? 0.10 : 0.25),
            AppColors.middenblauw.withValues(alpha: disabled ? 0.30 : 0.60),
            AppColors.donkerblauw.withValues(alpha: disabled ? 0.40 : 0.80),
          ],
          stops: const [0.0, 0.5, 1.0],
        );

    return Semantics(
      button: true,
      label: title,
      child: GestureDetector(
        onTap: disabled ? null : onTap,
        child: Opacity(
          opacity: disabled ? 0.55 : 1.0,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 90,
                height: 90,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: gradient,
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.2),
                    width: 1,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.donkerblauw.withValues(alpha: 0.4),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Stack(
                  clipBehavior: Clip.none,
                  alignment: Alignment.center,
                  children: [
                    Icon(icon, size: 40, color: Colors.white),
                    if (badgeCount > 0) _BadgeBubble(count: badgeCount),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                  shadows: [
                    Shadow(
                      offset: Offset(0, 1),
                      blurRadius: 3,
                      color: Colors.black45,
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

  // ---------------------------------------------------------------------------
  // List variant — used inside Mon Profil section cards.
  // ---------------------------------------------------------------------------
  Widget _buildListVariant(BuildContext context) {
    return Semantics(
      button: true,
      label: title,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: disabled ? null : onTap,
          borderRadius: BorderRadius.circular(14),
          child: Opacity(
            opacity: disabled ? 0.55 : 1.0,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Row(
                children: [
                  // Mini-circle on the left, same maritime gradient.
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: gradientOverride ??
                          RadialGradient(
                            center: const Alignment(-0.3, -0.4),
                            colors: [
                              Colors.white.withValues(alpha: 0.25),
                              AppColors.middenblauw.withValues(alpha: 0.6),
                              AppColors.donkerblauw.withValues(alpha: 0.8),
                            ],
                            stops: const [0.0, 0.5, 1.0],
                          ),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.donkerblauw.withValues(alpha: 0.25),
                          blurRadius: 6,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Stack(
                      clipBehavior: Clip.none,
                      alignment: Alignment.center,
                      children: [
                        Icon(icon, size: 22, color: Colors.white),
                        if (badgeCount > 0)
                          _BadgeBubble(count: badgeCount, small: true),
                      ],
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                        if (subtitle != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            subtitle!,
                            style: TextStyle(
                              fontSize: 12.5,
                              color: Colors.white.withValues(alpha: 0.75),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  Icon(
                    Icons.chevron_right,
                    color: Colors.white.withValues(alpha: 0.7),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Two layout flavours for [ProfileTile]. `large` renders a 90x90 circle
/// suitable for landing-page hubs; `list` renders a row optimised for
/// vertically stacked menu sections.
enum ProfileTileVariant { large, list }

class _BadgeBubble extends StatelessWidget {
  final int count;
  final bool small;

  const _BadgeBubble({required this.count, this.small = false});

  @override
  Widget build(BuildContext context) {
    final double minSize = small ? 16 : 22;
    return Positioned(
      top: small ? -1 : -2,
      right: small ? -1 : -2,
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: small ? 4 : 6,
          vertical: small ? 1 : 2,
        ),
        decoration: BoxDecoration(
          color: Colors.red,
          borderRadius: BorderRadius.circular(small ? 8 : 12),
          border: Border.all(color: Colors.white, width: small ? 1.5 : 2),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.3),
              blurRadius: 4,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        constraints: BoxConstraints(minWidth: minSize, minHeight: minSize),
        child: Text(
          count > 99 ? '99+' : count.toString(),
          style: TextStyle(
            color: Colors.white,
            fontSize: small ? 9 : 12,
            fontWeight: FontWeight.bold,
          ),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}

/// Phase C polish (2026-05-13) — Mon Profil hub.
///
/// Compact hub per `_carnet_plan.md` §3.1.10:
///   - Compact header with avatar + name + niveau pill.
///   - QR card on top (tap → fullscreen scan mode via existing dialog).
///   - "Mes accès" section (role-gated): Piscine + Finances tiles.
///   - "Mon compte" section: Identité / Certificat médical / Paramètres
///     / Déconnexion tiles.
///
/// All the editable bits (photo / phone / consents) now live inside
/// `identite_screen.dart` so this hub stays small (~250 lines vs the
/// previous ~870-line monolith).

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../models/medical_certification.dart';
import '../../models/member_profile.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../providers/unread_count_provider.dart';
import '../../services/medical_certification_service.dart';
import '../../services/profile_service.dart';
import '../../utils/club_role_utils.dart';
import '../../widgets/certification_status_badge.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../../widgets/user_qr_card.dart';
import '../auth/login_screen.dart';
import '../expenses/financial_screen.dart';
import '../piscine/availability_screen.dart';
import 'identite_screen.dart';
import 'medical_certification_screen.dart';
import 'settings_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  static const String _clubId = 'calypso';
  final ProfileService _profileService = ProfileService();
  final MedicalCertificationService _certService =
      MedicalCertificationService();

  // ---------------- Role helpers (Mes accès gating) ----------------

  List<String> _piscineRoles(MemberProvider memberProvider) {
    final roles = ClubRoleUtils.normalizeRoles(memberProvider.clubStatuten);
    final out = <String>[];
    if (roles.contains('encadrant')) out.add('encadrant');
    if (roles.contains('accueil')) out.add('accueil');
    if (roles.contains('gonflage')) out.add('gonflage');
    if (roles.contains('encadrant')) out.add('theorie');
    return out;
  }

  bool _hasPiscineRole(MemberProvider memberProvider) {
    final roles = ClubRoleUtils.normalizeRoles(memberProvider.clubStatuten);
    return roles.contains('encadrant') ||
        roles.contains('accueil') ||
        roles.contains('gonflage');
  }

  // ---------------- Logout ----------------

  Future<void> _handleLogout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Déconnexion'),
        content: const Text('Voulez-vous vous déconnecter ?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Déconnecter',
                style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await context.read<AuthProvider>().logout();
    if (!mounted) return;
    context.read<MemberProvider>().clear();
    context.read<UnreadCountProvider>().clear();
    if (mounted) {
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
        (route) => false,
      );
    }
  }

  // ---------------- Build ----------------

  @override
  Widget build(BuildContext context) {
    final userId = context.watch<AuthProvider>().currentUser?.uid ?? '';
    final memberProvider = context.watch<MemberProvider>();

    if (userId.isEmpty) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title:
            const Text('Mon Profil', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: StreamBuilder<MemberProfile?>(
            stream: _profileService.watchProfile(_clubId, userId),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(
                  child: CircularProgressIndicator(color: Colors.white),
                );
              }
              if (!snapshot.hasData || snapshot.data == null) {
                return const Center(
                  child: Text(
                    'Erreur de chargement du profil',
                    style: TextStyle(color: Colors.white),
                  ),
                );
              }
              final profile = snapshot.data!;
              final showPiscine = _hasPiscineRole(memberProvider);
              // Finances stays universally available — matches the old
              // landing behaviour. If a stricter gate becomes needed we'll
              // add it here.
              final showFinances = true;
              final showMesAcces = showPiscine || showFinances;

              return SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _IdentityHeader(profile: profile),
                    const SizedBox(height: 16),
                    UserQRCard(profile: profile),
                    if (showMesAcces) ...[
                      const SizedBox(height: 24),
                      _SectionHeader(label: 'Mes accès'),
                      const SizedBox(height: 8),
                      _whiteCard(
                        child: Column(
                          children: [
                            if (showPiscine)
                              _TileRow(
                                icon: Icons.pool,
                                title: 'Piscine',
                                subtitle: 'Disponibilités & planning',
                                onTap: () {
                                  final roles = _piscineRoles(memberProvider);
                                  if (roles.isEmpty) return;
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => AvailabilityScreen(
                                        userRoles: roles,
                                      ),
                                    ),
                                  );
                                },
                              ),
                            if (showPiscine && showFinances)
                              _divider(),
                            if (showFinances)
                              _TileRow(
                                icon: Icons.account_balance_wallet_outlined,
                                title: 'Finances',
                                subtitle: 'Note de frais & remboursements',
                                onTap: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => const FinancialScreen(),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                    _SectionHeader(label: 'Mon compte'),
                    const SizedBox(height: 8),
                    _whiteCard(
                      child: Column(
                        children: [
                          _TileRow(
                            icon: Icons.person_outline,
                            iconBg: Colors.green.shade50,
                            iconColor: Colors.green.shade700,
                            title: 'Identité',
                            subtitle: 'Photo, téléphone, niveau LIFRAS',
                            trailingPreview: _identityPreview(profile),
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => const IdentiteScreen(),
                              ),
                            ),
                          ),
                          _divider(),
                          StreamBuilder<MedicalCertification?>(
                            stream: _certService
                                .watchCurrentCertification(_clubId, userId),
                            builder: (context, certSnap) {
                              final cert = certSnap.data;
                              return _TileRow(
                                icon: Icons.medical_services_outlined,
                                iconBg: Colors.red.shade50,
                                iconColor: Colors.red.shade700,
                                title: 'Certificat médical',
                                subtitleWidget: CertificationStatusBadge(
                                  certification: cert,
                                  compact: true,
                                ),
                                onTap: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => MedicalCertificationScreen(
                                      userId: userId,
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                          _divider(),
                          _TileRow(
                            icon: Icons.settings_outlined,
                            iconBg: Colors.blue.shade50,
                            iconColor: AppColors.middenblauw,
                            title: 'Paramètres',
                            subtitle:
                                'Notifications, agenda, vie privée',
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => const SettingsScreen(),
                              ),
                            ),
                          ),
                          _divider(),
                          _TileRow(
                            icon: Icons.logout,
                            iconBg: Colors.red.shade50,
                            iconColor: Colors.red,
                            title: 'Déconnexion',
                            titleColor: Colors.red,
                            onTap: _handleLogout,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _whiteCard({required Widget child}) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: AppColors.donkerblauw.withValues(alpha: 0.18),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
  }

  Widget _divider() =>
      Divider(height: 1, color: Colors.grey.shade200, indent: 60);

  String? _identityPreview(MemberProfile profile) {
    if (profile.phoneNumber != null && profile.phoneNumber!.isNotEmpty) {
      return profile.phoneNumber;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Compact identity header (avatar + name + niveau pill)
// ---------------------------------------------------------------------------

class _IdentityHeader extends StatelessWidget {
  final MemberProfile profile;
  const _IdentityHeader({required this.profile});

  Color _niveauColor(String? code) {
    if (code == null) return Colors.grey;
    switch (code.toUpperCase()) {
      case '1':
      case 'NB':
        return Colors.grey;
      case '2':
      case 'P2':
        return Colors.blue;
      case '3':
      case 'P3':
        return Colors.green;
      case '4':
      case 'P4':
        return Colors.orange;
      case 'AM':
        return Colors.purple;
      case 'MC':
      case 'MF':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: 0.2),
              border: Border.all(color: Colors.white, width: 2),
            ),
            child: ClipOval(
              child: profile.hasPhoto
                  ? CachedNetworkImage(
                      imageUrl: profile.photoUrl!,
                      fit: BoxFit.cover,
                      placeholder: (_, __) => const Center(
                        child: SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      errorWidget: (_, __, ___) =>
                          const Icon(Icons.person, color: Colors.white),
                    )
                  : const Icon(Icons.person, color: Colors.white, size: 32),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  profile.fullName,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                if (profile.plongeurNiveau != null) ...[
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: _niveauColor(profile.plongeurCode),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Text(
                      profile.plongeurNiveau!,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Small atoms
// ---------------------------------------------------------------------------

class _SectionHeader extends StatelessWidget {
  final String label;
  const _SectionHeader({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          color: Colors.white.withValues(alpha: 0.9),
          fontSize: 11,
          fontWeight: FontWeight.w800,
          letterSpacing: 1.4,
          shadows: const [
            Shadow(
              color: Colors.black26,
              offset: Offset(0, 1),
              blurRadius: 2,
            ),
          ],
        ),
      ),
    );
  }
}

class _TileRow extends StatelessWidget {
  final IconData icon;
  final Color? iconBg;
  final Color? iconColor;
  final String title;
  final Color? titleColor;
  final String? subtitle;
  final Widget? subtitleWidget;
  final String? trailingPreview;
  final VoidCallback onTap;

  const _TileRow({
    required this.icon,
    required this.title,
    required this.onTap,
    this.iconBg,
    this.iconColor,
    this.titleColor,
    this.subtitle,
    this.subtitleWidget,
    this.trailingPreview,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: iconBg ?? AppColors.middenblauw.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  icon,
                  color: iconColor ?? AppColors.middenblauw,
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: titleColor ?? Colors.black87,
                      ),
                    ),
                    if (subtitleWidget != null) ...[
                      const SizedBox(height: 2),
                      subtitleWidget!,
                    ] else if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle!,
                        style: TextStyle(
                          fontSize: 12.5,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (trailingPreview != null) ...[
                const SizedBox(width: 8),
                Text(
                  trailingPreview!,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade500,
                  ),
                ),
              ],
              const SizedBox(width: 6),
              Icon(
                Icons.chevron_right,
                color: Colors.grey.shade400,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

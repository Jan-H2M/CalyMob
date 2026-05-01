import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../providers/unread_count_provider.dart';
import '../../services/app_update_service.dart';
import '../../services/avatar_nudge_service.dart';
import '../../utils/club_role_utils.dart';
import '../../widgets/ocean_background.dart';
import '../../widgets/ocean/ocean_config.dart';
import '../auth/login_screen.dart';
import '../operations/operations_list_screen.dart';
import '../communication/communication_hub_screen.dart';
import '../expenses/financial_screen.dart';
import '../profile/profile_screen.dart';
import '../profile/who_is_who_screen.dart';
import '../piscine/availability_screen.dart';

/// Landing page avec thème maritime animé et boutons ronds
class LandingScreen extends StatefulWidget {
  const LandingScreen({Key? key}) : super(key: key);

  @override
  State<LandingScreen> createState() => _LandingScreenState();
}

class _LandingScreenState extends State<LandingScreen> {
  String _versionString = '';
  List<String>? _clubStatuten;
  OceanParams? _oceanParams;
  bool _avatarNudgeChecked = false;

  @override
  void initState() {
    super.initState();
    _loadVersionInfo();
    _loadOceanParams();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _runInitialPrompts();
    });
  }

  Future<void> _runInitialPrompts() async {
    if (!mounted) return;
    _initFromMemberProvider();
    await _checkForAppUpdate();
    await _checkAvatarNudge();
  }

  Future<void> _loadVersionInfo() async {
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      if (mounted) {
        setState(() {
          _versionString =
              'Version ${packageInfo.version} (${packageInfo.buildNumber})';
        });
      }
    } catch (e) {
      debugPrint('Error loading version info: $e');
    }
  }

  Future<void> _loadOceanParams() async {
    final params = await OceanParams.load();
    if (mounted) {
      setState(() => _oceanParams = params);
    }
  }

  void _initFromMemberProvider() {
    if (!mounted) return;

    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final memberProvider = Provider.of<MemberProvider>(context, listen: false);
    final uid = authProvider.currentUser?.uid;
    if (uid == null) return;

    final roles = memberProvider.clubStatuten;
    final includeAllTeamChannels = ClubRoleUtils.hasAdminAccess(
      roles,
      appRole: memberProvider.appRole,
    );
    setState(() {
      _clubStatuten = roles.isNotEmpty ? roles : null;
    });

    final unreadProvider =
        Provider.of<UnreadCountProvider>(context, listen: false);
    if (!unreadProvider.isListening) {
      unreadProvider.listen(
        FirebaseConfig.defaultClubId,
        uid,
        roles: roles,
        includeAllTeamChannels: includeAllTeamChannels,
      );
    }
  }

  bool _hasPiscineRole() {
    if (_clubStatuten == null) return false;
    final roles = ClubRoleUtils.normalizeRoles(_clubStatuten!);
    return roles.contains('accueil') ||
        roles.contains('encadrant') ||
        roles.contains('gonflage');
  }

  List<String> _getPiscineRoles() {
    if (_clubStatuten == null) return [];
    final roles = ClubRoleUtils.normalizeRoles(_clubStatuten!);
    final piscineRoles = <String>[];
    if (roles.contains('encadrant')) {
      piscineRoles.add('encadrant');
    }
    if (roles.contains('accueil')) piscineRoles.add('accueil');
    if (roles.contains('gonflage')) piscineRoles.add('gonflage');
    if (roles.contains('encadrant')) {
      piscineRoles.add('theorie');
    }
    return piscineRoles;
  }

  Future<void> _checkForAppUpdate() async {
    if (!mounted) return;
    await AppUpdateService.showUpdateDialogIfNeeded(context);
  }

  Future<void> _checkAvatarNudge() async {
    if (_avatarNudgeChecked || !mounted) return;

    final authProvider = context.read<AuthProvider>();
    final memberProvider = context.read<MemberProvider>();
    final userId = authProvider.currentUser?.uid ?? '';
    if (userId.isEmpty) return;

    _avatarNudgeChecked = true;

    try {
      // Laat eventuele andere dialogs eerst uitwerken voor we de nudge tonen.
      await Future.delayed(const Duration(milliseconds: 1200));
      if (!mounted) return;

      final hasPhoto = (memberProvider.photoUrl ?? '').isNotEmpty;
      final shouldShow = await AvatarNudgeService.shouldShow(
        userId: userId,
        hasPhoto: hasPhoto,
      );
      if (!shouldShow || !mounted) return;

      _showAvatarNudgeDialog(userId);
    } catch (e) {
      debugPrint('Avatar nudge check failed: $e');
    }
  }

  void _showAvatarNudgeDialog(String userId) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppColors.middenblauw.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.account_circle_outlined,
                color: AppColors.middenblauw,
                size: 28,
              ),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Text('Montrez-vous au club'),
            ),
          ],
        ),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Chez Calypso, on plonge en équipe. Ajoutez votre photo pour que les autres membres vous reconnaissent et se sentent à l\'aise avec vous, surtout les nouveaux.',
              style: TextStyle(fontSize: 15, height: 1.35),
            ),
            SizedBox(height: 14),
            _AvatarNudgeBullet(
              icon: Icons.favorite_outline,
              text: 'Un visage, c\'est un nom qu\'on retient',
            ),
            SizedBox(height: 8),
            _AvatarNudgeBullet(
              icon: Icons.groups_outlined,
              text: 'On se retrouve plus vite dans sa palanquée',
            ),
            SizedBox(height: 8),
            _AvatarNudgeBullet(
              icon: Icons.waving_hand_outlined,
              text: 'Accueillir les nouveaux devient plus facile',
            ),
            SizedBox(height: 14),
            Text(
              'Vous pouvez la changer ou la retirer quand vous voulez.',
              style: TextStyle(fontSize: 12.5, color: Colors.black54),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () async {
              await AvatarNudgeService.markShown(userId);
              if (!dialogContext.mounted) return;
              Navigator.of(dialogContext).pop();
            },
            child: const Text('Plus tard'),
          ),
          ElevatedButton.icon(
            onPressed: () async {
              await AvatarNudgeService.markShown(userId);
              if (!mounted || !dialogContext.mounted) return;
              Navigator.of(dialogContext).pop();
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const ProfileScreen()),
              );
            },
            icon: const Icon(Icons.add_a_photo_outlined, size: 18),
            label: const Text('Ajouter ma photo'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.middenblauw,
              foregroundColor: Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _handleLogout(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Déconnexion'),
        content: const Text('Voulez-vous vous déconnecter ?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Déconnecter',
                style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      final authProvider = context.read<AuthProvider>();
      final memberProvider = context.read<MemberProvider>();
      final unreadProvider = context.read<UnreadCountProvider>();

      await authProvider.logout();
      memberProvider.clear();
      unreadProvider.clear();

      if (context.mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const LoginScreen()),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final unreadProvider = context.watch<UnreadCountProvider>();
    final userName = authProvider.displayName ?? 'Utilisateur';

    return Scaffold(
      backgroundColor: Colors.black,
      body: OceanBackground(
        params: _oceanParams,
        fixedHour: (_oceanParams != null && !_oceanParams!.useRealTime)
            ? _oceanParams!.fixedHour
            : null,
        child: SafeArea(
          child: Column(
            children: [
              // Top bar met logout
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.logout, color: Colors.white),
                      onPressed: () => _handleLogout(context),
                      tooltip: 'Déconnexion',
                    ),
                  ],
                ),
              ),

              // Logo is now rendered as sun/moon in the ocean shader layer
              const SizedBox(height: 170), // maintain spacing where logo was

              // Welcome text
              Text(
                'Bienvenue',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: Colors.white70,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 4),
              Text(
                userName,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                  shadows: [
                    const Shadow(
                        offset: Offset(0, 1),
                        blurRadius: 4,
                        color: Colors.black38),
                  ],
                ),
                textAlign: TextAlign.center,
              ),

              const Spacer(),

              // Navigation buttons
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    // Row 1
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        _GlossyButton(
                          title: 'Événements',
                          icon: Icons.event,
                          badgeCount: unreadProvider.eventMessages,
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (_) => const OperationsListScreen()),
                          ),
                        ),
                        _GlossyButton(
                          title: 'Communication',
                          icon: Icons.campaign,
                          badgeCount: unreadProvider.announcements +
                              unreadProvider.teamMessages,
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (_) => const CommunicationHubScreen()),
                          ),
                        ),
                        if (_hasPiscineRole())
                          _GlossyButton(
                            title: 'Piscine',
                            icon: Icons.pool,
                            badgeCount: 0,
                            onTap: () {
                              final roles = _getPiscineRoles();
                              if (roles.isNotEmpty) {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        AvailabilityScreen(userRoles: roles),
                                  ),
                                );
                              }
                            },
                          ),
                      ],
                    ),

                    const SizedBox(height: 20),

                    // Row 2
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        _GlossyButton(
                          title: 'Who is Who',
                          icon: Icons.people,
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (_) => const WhoIsWhoScreen()),
                          ),
                        ),
                        _GlossyButton(
                          title: 'Finances',
                          icon: Icons.account_balance_wallet,
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (_) => const FinancialScreen()),
                          ),
                        ),
                        _GlossyButton(
                          title: 'Mon Profil',
                          icon: Icons.person,
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (_) => const ProfileScreen()),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 40),

              // Version footer
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Text(
                  _versionString,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.white70,
                      ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AvatarNudgeBullet extends StatelessWidget {
  final IconData icon;
  final String text;

  const _AvatarNudgeBullet({
    required this.icon,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: AppColors.middenblauw),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(fontSize: 14),
          ),
        ),
      ],
    );
  }
}

/// Glossy button — now with frosted glass effect instead of PNG
class _GlossyButton extends StatelessWidget {
  final String title;
  final IconData icon;
  final VoidCallback onTap;
  final int badgeCount;

  const _GlossyButton({
    required this.title,
    required this.icon,
    required this.onTap,
    this.badgeCount = 0,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 90,
            height: 90,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                center: const Alignment(-0.3, -0.4),
                colors: [
                  Colors.white.withValues(alpha: 0.25),
                  AppColors.middenblauw.withValues(alpha: 0.6),
                  AppColors.donkerblauw.withValues(alpha: 0.8),
                ],
                stops: const [0.0, 0.5, 1.0],
              ),
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
                if (badgeCount > 0)
                  Positioned(
                    top: -2,
                    right: -2,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.red,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.white, width: 2),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.3),
                            blurRadius: 4,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      constraints:
                          const BoxConstraints(minWidth: 22, minHeight: 22),
                      child: Text(
                        badgeCount > 99 ? '99+' : badgeCount.toString(),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
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
                    offset: Offset(0, 1), blurRadius: 3, color: Colors.black45),
              ],
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

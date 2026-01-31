import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'dart:io';
import '../../config/firebase_config.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../providers/operation_provider.dart';
import '../../providers/expense_provider.dart';
import '../../services/profile_service.dart';
import '../../services/compatibility_service.dart';
import '../../models/compatibility_settings.dart';
import '../../utils/permission_helper.dart';
import '../../widgets/operation_card.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/empty_state_widget.dart';
import '../operations/operation_detail_screen.dart';
import '../expenses/expense_list_screen.dart';
// scan_page.dart is used from operation_detail_screen, not here
import '../auth/login_screen.dart';

/// Écran d'accueil avec navigation tabs (événements + demandes)
class HomeScreen extends StatefulWidget {
  const HomeScreen({Key? key}) : super(key: key);

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final String _clubId = FirebaseConfig.defaultClubId;
  final ProfileService _profileService = ProfileService();
  int _currentIndex = 0;
  bool _canScan = false;
  CompatibilityStatus? _compatibilityStatus;

  @override
  void initState() {
    super.initState();
    // Démarrer les streams
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final authProvider = context.read<AuthProvider>();
      final userId = authProvider.currentUser?.uid ?? '';

      context.read<OperationProvider>().listenToOpenEvents(_clubId);
      context.read<ExpenseProvider>().listenToUserExpenses(_clubId, userId);

      // Check scanner permission
      _checkScanPermission(userId);

      // Check device compatibility
      _checkDeviceCompatibility(userId);
    });
  }

  Future<void> _checkDeviceCompatibility(String userId) async {
    if (userId.isEmpty) return;

    try {
      // Initialize compatibility settings
      await CompatibilityService.initialize(_clubId);

      // Get device info
      final deviceInfo = DeviceInfoPlugin();
      String platform;
      String osVersion;
      int? androidSdkInt;

      if (Platform.isIOS) {
        final iosInfo = await deviceInfo.iosInfo;
        platform = 'ios';
        osVersion = iosInfo.systemVersion;
      } else if (Platform.isAndroid) {
        final androidInfo = await deviceInfo.androidInfo;
        platform = 'android';
        osVersion = androidInfo.version.release;
        androidSdkInt = androidInfo.version.sdkInt;
      } else {
        return;
      }

      // Check compatibility
      final status = await CompatibilityService.checkCurrentDevice(
        platform,
        osVersion,
        androidSdkInt: androidSdkInt,
      );

      // Save status to Firestore
      await CompatibilityService.saveCompatibilityStatus(_clubId, userId, status);

      // Update UI if warning needed
      if (status.warningLevel != 'none' && mounted) {
        setState(() {
          _compatibilityStatus = status;
        });

        // Show SnackBar for warning/error
        if (status.warningLevel == 'warning' || status.warningLevel == 'error') {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(status.message ?? 'Compatibilité device'),
              backgroundColor: status.warningLevel == 'error' ? Colors.red : Colors.orange,
              duration: const Duration(seconds: 5),
              action: SnackBarAction(
                label: 'OK',
                textColor: Colors.white,
                onPressed: () {},
              ),
            ),
          );
        }
      }
    } catch (e) {
      print('⚠️ Failed to check device compatibility: $e');
    }
  }

  Future<void> _checkScanPermission(String userId) async {
    if (userId.isEmpty) return;

    final profile = await _profileService.getProfile(_clubId, userId);
    if (profile != null && mounted) {
      setState(() {
        _canScan = PermissionHelper.canScan(profile.clubStatuten);
      });
    }
  }

  Future<void> _handleLogout() async {
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
            child: const Text('Déconnecter', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      await context.read<AuthProvider>().logout();
      context.read<MemberProvider>().clear();

      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const LoginScreen()),
        );
      }
    }
  }

  Future<void> _refreshOperations() async {
    await context.read<OperationProvider>().refresh(_clubId);
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final operationProvider = context.watch<OperationProvider>();

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: Text(
          _getAppBarTitle(),
          style: const TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.white),
            onPressed: _handleLogout,
            tooltip: 'Déconnexion',
          ),
        ],
      ),
      body: Stack(
        children: [
          // Ocean background
          Positioned.fill(
            child: Image.asset(
              AppAssets.backgroundFull,
              fit: BoxFit.cover,
            ),
          ),
          // Content
          SafeArea(
            child: Column(
              children: [
                // Compatibility warning banner
                if (_compatibilityStatus != null && _compatibilityStatus!.warningLevel != 'none')
                  _buildCompatibilityBanner(),
                // Main content
                Expanded(
                  child: _buildContent(operationProvider, authProvider),
                ),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) {
          setState(() {
            _currentIndex = index;
          });
        },
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.event),
            label: 'Événements',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.receipt_long),
            label: 'Demandes',
          ),
          // Scanner tab - always visible for all logged-in users
          BottomNavigationBarItem(
            icon: Icon(Icons.qr_code_scanner),
            label: 'Scanner',
          ),
        ],
        selectedItemColor: AppColors.middenblauw,
        unselectedItemColor: Colors.grey,
      ),
    );
  }

  String _getAppBarTitle() {
    switch (_currentIndex) {
      case 0:
        return 'Événements';
      case 1:
        return 'Mes demandes';
      case 2:
        return 'Scanner';
      default:
        return 'Événements';
    }
  }

  Widget _buildCompatibilityBanner() {
    if (_compatibilityStatus == null) return const SizedBox.shrink();

    Color backgroundColor;
    Color textColor;
    IconData icon;

    switch (_compatibilityStatus!.warningLevel) {
      case 'error':
        backgroundColor = Colors.red.shade100;
        textColor = Colors.red.shade900;
        icon = Icons.error_outline;
        break;
      case 'warning':
        backgroundColor = Colors.orange.shade100;
        textColor = Colors.orange.shade900;
        icon = Icons.warning_amber_outlined;
        break;
      case 'info':
        backgroundColor = Colors.blue.shade100;
        textColor = Colors.blue.shade900;
        icon = Icons.info_outline;
        break;
      default:
        return const SizedBox.shrink();
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      margin: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: textColor.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Icon(icon, color: textColor, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              _compatibilityStatus!.message ?? '',
              style: TextStyle(
                color: textColor,
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          IconButton(
            icon: Icon(Icons.close, color: textColor, size: 18),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
            onPressed: () {
              setState(() {
                _compatibilityStatus = null;
              });
            },
          ),
        ],
      ),
    );
  }

  Widget _buildContent(
      OperationProvider operationProvider, AuthProvider authProvider) {
    switch (_currentIndex) {
      case 0:
        return RefreshIndicator(
          onRefresh: _refreshOperations,
          child: _buildBody(operationProvider, authProvider),
        );
      case 1:
        return const ExpenseListScreen();
      case 2:
        return _buildScannerPlaceholder();
      default:
        return RefreshIndicator(
          onRefresh: _refreshOperations,
          child: _buildBody(operationProvider, authProvider),
        );
    }
  }

  Widget _buildScannerPlaceholder() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.qr_code_scanner,
              size: 80,
              color: Colors.grey[400],
            ),
            const SizedBox(height: 24),
            Text(
              'Scanner QR',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Colors.grey[700],
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Pour scanner les présences, ouvrez un événement depuis l\'onglet "Événements" et utilisez le bouton scanner.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey[600],
              ),
            ),
            const SizedBox(height: 32),
            ElevatedButton.icon(
              onPressed: () {
                setState(() {
                  _currentIndex = 0;
                });
              },
              icon: const Icon(Icons.event),
              label: const Text('Voir les événements'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.middenblauw,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(
      OperationProvider operationProvider, AuthProvider authProvider) {
    final operations = operationProvider.operations;

    // Loading initial
    if (operationProvider.isLoading && operations.isEmpty) {
      return const LoadingWidget(message: 'Chargement des événements...');
    }

    // Empty state
    if (operations.isEmpty) {
      return EmptyStateWidget(
        icon: Icons.event_busy,
        title: 'Aucun événement disponible',
        subtitle: 'Les nouveaux événements apparaîtront ici',
        onAction: _refreshOperations,
        actionLabel: 'Actualiser',
      );
    }

    // Liste des événements
    return ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: operations.length,
      itemBuilder: (context, index) {
        final operation = operations[index];
        final participantCount =
            operationProvider.getParticipantCount(operation.id);

        return OperationCard(
          operation: operation,
          participantCount: participantCount,
          onTap: () {
            // Navigation vers détail
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => OperationDetailScreen(
                  operationId: operation.id,
                  clubId: _clubId,
                ),
              ),
            );
          },
        );
      },
    );
  }
}

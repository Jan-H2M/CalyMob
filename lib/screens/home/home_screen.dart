import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/firebase_config.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../../providers/operation_provider.dart';
import '../../providers/expense_provider.dart';
import '../../services/profile_service.dart';
import '../../utils/permission_helper.dart';
import '../../widgets/operation_card.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/empty_state_widget.dart';
import '../operations/operation_detail_screen.dart';
import '../expenses/expense_list_screen.dart';
import '../scanner/scan_page.dart';
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
    });
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
            child: _buildContent(operationProvider, authProvider),
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
        items: [
          const BottomNavigationBarItem(
            icon: Icon(Icons.event),
            label: 'Événements',
          ),
          const BottomNavigationBarItem(
            icon: Icon(Icons.receipt_long),
            label: 'Demandes',
          ),
          if (_canScan)
            const BottomNavigationBarItem(
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
        return const ScanPage();
      default:
        return RefreshIndicator(
          onRefresh: _refreshOperations,
          child: _buildBody(operationProvider, authProvider),
        );
    }
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

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/firebase_config.dart';
import '../../config/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../../providers/expense_provider.dart';
import '../../models/expense_claim.dart';
import '../../utils/date_formatter.dart';
import '../../utils/currency_formatter.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/empty_state_widget.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

/// Écran "Mes remboursements" — liste des demandes de remboursement
/// de l'utilisateur connecté, triées en deux sections :
///   - EN COURS : statut 'soumis' ou 'approuve'
///   - REMBOURSÉS : statut 'rembourse'
class MyRefundsScreen extends StatefulWidget {
  const MyRefundsScreen({super.key});

  @override
  State<MyRefundsScreen> createState() => _MyRefundsScreenState();
}

class _MyRefundsScreenState extends State<MyRefundsScreen> {
  final String _clubId = FirebaseConfig.defaultClubId;
  final GlobalKey<RefreshIndicatorState> _refreshKey =
      GlobalKey<RefreshIndicatorState>();

  @override
  void initState() {
    super.initState();
    _loadExpenses();
  }

  void _loadExpenses() {
    final authProvider = context.read<AuthProvider>();
    final userId = authProvider.currentUser?.uid ?? '';
    if (userId.isNotEmpty) {
      context.read<ExpenseProvider>().listenToUserExpenses(_clubId, userId);
    }
  }

  Future<void> _onRefresh() async {
    _loadExpenses();
    // Wait briefly so the spinner shows
    await Future.delayed(const Duration(milliseconds: 300));
  }

  @override
  Widget build(BuildContext context) {
    final expenseProvider = context.watch<ExpenseProvider>();
    final allExpenses = expenseProvider.expenses;

    final enCours = allExpenses
        .where((e) => e.statut == 'soumis' || e.statut == 'approuve')
        .toList();
    final rembourses = allExpenses
        .where((e) => e.statut == 'rembourse')
        .toList();

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'Mes remboursements',
          style: TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: _buildBody(
            expenseProvider: expenseProvider,
            enCours: enCours,
            rembourses: rembourses,
          ),
        ),
      ),
    );
  }

  Widget _buildBody({
    required ExpenseProvider expenseProvider,
    required List<ExpenseClaim> enCours,
    required List<ExpenseClaim> rembourses,
  }) {
    if (expenseProvider.isLoading &&
        enCours.isEmpty &&
        rembourses.isEmpty) {
      return const LoadingWidget(message: 'Chargement des remboursements...');
    }

    if (enCours.isEmpty && rembourses.isEmpty) {
      return EmptyStateWidget(
        icon: Icons.receipt_long,
        title: 'Aucun remboursement',
        subtitle: 'Vous n\'avez pas encore de demandes de remboursement.',
      );
    }

    return RefreshIndicator(
      key: _refreshKey,
      onRefresh: _onRefresh,
      color: AppColors.middenblauw,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (enCours.isNotEmpty) ...[
            _buildSectionHeader('En cours', Icons.hourglass_top, Colors.orange),
            const SizedBox(height: 8),
            ...enCours.map((e) => _buildRefundCard(e, isEnCours: true)),
            const SizedBox(height: 24),
          ],
          if (rembourses.isNotEmpty) ...[
            _buildSectionHeader('Remboursés', Icons.check_circle, Colors.green),
            const SizedBox(height: 8),
            ...rembourses.map((e) => _buildRefundCard(e, isEnCours: false)),
          ],
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title, IconData icon, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      child: Row(
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(width: 8),
          Text(
            title,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          const Spacer(),
        ],
      ),
    );
  }

  Widget _buildRefundCard(ExpenseClaim expense, {required bool isEnCours}) {
    Color statusColor;
    String statusLabel;
    IconData icon;

    switch (expense.statut) {
      case 'soumis':
        statusColor = Colors.orange;
        statusLabel = 'Soumis';
        icon = Icons.access_time;
        break;
      case 'approuve':
        statusColor = Colors.blue;
        statusLabel = 'Approuvé';
        icon = Icons.thumb_up;
        break;
      case 'rembourse':
        statusColor = Colors.green;
        statusLabel = 'Remboursé';
        icon = Icons.check_circle;
        break;
      default:
        statusColor = Colors.grey;
        statusLabel = expense.statusLabel;
        icon = Icons.help_outline;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // En-tête : icône + montant + statut
            Row(
              children: [
                Icon(isEnCours ? Icons.account_balance_wallet : Icons.check_circle,
                    color: isEnCours ? Colors.orange : Colors.green, size: 28),
                const SizedBox(width: 12),
                Text(
                  CurrencyFormatter.format(expense.montant),
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: statusColor, width: 1),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(icon, size: 14, color: statusColor),
                      const SizedBox(width: 4),
                      Text(
                        statusLabel,
                        style: TextStyle(
                          color: statusColor,
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            // Description
            Text(
              expense.description,
              style: const TextStyle(fontSize: 15),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 8),
            // Datum
            Row(
              children: [
                Icon(Icons.calendar_today, size: 14, color: Colors.grey[600]),
                const SizedBox(width: 4),
                Text(
                  DateFormatter.formatMedium(expense.dateDemande),
                  style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

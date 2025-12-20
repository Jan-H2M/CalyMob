import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/firebase_config.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../../providers/expense_provider.dart';
import '../../models/expense_claim.dart';
import '../../utils/date_formatter.dart';
import '../../utils/currency_formatter.dart';
import '../../utils/document_utils.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/empty_state_widget.dart';
import 'create_expense_screen.dart';
import 'expense_detail_screen.dart';
import 'edit_expense_screen.dart';

/// Écran liste des demandes de remboursement
class ExpenseListScreen extends StatefulWidget {
  const ExpenseListScreen({Key? key}) : super(key: key);

  @override
  State<ExpenseListScreen> createState() => _ExpenseListScreenState();
}

class _ExpenseListScreenState extends State<ExpenseListScreen> {
  final String _clubId = FirebaseConfig.defaultClubId;

  @override
  void initState() {
    super.initState();
    _loadExpenses();
  }

  void _loadExpenses() {
    final authProvider = context.read<AuthProvider>();
    final userId = authProvider.currentUser?.uid ?? '';
    context.read<ExpenseProvider>().listenToUserExpenses(_clubId, userId);
  }

  @override
  Widget build(BuildContext context) {
    final expenseProvider = context.watch<ExpenseProvider>();
    final expenses = expenseProvider.expenses;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text('Mes demandes', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
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
            child: _buildBody(expenseProvider, expenses),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          Navigator.push(context, MaterialPageRoute(builder: (_) => const CreateExpenseScreen()));
        },
        backgroundColor: AppColors.middenblauw,
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }

  Widget _buildBody(ExpenseProvider expenseProvider, List<ExpenseClaim> expenses) {
    if (expenseProvider.isLoading && expenses.isEmpty) {
      return const LoadingWidget(message: 'Chargement des demandes...');
    }

    if (expenses.isEmpty) {
      return EmptyStateWidget(
        icon: Icons.receipt_long,
        title: 'Aucune demande',
        subtitle: 'Créez votre première demande de remboursement',
        onAction: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CreateExpenseScreen())),
        actionLabel: 'Créer une demande',
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: expenses.length,
      itemBuilder: (context, index) => _buildExpenseCard(expenses[index]),
    );
  }

  Widget _buildExpenseCard(ExpenseClaim expense) {
    Color statusColor;
    switch (expense.statusColor) {
      case 'green': statusColor = Colors.green; break;
      case 'red': statusColor = Colors.red; break;
      case 'orange': statusColor = Colors.orange; break;
      default: statusColor = Colors.grey;
    }

    final isSoumis = expense.statut == 'soumis';

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ExpenseDetailScreen(expense: expense))),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // HEADER
              Row(
                children: [
                  Text(CurrencyFormatter.format(expense.montant), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                  if (expense.urlsJustificatifs.isNotEmpty) Container(
                    margin: const EdgeInsets.only(left: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(10)),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.attach_file, size: 12, color: Colors.grey[600]),
                        const SizedBox(width: 2),
                        Text('${expense.urlsJustificatifs.length}', style: TextStyle(fontSize: 11, color: Colors.grey[700])),
                      ],
                    ),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: statusColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: statusColor, width: 1),
                    ),
                    child: Text(expense.statusLabel, style: TextStyle(color: statusColor, fontSize: 12, fontWeight: FontWeight.bold)),
                  ),
                  IconButton(
                    icon: const Icon(Icons.visibility, size: 20),
                    onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ExpenseDetailScreen(expense: expense))),
                    tooltip: 'Voir détails',
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                  if (isSoumis) ...[
                    const SizedBox(width: 8),
                    IconButton(
                      icon: const Icon(Icons.edit, size: 20, color: Colors.blue),
                      onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => EditExpenseScreen(expense: expense))),
                      tooltip: 'Modifier',
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                    const SizedBox(width: 8),
                    IconButton(
                      icon: const Icon(Icons.delete, size: 20, color: Colors.red),
                      onPressed: () => _handleDelete(expense),
                      tooltip: 'Supprimer',
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 8),
              Text(expense.description, style: const TextStyle(fontSize: 16), maxLines: 2, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(Icons.calendar_today, size: 14, color: Colors.grey[600]),
                  const SizedBox(width: 4),
                  Text(DateFormatter.formatShort(expense.dateDepense), style: TextStyle(fontSize: 14, color: Colors.grey[600])),
                  const SizedBox(width: 16),
                  if (expense.categorie != null) ...[
                    Icon(Icons.category, size: 14, color: Colors.grey[600]),
                    const SizedBox(width: 4),
                    Text(expense.categorie!, style: TextStyle(fontSize: 14, color: Colors.grey[600])),
                  ],
                ],
              ),
              if (expense.urlsJustificatifs.isNotEmpty) ...[
                const SizedBox(height: 12),
                SizedBox(
                  height: 80,
                  child: ListView.builder(
                    scrollDirection: Axis.horizontal,
                    itemCount: expense.urlsJustificatifs.length,
                    itemBuilder: (context, index) {
                      final url = expense.urlsJustificatifs[index];
                      final isPdf = DocumentUtils.isPdf(url);

                      return Container(
                        margin: const EdgeInsets.only(right: 8),
                        width: 80,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.grey[300]!),
                          color: isPdf ? Colors.grey[100] : null,
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: isPdf
                              ? Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.picture_as_pdf, size: 32, color: Colors.red[400]),
                                    const SizedBox(height: 4),
                                    Text('PDF', style: TextStyle(fontSize: 10, color: Colors.grey[600], fontWeight: FontWeight.bold)),
                                  ],
                                )
                              : Image.network(
                                  url,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => Center(child: Icon(Icons.error, color: Colors.grey[400])),
                                  loadingBuilder: (_, child, progress) {
                                    if (progress == null) return child;
                                    return Center(child: CircularProgressIndicator(value: progress.expectedTotalBytes != null ? progress.cumulativeBytesLoaded / progress.expectedTotalBytes! : null));
                                  },
                                ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _handleDelete(ExpenseClaim expense) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Confirmer la suppression'),
        content: Text('Supprimer la demande de ${CurrencyFormatter.format(expense.montant)} ?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Annuler')),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Supprimer', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      try {
        await context.read<ExpenseProvider>().deleteExpense(clubId: _clubId, expenseId: expense.id, userId: expense.demandeurId);
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('✅ Demande supprimée'), backgroundColor: Colors.green));
      } catch (e) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('❌ Erreur: $e'), backgroundColor: Colors.red));
      }
    }
  }
}

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/firebase_config.dart';
import '../../config/app_assets.dart';
import '../../providers/auth_provider.dart';
import '../../providers/expense_provider.dart';
import '../../providers/member_provider.dart';
import '../../models/expense_claim.dart';
import '../../utils/date_formatter.dart';
import '../../utils/currency_formatter.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/empty_state_widget.dart';
import 'expense_detail_screen.dart';

/// Écran liste des demandes à approuver
class ApprovalListScreen extends StatefulWidget {
  const ApprovalListScreen({Key? key}) : super(key: key);

  @override
  State<ApprovalListScreen> createState() => _ApprovalListScreenState();
}

class _ApprovalListScreenState extends State<ApprovalListScreen> {
  final String _clubId = FirebaseConfig.defaultClubId;
  String? _currentUserId;

  @override
  void initState() {
    super.initState();
    _loadExpenses();
  }

  void _loadExpenses() {
    final authProvider = context.read<AuthProvider>();
    _currentUserId = authProvider.currentUser?.uid ?? '';
    context.read<ExpenseProvider>().listenToPendingApprovals(_clubId, _currentUserId!);
  }

  @override
  Widget build(BuildContext context) {
    final expenseProvider = context.watch<ExpenseProvider>();
    final expenses = expenseProvider.expenses;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text('Approbations', style: TextStyle(color: Colors.white)),
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
    );
  }

  Widget _buildBody(ExpenseProvider expenseProvider, List<ExpenseClaim> expenses) {
    final memberProvider = context.watch<MemberProvider>();

    // Check if user has permission to approve expenses
    if (!memberProvider.canApproveExpenses) {
      return const EmptyStateWidget(
        icon: Icons.lock_outline,
        title: 'Accès non autorisé',
        subtitle: 'Vous n\'avez pas les droits pour approuver les demandes',
      );
    }

    if (expenseProvider.isLoading && expenses.isEmpty) {
      return const LoadingWidget(message: 'Chargement des demandes...');
    }

    if (expenses.isEmpty) {
      return const EmptyStateWidget(
        icon: Icons.check_circle_outline,
        title: 'Aucune demande en attente',
        subtitle: 'Toutes les demandes ont été traitées',
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: expenses.length,
      itemBuilder: (context, index) => _buildExpenseCard(expenses[index], expenses[index].demandeurId == _currentUserId),
    );
  }

  Widget _buildExpenseCard(ExpenseClaim expense, bool isOwnExpense) {
    // Own expenses are shown in grey and are not tappable (can't approve own expenses)
    final cardColor = isOwnExpense ? Colors.grey[300] : Colors.white;
    final textColor = isOwnExpense ? Colors.grey[600] : Colors.black;
    final secondaryTextColor = isOwnExpense ? Colors.grey[500] : Colors.grey[600];

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      color: cardColor,
      child: InkWell(
        onTap: isOwnExpense ? null : () => Navigator.push(context, MaterialPageRoute(builder: (_) => ExpenseDetailScreen(expense: expense))),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Own expense indicator
              if (isOwnExpense) ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  margin: const EdgeInsets.only(bottom: 8),
                  decoration: BoxDecoration(
                    color: Colors.grey[400],
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'Ma demande - non modifiable',
                    style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w500),
                  ),
                ),
              ],
              // HEADER
              Row(
                children: [
                  Text(CurrencyFormatter.format(expense.montant), style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: textColor)),
                  if (expense.urlsJustificatifs.isNotEmpty) Container(
                    margin: const EdgeInsets.only(left: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(color: isOwnExpense ? Colors.grey[400] : Colors.grey[300], borderRadius: BorderRadius.circular(10)),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.attach_file, size: 12, color: secondaryTextColor),
                        const SizedBox(width: 2),
                        Text('${expense.urlsJustificatifs.length}', style: TextStyle(fontSize: 11, color: secondaryTextColor)),
                      ],
                    ),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: isOwnExpense ? Colors.grey[400]!.withOpacity(0.3) : const Color(0xFF4CAF50).withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: isOwnExpense ? Colors.grey[500]! : const Color(0xFF4CAF50), width: 1),
                    ),
                    child: Text(expense.demandeurNom ?? '', style: TextStyle(color: isOwnExpense ? Colors.grey[600] : const Color(0xFF4CAF50), fontSize: 12, fontWeight: FontWeight.bold)),
                  ),
                  if (!isOwnExpense) IconButton(
                    icon: const Icon(Icons.visibility, size: 20),
                    onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ExpenseDetailScreen(expense: expense))),
                    tooltip: 'Voir détails',
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(expense.description, style: TextStyle(fontSize: 16, color: textColor), maxLines: 2, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(Icons.calendar_today, size: 14, color: secondaryTextColor),
                  const SizedBox(width: 4),
                  Text(DateFormatter.formatShort(expense.dateDepense), style: TextStyle(fontSize: 14, color: secondaryTextColor)),
                  const SizedBox(width: 16),
                  if (expense.categorie != null) ...[
                    Icon(Icons.category, size: 14, color: secondaryTextColor),
                    const SizedBox(width: 4),
                    Text(expense.categorie!, style: TextStyle(fontSize: 14, color: secondaryTextColor)),
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
                    itemBuilder: (context, index) => Container(
                      margin: const EdgeInsets.only(right: 8),
                      width: 80,
                      decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.grey[300]!)),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: ColorFiltered(
                          colorFilter: isOwnExpense
                              ? const ColorFilter.mode(Colors.grey, BlendMode.saturation)
                              : const ColorFilter.mode(Colors.transparent, BlendMode.multiply),
                          child: Image.network(
                            expense.urlsJustificatifs[index],
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => Center(child: Icon(Icons.error, color: Colors.grey[400])),
                            loadingBuilder: (_, child, progress) {
                              if (progress == null) return child;
                              return Center(child: CircularProgressIndicator(value: progress.expectedTotalBytes != null ? progress.cumulativeBytesLoaded / progress.expectedTotalBytes! : null));
                            },
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

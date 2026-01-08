import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_assets.dart';
import '../../models/expense_claim.dart';
import '../../providers/expense_provider.dart';
import '../../providers/auth_provider.dart';
import '../../utils/currency_formatter.dart';
import '../../utils/date_formatter.dart';
import '../../widgets/expense_photo_gallery.dart';
import 'edit_expense_screen.dart';

class ExpenseDetailScreen extends StatelessWidget {
  final ExpenseClaim expense;

  const ExpenseDetailScreen({
    super.key,
    required this.expense,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final expenseProvider = Provider.of<ExpenseProvider>(context, listen: false);
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final currentUserId = authProvider.currentUser?.uid;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text('Détail Demande', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          // Modifier/Supprimer alleen als status = 'soumis'
          if (expense.statut == 'soumis') ...[
            IconButton(
              icon: const Icon(Icons.edit),
              tooltip: 'Modifier',
              onPressed: () {
                Navigator.push(context, MaterialPageRoute(builder: (_) => EditExpenseScreen(expense: expense)));
              },
            ),
            IconButton(
              icon: const Icon(Icons.delete, color: Colors.red),
              tooltip: 'Supprimer',
              onPressed: () async {
                final confirmed = await _showDeleteConfirmation(context);
                if (confirmed && context.mounted) {
                  try {
                    // Get clubId and userId from expense (assuming they're available)
                    // Note: You may need to pass these from the parent widget if not in expense model
                    await expenseProvider.deleteExpense(
                      clubId: expense.clubId ?? 'calypso', // Fallback to default club
                      expenseId: expense.id,
                      userId: expense.demandeurId,
                    );
                    if (context.mounted) {
                      Navigator.pop(context);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('✅ Demande supprimée'),
                          backgroundColor: Colors.green,
                        ),
                      );
                    }
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('❌ Erreur: $e'),
                          backgroundColor: Colors.red,
                        ),
                      );
                    }
                  }
                }
              },
            ),
          ],
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
            bottom: false,
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
            // Status Badge
            Center(
              child: _buildStatusBadge(expense.statut),
            ),
            const SizedBox(height: 24),

            // Informations Card (met Montant)
            Card(
              elevation: 2,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Montant prominent bovenaan
                    Row(
                      children: [
                        Icon(Icons.euro, size: 28, color: theme.primaryColor),
                        const SizedBox(width: 12),
                        Text(
                          CurrencyFormatter.format(expense.montant),
                          style: theme.textTheme.headlineMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: theme.primaryColor,
                          ),
                        ),
                      ],
                    ),
                    const Divider(height: 24),
                    _buildInfoRow(
                      icon: Icons.description,
                      label: 'Description',
                      value: expense.description,
                    ),
                    const SizedBox(height: 12),
                    _buildInfoRow(
                      icon: Icons.calendar_today,
                      label: 'Date de dépense',
                      value: DateFormatter.formatLong(expense.dateDepense),
                    ),
                    const SizedBox(height: 12),
                    _buildInfoRow(
                      icon: Icons.category,
                      label: 'Catégorie',
                      value: expense.categorie ?? 'Non spécifié',
                    ),
                    if (expense.operationId != null) ...[
                      const SizedBox(height: 12),
                      _buildInfoRow(
                        icon: Icons.event,
                        label: 'Opération liée',
                        value: expense.operationId!,
                      ),
                    ],
                    const SizedBox(height: 12),
                    _buildInfoRow(
                      icon: Icons.access_time,
                      label: 'Date de demande',
                      value: DateFormatter.formatLong(expense.dateDemande),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Demandeur Card
            Card(
              elevation: 2,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Demandeur',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const Divider(height: 24),
                    _buildInfoRow(
                      icon: Icons.person,
                      label: 'Nom',
                      value: expense.demandeurNom ?? 'Inconnu',
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Historique Card - show for any status that indicates processing happened
            if (expense.dateApprobation != null ||
                expense.dateRefus != null ||
                expense.requiresDoubleApproval ||
                expense.statut == 'approuve' ||
                expense.statut == 'rembourse' ||
                expense.statut == 'refuse') ...[
              Card(
                elevation: 2,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Historique',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const Divider(height: 24),
                      _buildHistoriqueTimeline(expense),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Photos Gallery
            if (expense.urlsJustificatifs.isNotEmpty) ...[
              Card(
                elevation: 2,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.photo_library, size: 20),
                          const SizedBox(width: 8),
                          Text(
                            'Justificatifs (${expense.urlsJustificatifs.length})',
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      ExpensePhotoGallery(
                        photoUrls: expense.urlsJustificatifs,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Boutons Approuver/Refuser (pour validateurs)
            // RÈGLE: On ne peut PAS approuver ses propres demandes
            if ((expense.statut == 'soumis' || expense.statut == 'en_attente_validation') &&
                currentUserId != null &&
                currentUserId != expense.demandeurId) ...[
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _handleReject(context, expenseProvider),
                      icon: const Icon(Icons.close, color: Colors.white),
                      label: const Text('Refuser', style: TextStyle(color: Colors.white, fontSize: 16)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _handleApprove(context, expenseProvider),
                      icon: const Icon(Icons.check, color: Colors.white),
                      label: const Text('Approuver', style: TextStyle(color: Colors.white, fontSize: 16)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF4CAF50),
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  ),
                ],
              ),
            ],

            // Footer info
            if (expense.statut == 'soumis')
              Padding(
                padding: const EdgeInsets.all(8),
                child: Text(
                  'Vous pouvez modifier ou supprimer cette demande tant qu\'elle n\'est pas validée.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: Colors.grey[600],
                    fontStyle: FontStyle.italic,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusBadge(String statut) {
    Color backgroundColor;
    Color textColor;
    String label;

    switch (statut) {
      case 'soumis':
        backgroundColor = Colors.blue[100]!;
        textColor = Colors.blue[900]!;
        label = 'SOUMIS';
        break;
      case 'en_attente_validation':
        backgroundColor = Colors.orange[100]!;
        textColor = Colors.orange[900]!;
        label = 'EN ATTENTE';
        break;
      case 'approuve':
        backgroundColor = Colors.green[100]!;
        textColor = Colors.green[900]!;
        label = 'APPROUVÉ';
        break;
      case 'rembourse':
        backgroundColor = Colors.teal[100]!;
        textColor = Colors.teal[900]!;
        label = 'REMBOURSÉ';
        break;
      case 'refuse':
        backgroundColor = Colors.red[100]!;
        textColor = Colors.red[900]!;
        label = 'REFUSÉ';
        break;
      default:
        backgroundColor = Colors.grey[100]!;
        textColor = Colors.grey[900]!;
        label = statut.toUpperCase();
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: textColor,
          fontWeight: FontWeight.bold,
          fontSize: 16,
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  Widget _buildInfoRow({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: Colors.grey[600]),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey[600],
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<bool> _showDeleteConfirmation(BuildContext context) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirmer la suppression'),
        content: const Text(
          'Êtes-vous sûr de vouloir supprimer cette demande de remboursement ? '
          'Cette action est irréversible.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('Supprimer'),
          ),
        ],
      ),
    );
    return result ?? false;
  }

  Future<void> _handleApprove(BuildContext context, ExpenseProvider expenseProvider) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Approuver la demande'),
        content: Text('Approuver la demande de ${CurrencyFormatter.format(expense.montant)} de ${expense.demandeurNom} ?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF4CAF50),
              foregroundColor: Colors.white,
            ),
            child: const Text('Approuver'),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      try {
        final authProvider = Provider.of<AuthProvider>(context, listen: false);
        final approverId = authProvider.currentUser?.uid ?? '';
        final approverName = authProvider.displayName ?? authProvider.currentUser?.email ?? 'Inconnu';

        await expenseProvider.approveExpense(
          clubId: expense.clubId ?? 'calypso',
          expenseId: expense.id,
          approverId: approverId,
          approverName: approverName,
        );
        if (context.mounted) {
          Navigator.pop(context);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('✅ Demande approuvée'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('❌ Erreur: $e'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
  }

  Future<void> _handleReject(BuildContext context, ExpenseProvider expenseProvider) async {
    String? reason;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Refuser la demande'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Refuser la demande de ${CurrencyFormatter.format(expense.montant)} de ${expense.demandeurNom} ?'),
            const SizedBox(height: 16),
            TextField(
              decoration: const InputDecoration(
                labelText: 'Raison (optionnel)',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
              onChanged: (value) => reason = value,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('Refuser'),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      try {
        await expenseProvider.rejectExpense(
          clubId: expense.clubId ?? 'calypso',
          expenseId: expense.id,
          reason: reason,
        );
        if (context.mounted) {
          Navigator.pop(context);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('✅ Demande refusée'),
              backgroundColor: Colors.orange,
            ),
          );
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('❌ Erreur: $e'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
  }

  /// Build historique timeline
  Widget _buildHistoriqueTimeline(ExpenseClaim expense) {
    return Column(
      children: [
        // Soumission
        _buildTimelineItem(
          icon: Icons.send,
          color: Colors.blue,
          title: 'Demande soumise',
          subtitle: DateFormatter.formatLong(expense.dateDemande),
          isFirst: true,
        ),

        // 1ère approbation
        if (expense.dateApprobation != null)
          _buildTimelineItem(
            icon: Icons.check_circle,
            color: Colors.green,
            title: expense.appouveParNom != null
                ? 'Approuvé par ${expense.appouveParNom}'
                : 'Approuvé',
            subtitle: DateFormatter.formatLong(expense.dateApprobation!),
          )
        // Fallback: status is approved but no approval date (legacy data)
        else if (expense.statut == 'approuve' || expense.statut == 'rembourse')
          _buildTimelineItem(
            icon: Icons.check_circle,
            color: Colors.green,
            title: expense.appouveParNom != null
                ? 'Approuvé par ${expense.appouveParNom}'
                : 'Approuvé (détails non disponibles)',
            subtitle: 'Date d\'approbation non enregistrée',
          ),

        // 2ème approbation (si double approval requis)
        if (expense.requiresDoubleApproval) ...[
          if (expense.dateApprobation2 != null)
            _buildTimelineItem(
              icon: Icons.check_circle,
              color: Colors.green,
              title: expense.approuvePar2Nom != null
                  ? '2ème approbation par ${expense.approuvePar2Nom}'
                  : '2ème approbation',
              subtitle: DateFormatter.formatLong(expense.dateApprobation2!),
            )
          else if (expense.dateApprobation != null)
            _buildTimelineItem(
              icon: Icons.pending,
              color: Colors.orange,
              title: '2ème approbation en attente',
              subtitle: 'Montant > seuil double validation',
            ),
        ],

        // Refus
        if (expense.dateRefus != null)
          _buildTimelineItem(
            icon: Icons.cancel,
            color: Colors.red,
            title: expense.refuseParNom != null
                ? 'Refusé par ${expense.refuseParNom}'
                : 'Refusé',
            subtitle: DateFormatter.formatLong(expense.dateRefus!),
            detail: expense.motifRefus,
            isLast: true,
          )
        // Fallback: status is refused but no refusal date (legacy data)
        else if (expense.statut == 'refuse')
          _buildTimelineItem(
            icon: Icons.cancel,
            color: Colors.red,
            title: expense.refuseParNom != null
                ? 'Refusé par ${expense.refuseParNom}'
                : 'Refusé (détails non disponibles)',
            subtitle: 'Date de refus non enregistrée',
            detail: expense.motifRefus,
            isLast: true,
          ),
      ],
    );
  }

  /// Build timeline item
  Widget _buildTimelineItem({
    required IconData icon,
    required Color color,
    required String title,
    required String subtitle,
    String? detail,
    bool isFirst = false,
    bool isLast = false,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Timeline indicator
        Column(
          children: [
            if (!isFirst)
              Container(
                width: 2,
                height: 12,
                color: Colors.grey[300],
              ),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                shape: BoxShape.circle,
                border: Border.all(color: color, width: 2),
              ),
              child: Icon(icon, size: 20, color: color),
            ),
            if (!isLast)
              Container(
                width: 2,
                height: detail != null ? 60 : 32,
                color: Colors.grey[300],
              ),
          ],
        ),
        const SizedBox(width: 16),

        // Content
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey[600],
                  ),
                ),
                if (detail != null) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red[50],
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.red[200]!),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.info_outline, size: 16, color: Colors.red[700]),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            detail,
                            style: TextStyle(
                              fontSize: 14,
                              color: Colors.red[900],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

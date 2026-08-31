import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/material_loan.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/material_loan_service.dart';
import '../../services/material_return_service.dart';
import '../../utils/club_role_utils.dart';
import '../../widgets/empty_state_widget.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/material_payment_qr_dialog.dart';
import '../../widgets/material_handover_dialog.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class MaterialReturnsScreen extends StatefulWidget {
  const MaterialReturnsScreen({super.key});

  @override
  State<MaterialReturnsScreen> createState() => _MaterialReturnsScreenState();
}

enum _MaterialLoanTab { pending, returns, all }

class _MaterialReturnsScreenState extends State<MaterialReturnsScreen> {
  final _service = MaterialReturnService();
  final _loanService = MaterialLoanService();
  final _clubId = FirebaseConfig.defaultClubId;
  String _search = '';
  _MaterialLoanTab? _activeTab = _MaterialLoanTab.pending;

  @override
  Widget build(BuildContext context) {
    final memberProvider = context.watch<MemberProvider>();
    final authProvider = context.watch<AuthProvider>();
    final canValidate = _canValidateReturns(memberProvider);
    final userId = authProvider.currentUser?.uid;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'Prets materiel',
          style: TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.fishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              if (canValidate)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
                  child: _NewLoanCard(
                    onTap: userId == null
                        ? null
                        : () => _openLoanSheet(
                              createdByUserId: userId,
                              createdByName: memberProvider.displayName,
                            ),
                  ),
                ),
              if (canValidate)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                  child: TextField(
                    onChanged: (value) => setState(() => _search = value),
                    style: const TextStyle(color: AppColors.donkerblauw),
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: Colors.white,
                      hintText: 'Rechercher un membre, un code PRET...',
                      prefixIcon: const Icon(Icons.search),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                ),
              Expanded(
                child: canValidate
                    ? _buildReturnValidationList(
                        createdByUserId: userId,
                        createdByName: memberProvider.displayName,
                      )
                    : _buildMemberLoans(userId),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildReturnValidationList({
    required String? createdByUserId,
    required String createdByName,
  }) {
    return StreamBuilder<List<MaterialLoan>>(
      stream: _loanService.watchPendingPaymentLoans(_clubId),
      builder: (context, pendingSnapshot) {
        return StreamBuilder<List<MaterialLoan>>(
          stream: _service.watchReturnableLoans(_clubId),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const LoadingWidget(
                message: 'Chargement des prets en cours...',
              );
            }

            if (snapshot.hasError) {
              return EmptyStateWidget(
                icon: Icons.error_outline,
                title: 'Impossible de charger les retours',
                subtitle: snapshot.error.toString(),
              );
            }

            final pendingLoans = _filterLoans(pendingSnapshot.data ?? const []);
            final loans = _filterLoans(snapshot.data ?? const []);
            if (pendingLoans.isEmpty && loans.isEmpty) {
              return const EmptyStateWidget(
                icon: Icons.inventory_2_outlined,
                title: 'Aucun retour en attente',
                subtitle:
                    'Utilisez le bouton ci-dessus pour encoder une demande de pret.',
              );
            }

            final activeTab = _activeTab ?? _MaterialLoanTab.pending;
            final visiblePending = activeTab != _MaterialLoanTab.returns;
            final visibleReturns = activeTab != _MaterialLoanTab.pending;

            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
              children: [
                _MaterialLoanTabs(
                  activeTab: activeTab,
                  pendingCount: pendingLoans.length,
                  returnCount: loans.length,
                  onChanged: (tab) => setState(() => _activeTab = tab),
                ),
                const SizedBox(height: 12),
                if (visiblePending && pendingLoans.isNotEmpty) ...[
                  const _ListSectionTitle('Cautions à confirmer'),
                  const Text(
                    'Les nouvelles demandes ne réservent aucun article. Attribution lors de la remise après paiement.',
                    style: TextStyle(color: Colors.white),
                  ),
                  const SizedBox(height: 10),
                  ...pendingLoans.map(
                    (loan) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _PendingLoanCard(
                        loan: loan,
                        onShowQr: loan.paymentMode == 'epc_qr_onsite'
                            ? () => _showPendingLoanQr(loan)
                            : null,
                        onSendEmail: loan.paymentMode == 'epc_qr_email'
                            ? () => _sendPendingLoanPaymentEmail(loan)
                            : null,
                        onConfirm: createdByUserId == null
                            ? null
                            : () => _confirmPendingLoan(
                                  loan,
                                  createdByUserId: createdByUserId,
                                  createdByName: createdByName,
                                ),
                      ),
                    ),
                  ),
                ],
                if (visiblePending &&
                    pendingLoans.isEmpty &&
                    activeTab == _MaterialLoanTab.pending)
                  const _LoanTabEmptyState(
                    icon: Icons.lock_open_outlined,
                    title: 'Aucune caution à confirmer',
                    subtitle:
                        'Les demandes en attente de caution apparaîtront ici.',
                  ),
                if (visibleReturns && loans.isNotEmpty) ...[
                  const _ListSectionTitle('Retours à contrôler'),
                  ...loans.map(
                    (loan) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _LoanReturnCard(
                        loan: loan,
                        onValidate: () => _openReturnSheet(loan),
                      ),
                    ),
                  ),
                ],
                if (visibleReturns &&
                    loans.isEmpty &&
                    activeTab == _MaterialLoanTab.returns)
                  const _LoanTabEmptyState(
                    icon: Icons.assignment_turned_in_outlined,
                    title: 'Aucun retour à contrôler',
                    subtitle: 'Les prêts remis au membre apparaîtront ici.',
                  ),
              ],
            );
          },
        );
      },
    );
  }

  Future<void> _confirmPendingLoan(
    MaterialLoan loan, {
    required String createdByUserId,
    required String createdByName,
  }) async {
    List<String> selectedItemIds = const [];
    if (loan.requestedLines.isNotEmpty) {
      final selection = await showDialog<List<String>>(
          context: context,
          builder: (_) => MaterialHandoverDialog(
              lines: loan.requestedLines,
              availableItems: _service.watchBorrowableItems(_clubId),
              cautionAmount: loan.cautionAmount));
      if (selection == null) return;
      selectedItemIds = selection;
    }
    if (!mounted) return;
    final confirmed = loan.requestedLines.isNotEmpty ||
        (await showDialog<bool>(
              context: context,
              builder: (dialogContext) => AlertDialog(
                title: const Text('Confirmer la caution ?'),
                content: Text(
                  'Confirmez seulement après avoir constaté les ${loan.cautionAmount.toStringAsFixed(2)} EUR. Le matériel sera alors remis à ${loan.memberName}.',
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.of(dialogContext).pop(false),
                    child: const Text('Annuler'),
                  ),
                  FilledButton(
                    onPressed: () => Navigator.of(dialogContext).pop(true),
                    child: const Text('Paiement constaté'),
                  ),
                ],
              ),
            ) ??
            false);
    if (confirmed != true) return;
    try {
      await _loanService.confirmPendingPaymentAndHandover(
        clubId: _clubId,
        loanId: loan.id,
        confirmedByUserId: createdByUserId,
        confirmedByName: createdByName,
        selectedItemIds: selectedItemIds,
        paymentConfirmed: true,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Caution confirmée. Matériel remis.'),
          backgroundColor: AppColors.success,
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Impossible de confirmer la caution : $error'),
          backgroundColor: AppColors.error,
        ),
      );
    }
  }

  Future<void> _showPendingLoanQr(MaterialLoan loan) async {
    try {
      final qr = await _loanService.getPendingLoanPaymentQr(
        clubId: _clubId,
        loanId: loan.id,
      );
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        useRootNavigator: true,
        builder: (dialogContext) => MaterialPaymentQrDialog(
          payload: qr.epcPayload,
          reference: qr.reference,
          amount: qr.amount,
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Impossible d’afficher le QR : $error'),
          backgroundColor: AppColors.error,
        ),
      );
    }
  }

  Future<void> _sendPendingLoanPaymentEmail(MaterialLoan loan) async {
    try {
      await _loanService.sendPendingLoanPaymentQrEmail(
        clubId: _clubId,
        loanId: loan.id,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('QR envoyé à l’adresse e-mail enregistrée du membre.'),
          backgroundColor: AppColors.success,
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Impossible d’envoyer le QR : $error'),
          backgroundColor: AppColors.error,
        ),
      );
    }
  }

  Widget _buildMemberLoans(String? userId) {
    if (userId == null) {
      return const EmptyStateWidget(
        icon: Icons.login_outlined,
        title: 'Connexion requise',
        subtitle: 'Connectez-vous pour consulter votre matériel emprunté.',
      );
    }

    return StreamBuilder<List<MaterialLoan>>(
      stream: _loanService.watchMyActiveLoans(
        clubId: _clubId,
        memberId: userId,
      ),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const LoadingWidget(
            message: 'Chargement de votre matériel...',
          );
        }

        if (snapshot.hasError) {
          return EmptyStateWidget(
            icon: Icons.error_outline,
            title: 'Impossible de charger vos prêts',
            subtitle: snapshot.error.toString(),
          );
        }

        final loans = snapshot.data ?? const [];
        if (loans.isEmpty) {
          return const EmptyStateWidget(
            icon: Icons.inventory_2_outlined,
            title: 'Aucun matériel emprunté',
            subtitle:
                'Lorsqu’un encadrant vous remet du matériel, il apparaîtra ici.',
          );
        }

        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          itemCount: loans.length,
          separatorBuilder: (_, __) => const SizedBox(height: 12),
          itemBuilder: (context, index) => _MemberLoanCard(loan: loans[index]),
        );
      },
    );
  }

  bool _canValidateReturns(MemberProvider memberProvider) {
    final role = memberProvider.appRole?.toLowerCase();
    if (role == 'admin' || role == 'superadmin') {
      return true;
    }

    final normalized = ClubRoleUtils.normalizeRoles(
      memberProvider.clubStatuten,
    );
    return normalized.contains('gonflage') ||
        normalized.contains('ca') ||
        normalized.contains('encadrant');
  }

  List<MaterialLoan> _filterLoans(List<MaterialLoan> loans) {
    final term = _search.trim().toLowerCase();
    if (term.isEmpty) return loans;

    return loans.where((loan) {
      final haystack = [
        loan.loanNumber,
        loan.memberName,
        ...loan.items.map((item) => '${item.code} ${item.name}'),
      ].join(' ').toLowerCase();
      return haystack.contains(term);
    }).toList();
  }

  Future<void> _openReturnSheet(MaterialLoan loan) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (context) => _ReturnValidationSheet(
        loan: loan,
        clubId: _clubId,
        service: _service,
        onSubmit: _validateReturn,
      ),
    );
  }

  Future<void> _openLoanSheet({
    required String createdByUserId,
    required String createdByName,
  }) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      clipBehavior: Clip.antiAlias,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (context) => OceanGradientBackground(
        creatures: CreatureSet.fishAndBubbles,
        child: _DirectLoanSheet(
          service: _service,
          loanService: _loanService,
          clubId: _clubId,
          createdByUserId: createdByUserId,
          createdByName: createdByName,
        ),
      ),
    );
  }

  Future<void> _validateReturn(
    MaterialLoan loan,
    MaterialReturnDecision decision,
    double refundAmount,
    String notes,
    List<MaterialReturnItemCheck> itemChecks,
  ) async {
    final authProvider = context.read<AuthProvider>();
    final memberProvider = context.read<MemberProvider>();
    final userId = authProvider.currentUser?.uid;
    if (userId == null) return;

    final messenger = ScaffoldMessenger.of(context);
    try {
      await _service.validateReturn(
        clubId: _clubId,
        loan: loan,
        decision: decision,
        refundAmount: refundAmount,
        validatedByUserId: userId,
        validatedByName: memberProvider.displayName,
        notes: notes,
        itemChecks: itemChecks,
      );

      if (!mounted) return;
      Navigator.of(context).pop();
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            refundAmount > 0
                ? 'Retour valide. Remboursement transmis au trésorier.'
                : 'Retour valide. Aucune demande de remboursement nécessaire.',
          ),
          backgroundColor: AppColors.success,
        ),
      );
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text('Erreur validation retour: $e'),
          backgroundColor: AppColors.error,
        ),
      );
    }
  }
}

class _ListSectionTitle extends StatelessWidget {
  final String text;

  const _ListSectionTitle(this.text);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 6, bottom: 6),
        child: Text(
          text,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 17,
            fontWeight: FontWeight.w800,
          ),
        ),
      );
}

class _MaterialLoanTabs extends StatelessWidget {
  final _MaterialLoanTab activeTab;
  final int pendingCount;
  final int returnCount;
  final ValueChanged<_MaterialLoanTab> onChanged;

  const _MaterialLoanTabs({
    required this.activeTab,
    required this.pendingCount,
    required this.returnCount,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final totalCount = pendingCount + returnCount;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.28)),
      ),
      child: Row(
        children: [
          _MaterialLoanTabButton(
            label: 'À confirmer',
            count: pendingCount,
            selected: activeTab == _MaterialLoanTab.pending,
            onTap: () => onChanged(_MaterialLoanTab.pending),
          ),
          _MaterialLoanTabButton(
            label: 'Retours',
            count: returnCount,
            selected: activeTab == _MaterialLoanTab.returns,
            onTap: () => onChanged(_MaterialLoanTab.returns),
          ),
          _MaterialLoanTabButton(
            label: 'Tous',
            count: totalCount,
            selected: activeTab == _MaterialLoanTab.all,
            onTap: () => onChanged(_MaterialLoanTab.all),
          ),
        ],
      ),
    );
  }
}

class _MaterialLoanTabButton extends StatelessWidget {
  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  const _MaterialLoanTabButton({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final foreground = selected ? AppColors.donkerblauw : Colors.white;
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 6),
          decoration: BoxDecoration(
            color: selected ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: foreground,
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Container(
                constraints: const BoxConstraints(minWidth: 22),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: selected
                      ? AppColors.middenblauw.withValues(alpha: 0.12)
                      : Colors.white.withValues(alpha: 0.20),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  '$count',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: foreground,
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
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

class _LoanTabEmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;

  const _LoanTabEmptyState({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          _LoanActionIcon(icon: icon),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: const TextStyle(color: Colors.black54),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PendingLoanCard extends StatelessWidget {
  final MaterialLoan loan;
  final VoidCallback? onShowQr;
  final VoidCallback? onSendEmail;
  final VoidCallback? onConfirm;

  const _PendingLoanCard({
    required this.loan,
    this.onShowQr,
    this.onSendEmail,
    this.onConfirm,
  });

  @override
  Widget build(BuildContext context) {
    final emailSent = loan.cautionStatus == 'email_sent';
    return Material(
      color: Colors.amber.shade50,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const _LoanActionIcon(icon: Icons.lock_clock_outlined),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        loan.memberName,
                        style: const TextStyle(
                          color: AppColors.donkerblauw,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      Text(loan.loanNumber),
                    ],
                  ),
                ),
                _StatusPill(
                  label: emailSent ? 'QR e-mail envoyé' : 'QR à montrer',
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              '${loan.requestedLines.isNotEmpty ? loan.requestedLines.length : loan.itemIds.length} article(s) · ${loan.requestedLines.isNotEmpty ? "sans réservation" : "réservation ancienne"} · caution ${loan.cautionAmount.toStringAsFixed(2)} EUR',
              style: const TextStyle(color: Colors.black87),
            ),
            const SizedBox(height: 10),
            for (final line in loan.requestedLines)
              Text(line.label, style: const TextStyle(color: Colors.black87)),
            if (loan.paymentMode == 'epc_qr_onsite') ...[
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: onShowQr,
                  icon: const Icon(Icons.qr_code_2_outlined),
                  label: const Text('Afficher le QR sur place'),
                ),
              ),
              const SizedBox(height: 8),
            ] else ...[
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: onSendEmail,
                  icon: const Icon(Icons.email_outlined),
                  label: Text(
                    emailSent
                        ? 'Renvoyer le QR au membre'
                        : 'Envoyer le QR au membre',
                  ),
                ),
              ),
              const SizedBox(height: 8),
            ],
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: onConfirm,
                icon: const Icon(Icons.verified_outlined),
                label: const Text('Paiement constaté : remettre le matériel'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LoanReturnCard extends StatelessWidget {
  final MaterialLoan loan;
  final VoidCallback onValidate;

  const _LoanReturnCard({required this.loan, required this.onValidate});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onValidate,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: AppColors.middenblauw.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.assignment_return_outlined,
                      color: AppColors.middenblauw,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          loan.memberName,
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            color: AppColors.donkerblauw,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          loan.loanNumber,
                          style: TextStyle(
                            color: Colors.grey.shade700,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  _StatusPill(label: _cautionLabel(loan.cautionStatus)),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _InfoChip(
                    icon: Icons.euro,
                    label: '${loan.cautionAmount.toStringAsFixed(2)} EUR',
                  ),
                  if (loan.expectedReturnDate != null)
                    _InfoChip(
                      icon: Icons.event_available,
                      label: _formatDate(loan.expectedReturnDate!),
                    ),
                  _InfoChip(
                    icon: Icons.inventory_2_outlined,
                    label: '${loan.itemIds.length} article(s)',
                  ),
                ],
              ),
              if (loan.items.isNotEmpty) ...[
                const SizedBox(height: 12),
                ...loan.items.take(3).map(
                      (item) => Padding(
                        padding: const EdgeInsets.only(bottom: 5),
                        child: Text(
                          '${item.inventoryLabel} · ${item.name}',
                          style: TextStyle(
                            color: Colors.grey.shade800,
                            fontSize: 13.5,
                          ),
                        ),
                      ),
                    ),
                if (loan.items.length > 3)
                  Text(
                    '+ ${loan.items.length - 3} autre(s)',
                    style: TextStyle(color: Colors.grey.shade600),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  static String _cautionLabel(String status) {
    switch (status) {
      case 'paid':
        return 'Caution payee';
      case 'email_sent':
        return 'E-mail envoye';
      case 'waived':
        return 'Sans caution';
      default:
        return 'A verifier';
    }
  }
}

class _NewLoanCard extends StatelessWidget {
  final VoidCallback? onTap;

  const _NewLoanCard({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: const Padding(
          padding: EdgeInsets.all(14),
          child: Row(
            children: [
              _LoanActionIcon(icon: Icons.add_box_outlined),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Nouveau prêt',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: AppColors.donkerblauw,
                      ),
                    ),
                    SizedBox(height: 3),
                    Text(
                      'Choisir le membre, le matériel et confirmer la caution.',
                      style: TextStyle(color: Colors.black54, fontSize: 13.5),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: AppColors.middenblauw),
            ],
          ),
        ),
      ),
    );
  }
}

class _LoanActionIcon extends StatelessWidget {
  final IconData icon;

  const _LoanActionIcon({required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 46,
      height: 46,
      decoration: BoxDecoration(
        color: AppColors.middenblauw.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(icon, color: AppColors.middenblauw),
    );
  }
}

class _MemberLoanCard extends StatelessWidget {
  final MaterialLoan loan;

  const _MemberLoanCard({required this.loan});

  @override
  Widget build(BuildContext context) {
    final dueDate = loan.expectedReturnDate;
    final today = DateTime.now();
    final isLate = dueDate != null &&
        DateTime(
          dueDate.year,
          dueDate.month,
          dueDate.day,
        ).isBefore(DateTime(today.year, today.month, today.day));
    return Material(
      color: isLate ? Colors.deepOrange.shade50 : Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const _LoanActionIcon(icon: Icons.inventory_2_outlined),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        loan.loanNumber,
                        style: const TextStyle(
                          color: AppColors.donkerblauw,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        isLate
                            ? 'Retour en retard'
                            : dueDate == null
                                ? 'Retour à convenir'
                                : 'Retour prévu le ${_formatDate(dueDate)}',
                        style: TextStyle(
                          color: isLate ? Colors.deepOrange : Colors.black54,
                          fontWeight:
                              isLate ? FontWeight.w800 : FontWeight.normal,
                        ),
                      ),
                    ],
                  ),
                ),
                _StatusPill(label: isLate ? 'En retard' : 'Prêt actif'),
              ],
            ),
            const SizedBox(height: 14),
            const Text(
              'Matériel avec vous',
              style: TextStyle(
                color: AppColors.donkerblauw,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            ...loan.items.map(
              (item) => Padding(
                padding: const EdgeInsets.only(bottom: 5),
                child: Text(
                  '${item.typeLabel} · ${item.variantLabel} · ${item.inventoryLabel}',
                  style: const TextStyle(color: Colors.black87),
                ),
              ),
            ),
            if (loan.items.isEmpty)
              Text(
                '${loan.itemIds.length} article(s) enregistré(s)',
                style: const TextStyle(color: Colors.black54),
              ),
            const SizedBox(height: 10),
            _InfoChip(
              icon: Icons.euro,
              label: 'Caution ${loan.cautionAmount.toStringAsFixed(2)} EUR',
            ),
            const SizedBox(height: 10),
            const Text(
              'Rapportez le matériel lors de la séance piscine.',
              style: TextStyle(color: Colors.black54, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReturnValidationSheet extends StatefulWidget {
  final MaterialLoan loan;
  final String clubId;
  final MaterialReturnService service;
  final Future<void> Function(
    MaterialLoan loan,
    MaterialReturnDecision decision,
    double refundAmount,
    String notes,
    List<MaterialReturnItemCheck> itemChecks,
  ) onSubmit;

  const _ReturnValidationSheet({
    required this.loan,
    required this.clubId,
    required this.service,
    required this.onSubmit,
  });

  @override
  State<_ReturnValidationSheet> createState() => _ReturnValidationSheetState();
}

class _ReturnValidationSheetState extends State<_ReturnValidationSheet> {
  final _notesController = TextEditingController();
  late final TextEditingController _refundController;
  late final List<_ReturnItemDraft> _itemDrafts;
  MaterialReturnDecision _decision = MaterialReturnDecision.fullRefund;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _refundController = TextEditingController(
      text: widget.loan.cautionAmount.toStringAsFixed(2),
    );
    _itemDrafts =
        widget.loan.items.map((item) => _ReturnItemDraft(item: item)).toList();
  }

  @override
  void dispose() {
    _notesController.dispose();
    _refundController.dispose();
    for (final draft in _itemDrafts) {
      draft.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(18, 12, 18, bottomInset + 18),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 46,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Validation retour',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: AppColors.donkerblauw,
                        ),
                  ),
                ),
                IconButton(
                  onPressed:
                      _submitting ? null : () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                  color: AppColors.donkerblauw,
                  tooltip: 'Annuler',
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              '${widget.loan.memberName} - ${widget.loan.loanNumber}',
              style: TextStyle(color: Colors.grey.shade700),
            ),
            const SizedBox(height: 18),
            const Text(
              'Contrôle article par article',
              style: TextStyle(
                color: AppColors.donkerblauw,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            if (_itemDrafts.isEmpty)
              const _InlineNotice(
                text:
                    'Les détails des articles ne sont pas disponibles pour ce prêt ancien.',
              )
            else
              ..._itemDrafts.map(_buildItemCheck),
            const SizedBox(height: 10),
            DropdownButtonFormField<MaterialReturnDecision>(
              initialValue: _decision,
              decoration: const InputDecoration(
                labelText: 'Decision caution',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(
                  value: MaterialReturnDecision.fullRefund,
                  child: Text('Materiel OK - rembourser toute la caution'),
                ),
                DropdownMenuItem(
                  value: MaterialReturnDecision.partialRefund,
                  child: Text('Remboursement partiel'),
                ),
                DropdownMenuItem(
                  value: MaterialReturnDecision.retainCaution,
                  child: Text('Ne pas rembourser'),
                ),
                DropdownMenuItem(
                  value: MaterialReturnDecision.decideLater,
                  child: Text('Retour OK - decision financiere plus tard'),
                ),
              ],
              onChanged: (value) {
                if (value == null) return;
                setState(() {
                  _decision = value;
                  if (value == MaterialReturnDecision.fullRefund) {
                    _refundController.text =
                        widget.loan.cautionAmount.toStringAsFixed(2);
                  } else if (value == MaterialReturnDecision.retainCaution ||
                      value == MaterialReturnDecision.decideLater) {
                    _refundController.text = '0.00';
                  }
                });
              },
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _refundController,
              enabled: _decision == MaterialReturnDecision.partialRefund,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Montant a rembourser',
                suffixText: 'EUR',
                border: OutlineInputBorder(),
              ),
            ),
            if (_itemDrafts.any(
              (draft) => draft.condition == MaterialReturnItemCondition.missing,
            )) ...[
              const SizedBox(height: 10),
              const _InlineNotice(
                text:
                    'Article manquant : aucune caution n’est remboursée maintenant. La décision de compensation sera traitée dans CaliCompta.',
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _notesController,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Note de controle',
                hintText: 'Etat du materiel, remarque, degat eventuel...',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed:
                        _submitting ? null : () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                    label: const Text('Annuler'),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 2,
                  child: ElevatedButton.icon(
                    onPressed: _submitting ? null : _submit,
                    icon: _submitting
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.verified_outlined),
                    label: Text(
                      _submitting ? 'Validation...' : 'Valider le retour',
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.success,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildItemCheck(_ReturnItemDraft draft) {
    final item = draft.item;
    final requiresEvidence =
        draft.condition != MaterialReturnItemCondition.good;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color:
            requiresEvidence ? Colors.orange.shade50 : Colors.blueGrey.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: requiresEvidence
              ? Colors.orange.shade200
              : Colors.blueGrey.shade100,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${item.typeLabel} · ${item.variantLabel}',
            style: const TextStyle(
              color: AppColors.donkerblauw,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            item.inventoryLabel,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          Text(
            item.technicalDetails,
            style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<MaterialReturnItemCondition>(
            initialValue: draft.condition,
            decoration: const InputDecoration(
              labelText: 'État au retour',
              border: OutlineInputBorder(),
              isDense: true,
            ),
            items: const [
              DropdownMenuItem(
                value: MaterialReturnItemCondition.good,
                child: Text('Complet et en bon état'),
              ),
              DropdownMenuItem(
                value: MaterialReturnItemCondition.damaged,
                child: Text('Endommagé · à réparer'),
              ),
              DropdownMenuItem(
                value: MaterialReturnItemCondition.missing,
                child: Text('Manquant · décision requise'),
              ),
            ],
            onChanged: _submitting
                ? null
                : (value) {
                    if (value == null) return;
                    setState(() {
                      draft.condition = value;
                      if (value == MaterialReturnItemCondition.missing) {
                        _decision = MaterialReturnDecision.decideLater;
                        _refundController.text = '0.00';
                      }
                    });
                  },
          ),
          if (requiresEvidence) ...[
            const SizedBox(height: 10),
            TextField(
              controller: draft.noteController,
              enabled: !_submitting,
              minLines: 2,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Commentaire obligatoire',
                hintText: 'Décrivez précisément ce qui est constaté.',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  onPressed: _submitting
                      ? null
                      : () => _pickPhoto(draft, ImageSource.camera),
                  icon: const Icon(Icons.photo_camera_outlined),
                  label: const Text('Prendre une photo'),
                ),
                OutlinedButton.icon(
                  onPressed: _submitting
                      ? null
                      : () => _pickPhoto(draft, ImageSource.gallery),
                  icon: const Icon(Icons.photo_library_outlined),
                  label: const Text('Galerie'),
                ),
                if (draft.photos.isNotEmpty)
                  Chip(
                    avatar: const Icon(Icons.image_outlined, size: 18),
                    label: Text('${draft.photos.length} photo(s)'),
                    onDeleted: _submitting
                        ? null
                        : () => setState(() => draft.photos.removeLast()),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'La photo restera associée à ${item.inventoryLabel}.',
              style: TextStyle(color: Colors.grey.shade700, fontSize: 12.5),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _pickPhoto(_ReturnItemDraft draft, ImageSource source) async {
    try {
      final photo = await ImagePicker().pickImage(
        source: source,
        imageQuality: 82,
        maxWidth: 1800,
      );
      if (photo != null && mounted) {
        setState(() => draft.photos.add(photo));
      }
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Impossible d’ajouter la photo : $error'),
          backgroundColor: AppColors.error,
        ),
      );
    }
  }

  Future<void> _submit() async {
    final refundAmount =
        double.tryParse(_refundController.text.trim().replaceAll(',', '.')) ??
            0;

    if (refundAmount < 0 || refundAmount > widget.loan.cautionAmount) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Montant de remboursement invalide'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    for (final draft in _itemDrafts) {
      if (draft.condition == MaterialReturnItemCondition.good) continue;
      if (draft.noteController.text.trim().isEmpty || draft.photos.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '${draft.item.inventoryLabel} : ajoutez un commentaire et une photo.',
            ),
            backgroundColor: AppColors.error,
          ),
        );
        return;
      }
    }

    setState(() => _submitting = true);
    try {
      final itemChecks = <MaterialReturnItemCheck>[];
      for (final draft in _itemDrafts) {
        final photoUrls = <String>[];
        for (final photo in draft.photos) {
          final bytes = await photo.readAsBytes();
          final url = await widget.service.uploadReturnConditionPhoto(
            clubId: widget.clubId,
            loanId: widget.loan.id,
            itemId: draft.item.id,
            bytes: bytes,
            fileName: photo.name,
            contentType: photo.mimeType,
          );
          photoUrls.add(url);
        }
        itemChecks.add(
          MaterialReturnItemCheck(
            itemId: draft.item.id,
            condition: draft.condition,
            note: draft.noteController.text,
            photoUrls: photoUrls,
          ),
        );
      }

      await widget.onSubmit(
        widget.loan,
        _decision,
        refundAmount,
        _notesController.text,
        itemChecks,
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class _ReturnItemDraft {
  final MaterialLoanItem item;
  final TextEditingController noteController = TextEditingController();
  final List<XFile> photos = [];
  MaterialReturnItemCondition condition = MaterialReturnItemCondition.good;

  _ReturnItemDraft({required this.item});

  void dispose() => noteController.dispose();
}

class _DirectLoanSheet extends StatefulWidget {
  final MaterialReturnService service;
  final MaterialLoanService loanService;
  final String clubId;
  final String createdByUserId;
  final String createdByName;

  const _DirectLoanSheet({
    required this.service,
    required this.loanService,
    required this.clubId,
    required this.createdByUserId,
    required this.createdByName,
  });

  @override
  State<_DirectLoanSheet> createState() => _DirectLoanSheetState();
}

class _DirectLoanSheetState extends State<_DirectLoanSheet> {
  final _memberSearchController = TextEditingController();
  final _notesController = TextEditingController();
  final Map<String, String> _selectedVariantByType = {};
  final Map<String, String?> _selectedTypeIds = {};
  late final Stream<List<MaterialLoanItem>> _requestCatalog;
  final Set<String> _disabledInventoryTypes = {};
  List<MaterialLoanMember> _members = const [];
  MaterialLoanMember? _member;
  DateTime _returnDate = DateTime.now().add(const Duration(days: 7));
  bool _loadingMembers = true;
  String _paymentMode = 'epc_qr_onsite';
  String? _pendingLoanId;
  List<MaterialLoanRequestedLine>? _pendingLines;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _requestCatalog = widget.service.watchRequestCatalog(widget.clubId);
    _loadMembers();
  }

  @override
  void dispose() {
    _memberSearchController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _loadMembers() async {
    try {
      final members = await widget.loanService.loadActiveMembers(widget.clubId);
      if (mounted) setState(() => _members = members);
    } finally {
      if (mounted) setState(() => _loadingMembers = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(18, 12, 18, bottomInset + 18),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.9,
        child: StreamBuilder<List<MaterialLoanItem>>(
          stream: _requestCatalog,
          builder: (context, snapshot) {
            final items = snapshot.data ?? const <MaterialLoanItem>[];
            final grouped = <String, List<MaterialLoanItem>>{};
            for (final item in items) {
              grouped.putIfAbsent(item.typeLabel, () => []).add(item);
            }
            final selectedLines = _selectedVariantByType.entries
                .where((entry) => !_disabledInventoryTypes.contains(entry.key))
                .map((entry) => MaterialLoanRequestedLine(
                    typeId: _selectedTypeIds[entry.key],
                    typeName: entry.key,
                    variant: entry.value))
                .toList();
            final canSubmit =
                _member != null && selectedLines.isNotEmpty && !_submitting;

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 46,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey.shade300,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Nouveau prêt',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                      ),
                    ),
                    IconButton(
                      onPressed: _submitting
                          ? null
                          : () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close),
                      color: Colors.white,
                      tooltip: 'Annuler',
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: AbsorbPointer(
                      absorbing: _submitting || _pendingLoanId != null,
                      child: ListView(
                        children: [
                          if (_pendingLoanId != null)
                            const _InlineNotice(
                                text:
                                    'Demande déjà enregistrée. Informations verrouillées ; le bouton reprend cette même demande sans en créer une autre.'),
                          _buildMemberPicker(),
                          const SizedBox(height: 14),
                          OutlinedButton.icon(
                            onPressed: _pickReturnDate,
                            icon: const Icon(Icons.event_available_outlined),
                            label: Text(
                              'Retour prévu : ${_formatDate(_returnDate)}',
                            ),
                            style: OutlinedButton.styleFrom(
                              backgroundColor:
                                  Colors.white.withValues(alpha: 0.92),
                            ),
                          ),
                          const SizedBox(height: 14),
                          const Text(
                            'Type et option demandés — sans réservation',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 10),
                          if (snapshot.connectionState ==
                              ConnectionState.waiting)
                            const Padding(
                              padding: EdgeInsets.all(20),
                              child: Center(child: CircularProgressIndicator()),
                            )
                          else if (grouped.isEmpty)
                            const _InlineNotice(
                              text: 'Aucun matériel disponible pour le moment.',
                            )
                          else
                            ...grouped.entries.map(
                              (entry) => _buildInventorySelector(
                                  entry.key, entry.value),
                            ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: _notesController,
                            minLines: 2,
                            maxLines: 4,
                            decoration: InputDecoration(
                              labelText: 'Note de remise',
                              filled: true,
                              fillColor: Colors.white.withValues(alpha: 0.92),
                              border: const OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.92),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Caution fixe : 100,00 EUR',
                                  style: TextStyle(
                                    color: AppColors.donkerblauw,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                IgnorePointer(
                                  ignoring: _pendingLoanId != null,
                                  child: RadioGroup<String>(
                                    groupValue: _paymentMode,
                                    onChanged: (value) {
                                      if (value == null) return;
                                      setState(() => _paymentMode = value);
                                    },
                                    child: const Column(
                                      children: [
                                        RadioListTile<String>(
                                          contentPadding: EdgeInsets.zero,
                                          value: 'epc_qr_onsite',
                                          title: Text('QR code sur place'),
                                          subtitle: Text(
                                            'Le responsable affiche le QR sur ce téléphone, puis confirme le paiement observé.',
                                          ),
                                        ),
                                        RadioListTile<String>(
                                          contentPadding: EdgeInsets.zero,
                                          value: 'epc_qr_email',
                                          title:
                                              Text('Envoyer le QR par e-mail'),
                                          subtitle: Text(
                                            'Le QR est envoyé uniquement à l’adresse e-mail enregistrée du membre. Aucun article réservé : attribution lors de la remise.',
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      )),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _submitting
                            ? null
                            : () => Navigator.of(context).pop(),
                        icon: const Icon(Icons.close),
                        label: const Text('Annuler'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: const BorderSide(color: Colors.white),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 2,
                      child: ElevatedButton.icon(
                        onPressed:
                            canSubmit ? () => _submit(selectedLines) : null,
                        icon: _submitting
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.assignment_turned_in_outlined),
                        label: Text(
                          _submitting
                              ? 'Création...'
                              : _paymentMode == 'epc_qr_email'
                                  ? 'Demander et envoyer le QR (${selectedLines.length})'
                                  : 'Demander et afficher le QR (${selectedLines.length})',
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.middenblauw,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildMemberPicker() {
    final query = _memberSearchController.text.trim().toLowerCase();
    final matches = query.isEmpty
        ? const <MaterialLoanMember>[]
        : _members
            .where((member) => member.name.toLowerCase().contains(query))
            .take(12)
            .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_member != null)
          InputChip(
            label: Text(_member!.name),
            avatar: const Icon(Icons.person_outline),
            onDeleted: () => setState(() => _member = null),
          )
        else ...[
          TextField(
            controller: _memberSearchController,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText:
                  _loadingMembers ? 'Chargement...' : 'Rechercher un membre',
              prefixIcon: const Icon(Icons.search),
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.92),
              border: const OutlineInputBorder(),
            ),
          ),
          if (!_loadingMembers && query.isNotEmpty) ...[
            const SizedBox(height: 4),
            Material(
              color: Colors.grey.shade50,
              borderRadius: BorderRadius.circular(10),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 220),
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: matches.length,
                  itemBuilder: (context, index) {
                    final member = matches[index];
                    return ListTile(
                      dense: true,
                      leading: const Icon(Icons.person_outline),
                      title: Text(member.name),
                      onTap: () => setState(() {
                        _member = member;
                        _memberSearchController.clear();
                      }),
                    );
                  },
                ),
              ),
            ),
          ],
        ],
      ],
    );
  }

  Widget _buildInventorySelector(String type, List<MaterialLoanItem> items) {
    final uniqueItemsById = <String, MaterialLoanItem>{};
    for (final item in items) {
      uniqueItemsById[item.id] = item;
    }
    final uniqueItems = uniqueItemsById.values.toList();
    final variants =
        uniqueItems.map((item) => item.variantLabel).toSet().toList()..sort();
    final selectedVariant = _selectedVariantByType[type] ?? variants.first;
    final isSelected = _selectedVariantByType.containsKey(type) &&
        !_disabledInventoryTypes.contains(type);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: isSelected ? 0.94 : 0.82),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isSelected ? AppColors.middenblauw : Colors.grey.shade200,
        ),
      ),
      child: Column(
        children: [
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            dense: true,
            value: isSelected,
            onChanged: (value) => setState(() {
              if (value) {
                _disabledInventoryTypes.remove(type);
                _selectedVariantByType[type] = variants.first;
                _selectedTypeIds[type] = uniqueItems.first.typeId;
              } else {
                _disabledInventoryTypes.add(type);
                _selectedVariantByType.remove(type);
              }
            }),
            title: Text(
              type,
              style: const TextStyle(
                color: AppColors.donkerblauw,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          if (isSelected) ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: selectedVariant,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Taille',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    items: variants
                        .map(
                          (variant) => DropdownMenuItem(
                            value: variant,
                            child: Text(
                              variant,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: (variant) {
                      if (variant == null) return;
                      setState(() {
                        _selectedVariantByType[type] = variant;
                      });
                    },
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _pickReturnDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _returnDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _returnDate = picked);
  }

  Future<void> _submit(List<MaterialLoanRequestedLine> lines) async {
    final member = _member;
    if (member == null) return;
    final requestLines = List<MaterialLoanRequestedLine>.of(lines);
    final paymentMode = _paymentMode;
    final returnDate = _returnDate;
    final notes = _notesController.text;
    setState(() => _submitting = true);
    try {
      final loanId = _pendingLoanId ??
          await widget.loanService.createPendingTypeLoan(
            clubId: widget.clubId,
            member: member,
            requestedLines: requestLines,
            expectedReturnDate: returnDate,
            createdByUserId: widget.createdByUserId,
            createdByName: widget.createdByName,
            paymentMode: paymentMode,
            notes: notes,
          );
      if (!mounted) return;
      setState(() {
        _pendingLoanId ??= loanId;
        _pendingLines ??= requestLines;
      });
      if (paymentMode == 'epc_qr_email') {
        await widget.loanService.sendPendingLoanPaymentQrEmail(
          clubId: widget.clubId,
          loanId: loanId,
        );
        if (!mounted) return;
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'QR envoyé au membre. Aucun matériel réservé : attribution lors de la remise.',
            ),
            backgroundColor: AppColors.success,
          ),
        );
        return;
      }

      final qr = await widget.loanService.getPendingLoanPaymentQr(
        clubId: widget.clubId,
        loanId: loanId,
      );
      if (!mounted) return;
      final confirmed = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        useRootNavigator: true,
        builder: (dialogContext) => MaterialPaymentQrDialog(
          payload: qr.epcPayload,
          reference: qr.reference,
          amount: qr.amount,
          canConfirmPayment: true,
        ),
      );
      if (confirmed != true) return;
      if (!mounted) return;
      final selectedIds = await showDialog<List<String>>(
          context: context,
          builder: (_) => MaterialHandoverDialog(
              lines: _pendingLines!,
              availableItems:
                  widget.service.watchBorrowableItems(widget.clubId),
              cautionAmount: qr.amount));
      if (selectedIds == null) return;
      await widget.loanService.confirmPendingPaymentAndHandover(
        clubId: widget.clubId,
        loanId: loanId,
        confirmedByUserId: widget.createdByUserId,
        confirmedByName: widget.createdByName,
        selectedItemIds: selectedIds,
        paymentConfirmed: true,
      );
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Paiement confirmé. Le matériel est remis.'),
          backgroundColor: AppColors.success,
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Impossible de créer le prêt : $error'),
          backgroundColor: AppColors.error,
        ),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class _InlineNotice extends StatelessWidget {
  final String text;

  const _InlineNotice({required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(text, style: const TextStyle(color: Colors.black54)),
    );
  }
}

class _MaterialRequestSheet extends StatefulWidget {
  final MaterialReturnService service;
  final String clubId;
  final String memberId;
  final String memberName;
  final String memberEmail;

  const _MaterialRequestSheet({
    required this.service,
    required this.clubId,
    required this.memberId,
    required this.memberName,
    required this.memberEmail,
  });

  @override
  State<_MaterialRequestSheet> createState() => _MaterialRequestSheetState();
}

class _MaterialRequestSheetState extends State<_MaterialRequestSheet> {
  final _notesController = TextEditingController();
  final Map<String, String?> _selectedChoices = {};
  DateTime _expectedReturnDate = DateTime.now().add(const Duration(days: 7));
  bool _submitting = false;

  static const _categories = <_MaterialRequestCategory>[
    _MaterialRequestCategory(
      id: 'bouteille',
      label: 'Bouteille',
      icon: Icons.propane_tank_outlined,
      choices: ['12 L avec insert', '12 L DIN', '10 L avec insert', '10 L DIN'],
    ),
    _MaterialRequestCategory(
      id: 'detendeur',
      label: 'Détendeur',
      icon: Icons.air,
      choices: ['Détendeur'],
    ),
    _MaterialRequestCategory(
      id: 'gilet',
      label: 'Gilet',
      icon: Icons.checkroom_outlined,
      choices: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    ),
    _MaterialRequestCategory(
      id: 'lampe',
      label: 'Lampe',
      icon: Icons.flashlight_on_outlined,
      choices: ['Lampe'],
    ),
    _MaterialRequestCategory(
      id: 'compas',
      label: 'Compas',
      icon: Icons.explore_outlined,
      choices: ['Compas'],
    ),
    _MaterialRequestCategory(
      id: 'palmes',
      label: 'Palmes réglables',
      icon: Icons.directions_run_outlined,
      choices: ['S (36-40)', 'M (40-44)', 'XL (44-48)'],
    ),
    _MaterialRequestCategory(
      id: 'ordinateur',
      label: 'Ordinateur',
      icon: Icons.watch_outlined,
      choices: ['Ordinateur'],
    ),
    _MaterialRequestCategory(
      id: 'ceinture',
      label: 'Ceinture de plomb',
      icon: Icons.fitness_center_outlined,
      choices: ['4 kg', '5 kg', '6 kg', '7 kg', '8 kg'],
    ),
    _MaterialRequestCategory(
      id: 'parachute',
      label: 'Parachute',
      icon: Icons.rocket_launch_outlined,
      choices: ['Parachute'],
    ),
  ];

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(18, 12, 18, bottomInset + 18),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.86,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 46,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Demande de pret',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: AppColors.donkerblauw,
                  ),
            ),
            const SizedBox(height: 6),
            Text(
              'Choisissez au maximum un article par catégorie. Le responsable attribuera le matériel réel lors de la remise.',
              style: TextStyle(color: Colors.grey.shade700),
            ),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: _pickReturnDate,
              icon: const Icon(Icons.event_available),
              label: Text('Retour prevu: ${_formatDate(_expectedReturnDate)}'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _notesController,
              minLines: 1,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Remarque',
                hintText: 'Ex: sortie, taille souhaitee, besoin precis...',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: ListView.separated(
                itemCount: _categories.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final category = _categories[index];
                  final selected = _selectedChoices.containsKey(category.id);
                  final choice = _selectedChoices[category.id];

                  return Container(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
                    decoration: BoxDecoration(
                      color: selected
                          ? AppColors.middenblauw.withValues(alpha: 0.08)
                          : Colors.grey.shade50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: selected
                            ? AppColors.middenblauw.withValues(alpha: 0.45)
                            : Colors.grey.shade200,
                      ),
                    ),
                    child: Column(
                      children: [
                        SwitchListTile.adaptive(
                          contentPadding: EdgeInsets.zero,
                          value: selected,
                          onChanged: (value) =>
                              _toggleCategory(category, value),
                          secondary: Icon(
                            category.icon,
                            color: AppColors.middenblauw,
                          ),
                          title: Text(
                            category.label,
                            style: const TextStyle(
                              color: AppColors.donkerblauw,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          subtitle: selected && choice != null
                              ? Text(choice)
                              : const Text('Non sélectionné'),
                        ),
                        if (selected) ...[
                          DropdownButtonFormField<String>(
                            initialValue: choice,
                            isExpanded: true,
                            decoration: const InputDecoration(
                              labelText: 'Option',
                              border: OutlineInputBorder(),
                            ),
                            items: category.choices
                                .map(
                                  (option) => DropdownMenuItem(
                                    value: option,
                                    child: Text(option),
                                  ),
                                )
                                .toList(),
                            onChanged: (value) {
                              if (value != null) {
                                setState(
                                  () => _selectedChoices[category.id] = value,
                                );
                              }
                            },
                          ),
                        ],
                      ],
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _submitting ? null : _submit,
                icon: _submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.send_outlined),
                label: Text(
                  _submitting
                      ? 'Envoi...'
                      : 'Envoyer la demande (${_selectedLines.length})',
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.middenblauw,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<MaterialLoanRequestLine> get _selectedLines => _categories
      .where((category) => _selectedChoices.containsKey(category.id))
      .map(
        (category) => MaterialLoanRequestLine(
          category: category.id,
          attributes: {
            'label': category.label,
            'option': _selectedChoices[category.id],
          },
          quantity: 1,
        ),
      )
      .toList();

  void _toggleCategory(_MaterialRequestCategory category, bool selected) {
    setState(() {
      if (!selected) {
        _selectedChoices.remove(category.id);
      } else {
        _selectedChoices[category.id] = category.choices.first;
      }
    });
  }

  Future<void> _pickReturnDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _expectedReturnDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() => _expectedReturnDate = picked);
    }
  }

  Future<void> _submit() async {
    if (_selectedLines.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Choisissez au moins un materiel'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      await widget.service.submitLoanRequestLines(
        clubId: widget.clubId,
        memberId: widget.memberId,
        memberName: widget.memberName,
        memberEmail: widget.memberEmail,
        lines: _selectedLines,
        expectedReturnDate: _expectedReturnDate,
        notes: _notesController.text,
      );

      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Demande envoyee au responsable materiel.'),
          backgroundColor: AppColors.success,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erreur demande pret: $e'),
          backgroundColor: AppColors.error,
        ),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class _MaterialRequestCategory {
  final String id;
  final String label;
  final IconData icon;
  final List<String> choices;

  const _MaterialRequestCategory({
    required this.id,
    required this.label,
    required this.icon,
    required this.choices,
  });
}

class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String label;

  const _InfoChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: AppColors.middenblauw),
          const SizedBox(width: 4),
          Text(label, style: const TextStyle(fontSize: 12.5)),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  final String label;

  const _StatusPill({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.lichtblauw.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 12,
          color: AppColors.donkerblauw,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

String _formatDate(DateTime date) {
  return '${date.day.toString().padLeft(2, '0')}/'
      '${date.month.toString().padLeft(2, '0')}/'
      '${date.year}';
}

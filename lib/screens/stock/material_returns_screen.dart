import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/material_loan.dart';
import '../../models/member_profile.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/material_loan_service.dart';
import '../../services/material_return_service.dart';
import '../../services/member_service.dart';
import '../../widgets/empty_state_widget.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class MaterialReturnsScreen extends StatefulWidget {
  const MaterialReturnsScreen({super.key});

  @override
  State<MaterialReturnsScreen> createState() => _MaterialReturnsScreenState();
}

enum _MaterialLoanTab { requests, returns }

class _MaterialReturnsScreenState extends State<MaterialReturnsScreen> {
  final _service = MaterialReturnService();
  final _loanService = MaterialLoanService();
  final _clubId = FirebaseConfig.defaultClubId;
  _MaterialLoanTab _activeTab = _MaterialLoanTab.requests;
  String? _selectedRequestMemberId;
  String? _selectedReturnMemberId;

  @override
  Widget build(BuildContext context) {
    final memberProvider = context.watch<MemberProvider>();
    final authProvider = context.watch<AuthProvider>();
    final canValidate = _canValidateReturns(memberProvider);
    final userId = authProvider.currentUser?.uid;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: Text(
          canValidate ? 'Prêts de matériel' : 'Mon matériel emprunté',
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
              Expanded(
                child: canValidate
                    ? _buildGonflageDashboard(
                        createdByUserId: userId,
                        createdByName: memberProvider.displayName,
                      )
                    : _buildMemberLoans(userId, memberProvider),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildGonflageDashboard({
    required String? createdByUserId,
    required String createdByName,
  }) {
    return StreamBuilder<List<MaterialLoanRequest>>(
      stream: _service.watchOpenLoanRequests(clubId: _clubId),
      builder: (context, requestSnapshot) => StreamBuilder<List<MaterialLoan>>(
        stream: _loanService.watchPendingPaymentLoans(_clubId),
        builder: (context, _) => StreamBuilder<List<MaterialLoan>>(
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

            final requests =
                requestSnapshot.data ?? const <MaterialLoanRequest>[];
            final requestGroups = _groupRequestsByMember(requests);
            final matchingGroups = requestGroups
                .where((group) => group.memberId == _selectedRequestMemberId)
                .toList();
            final selectedGroup =
                matchingGroups.isEmpty ? null : matchingGroups.first;
            final loans = _filterLoans(snapshot.data ?? const []);
            final loansByMember = <String, List<MaterialLoan>>{};
            for (final loan in loans) {
              loansByMember.putIfAbsent(loan.memberId, () => []).add(loan);
            }
            final returnGroups = _groupLoansByMember(loans);
            final matchingReturnGroups = returnGroups
                .where((group) => group.memberId == _selectedReturnMemberId)
                .toList();
            final selectedReturnGroup = matchingReturnGroups.isEmpty
                ? null
                : matchingReturnGroups.first;
            final activeTab = _activeTab;

            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              children: [
                _GonflageActionBar(
                  activeTab: activeTab,
                  requestCount: requestGroups.length,
                  returnCount: returnGroups.length,
                  onChanged: (tab) => setState(() => _activeTab = tab),
                  onDirectLoan: createdByUserId == null
                      ? null
                      : () => _openLoanSheet(
                            createdByUserId: createdByUserId,
                            createdByName: createdByName,
                          ),
                ),
                const SizedBox(height: 12),
                if (activeTab == _MaterialLoanTab.requests) ...[
                  if (selectedGroup == null)
                    const _ListSectionTitle('Demandes par membre')
                  else
                    _SelectedRequestMemberHeader(
                      group: selectedGroup,
                      onBack: () =>
                          setState(() => _selectedRequestMemberId = null),
                    ),
                  const SizedBox(height: 10),
                  if (requestGroups.isEmpty)
                    const _LoanTabEmptyState(
                      icon: Icons.inbox_outlined,
                      title: 'Aucune demande en attente',
                      subtitle: 'Les demandes des membres apparaîtront ici.',
                    ),
                  ...(selectedGroup == null ? requestGroups : [selectedGroup])
                      .map(
                    (group) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: selectedGroup == null
                          ? _GonflageMemberRequestCard(
                              group: group,
                              clubId: _clubId,
                              currentLoans:
                                  loansByMember[group.memberId] ?? const [],
                              onTap: () => setState(
                                () => _selectedRequestMemberId = group.memberId,
                              ),
                            )
                          : Column(
                              children: group.requests
                                  .map(
                                    (request) => Padding(
                                      padding:
                                          const EdgeInsets.only(bottom: 12),
                                      child: _GonflageRequestCard(
                                        request: request,
                                        currentLoans:
                                            loansByMember[request.memberId] ??
                                                const [],
                                        onPrepare: createdByUserId == null
                                            ? null
                                            : () => _openLoanForRequest(
                                                  request: request,
                                                  currentLoans: loansByMember[
                                                          request.memberId] ??
                                                      const [],
                                                  createdByUserId:
                                                      createdByUserId,
                                                  createdByName: createdByName,
                                                ),
                                      ),
                                    ),
                                  )
                                  .toList(),
                            ),
                    ),
                  ),
                ],
                if (activeTab == _MaterialLoanTab.returns) ...[
                  if (selectedReturnGroup == null)
                    const _ListSectionTitle('Retours par membre')
                  else
                    _SelectedReturnMemberHeader(
                      group: selectedReturnGroup,
                      onBack: () =>
                          setState(() => _selectedReturnMemberId = null),
                    ),
                  const SizedBox(height: 10),
                  if (returnGroups.isEmpty)
                    const _LoanTabEmptyState(
                      icon: Icons.assignment_turned_in_outlined,
                      title: 'Aucun retour à contrôler',
                      subtitle: 'Les prêts remis au membre apparaîtront ici.',
                    ),
                  ...(selectedReturnGroup == null
                          ? returnGroups
                          : [selectedReturnGroup])
                      .map(
                    (group) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: selectedReturnGroup == null
                          ? _GonflageMemberReturnCard(
                              group: group,
                              clubId: _clubId,
                              onTap: () => setState(
                                () => _selectedReturnMemberId = group.memberId,
                              ),
                            )
                          : Column(
                              children: group.loans
                                  .map(
                                    (loan) => Padding(
                                      padding:
                                          const EdgeInsets.only(bottom: 12),
                                      child: _LoanReturnCard(
                                        loan: loan,
                                        onValidate: () =>
                                            _openReturnSheet(loan),
                                      ),
                                    ),
                                  )
                                  .toList(),
                            ),
                    ),
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }

  Future<void> _openMemberRequestSheet({
    required String memberId,
    required MemberProvider memberProvider,
    MaterialLoanRequest? request,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => _MaterialRequestSheet(
        service: _service,
        clubId: _clubId,
        memberId: memberId,
        memberName: memberProvider.displayName,
        memberEmail: memberProvider.email ?? '',
        request: request,
      ),
    );
  }

  Widget _buildMemberLoans(
    String? userId,
    MemberProvider memberProvider,
  ) {
    if (userId == null) {
      return const EmptyStateWidget(
        icon: Icons.login_outlined,
        title: 'Connexion requise',
        subtitle: 'Connectez-vous pour consulter votre matériel emprunté.',
      );
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
          child: _MemberMaterialRequestCard(
            onTap: () => _openMemberRequestSheet(
              memberId: userId,
              memberProvider: memberProvider,
            ),
          ),
        ),
        Expanded(
          child: StreamBuilder<List<MaterialLoanRequest>>(
            stream: _service.watchMyLoanRequests(
              clubId: _clubId,
              memberId: userId,
            ),
            builder: (context, requestSnapshot) =>
                StreamBuilder<List<MaterialLoan>>(
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
                final requests =
                    requestSnapshot.data ?? const <MaterialLoanRequest>[];
                if (loans.isEmpty && requests.isEmpty) {
                  return const EmptyStateWidget(
                    icon: Icons.inventory_2_outlined,
                    title: 'Aucun matériel emprunté',
                    subtitle:
                        'Lorsqu’un encadrant vous remet du matériel, il apparaîtra ici.',
                  );
                }

                return ListView(
                  padding: const EdgeInsets.fromLTRB(16, 2, 16, 24),
                  children: [
                    if (loans.isNotEmpty) ...[
                      const _ListSectionTitle('Mon matériel emprunté'),
                      const SizedBox(height: 8),
                      ...loans.map(
                        (loan) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _MemberLoanCard(loan: loan),
                        ),
                      ),
                    ],
                    if (requests.isNotEmpty) ...[
                      if (loans.isNotEmpty) const SizedBox(height: 4),
                      const _ListSectionTitle('Mes demandes'),
                      const SizedBox(height: 8),
                      ...requests.map(
                        (request) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _MemberLoanRequestCard(
                            request: request,
                            onEdit: request.status == 'submitted'
                                ? () => _openMemberRequestSheet(
                                      memberId: userId,
                                      memberProvider: memberProvider,
                                      request: request,
                                    )
                                : null,
                          ),
                        ),
                      ),
                    ],
                  ],
                );
              },
            ),
          ),
        ),
      ],
    );
  }

  bool _canValidateReturns(MemberProvider memberProvider) {
    return memberProvider.isGonflage;
  }

  List<MaterialLoan> _filterLoans(List<MaterialLoan> loans) {
    return loans;
  }

  List<_LoanRequestMemberGroup> _groupRequestsByMember(
    List<MaterialLoanRequest> requests,
  ) {
    final grouped = <String, List<MaterialLoanRequest>>{};
    for (final request in requests) {
      grouped.putIfAbsent(request.memberId, () => []).add(request);
    }
    final result = grouped.entries
        .map(
          (entry) => _LoanRequestMemberGroup(
            memberId: entry.key,
            memberName: entry.value.first.memberName,
            requests: entry.value,
          ),
        )
        .toList();
    result.sort((left, right) {
      final leftDate = left.nextStartDate ?? DateTime(9999);
      final rightDate = right.nextStartDate ?? DateTime(9999);
      return leftDate.compareTo(rightDate);
    });
    return result;
  }

  List<_LoanReturnMemberGroup> _groupLoansByMember(
    List<MaterialLoan> loans,
  ) {
    final grouped = <String, List<MaterialLoan>>{};
    for (final loan in loans) {
      grouped.putIfAbsent(loan.memberId, () => []).add(loan);
    }
    final result = grouped.entries
        .map(
          (entry) => _LoanReturnMemberGroup(
            memberId: entry.key,
            memberName: entry.value.first.memberName,
            loans: entry.value,
          ),
        )
        .toList();
    result.sort((left, right) {
      final leftDate = left.nextReturnDate ?? DateTime(9999);
      final rightDate = right.nextReturnDate ?? DateTime(9999);
      return leftDate.compareTo(rightDate);
    });
    return result;
  }

  Future<void> _openLoanForRequest({
    required MaterialLoanRequest request,
    required List<MaterialLoan> currentLoans,
    required String createdByUserId,
    required String createdByName,
  }) async {
    if (currentLoans.isNotEmpty) {
      final hasLateLoan = currentLoans.any(_isLoanLate);
      final continueLoan = await showDialog<bool>(
            context: context,
            builder: (context) => AlertDialog(
              icon: Icon(
                hasLateLoan ? Icons.warning_amber_rounded : Icons.info_outline,
                color: hasLateLoan ? AppColors.error : Colors.orange,
              ),
              title: Text(
                  hasLateLoan ? 'Retour en retard' : 'Matériel déjà emprunté'),
              content: Text(
                '${request.memberName} a déjà ${currentLoans.length} prêt(s) actif(s)${hasLateLoan ? ', dont au moins un retour est en retard' : ''}. Vérifiez la situation avant de remettre du nouveau matériel.',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('Annuler'),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  child: const Text('Continuer'),
                ),
              ],
            ),
          ) ??
          false;
      if (!continueLoan || !mounted) return;
    }
    await _openLoanSheet(
      createdByUserId: createdByUserId,
      createdByName: createdByName,
      initialMemberId: request.memberId,
      initialMemberName: request.memberName,
      initialReturnDate: request.expectedReturnDate,
      initialRequestId: request.id,
      initialRequestLines: request.lines,
    );
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
    String? initialMemberId,
    String? initialMemberName,
    DateTime? initialReturnDate,
    String? initialRequestId,
    List<MaterialLoanRequestLine>? initialRequestLines,
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
          initialMemberId: initialMemberId,
          initialMemberName: initialMemberName,
          initialReturnDate: initialReturnDate,
          initialRequestId: initialRequestId,
          initialRequestLines: initialRequestLines,
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

class _GonflageActionBar extends StatelessWidget {
  final _MaterialLoanTab activeTab;
  final int requestCount;
  final int returnCount;
  final ValueChanged<_MaterialLoanTab> onChanged;
  final VoidCallback? onDirectLoan;

  const _GonflageActionBar({
    required this.activeTab,
    required this.requestCount,
    required this.returnCount,
    required this.onChanged,
    required this.onDirectLoan,
  });

  @override
  Widget build(BuildContext context) {
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
            icon: Icons.inbox_outlined,
            label: 'Demandes',
            count: requestCount,
            selected: activeTab == _MaterialLoanTab.requests,
            onTap: () => onChanged(_MaterialLoanTab.requests),
          ),
          _MaterialLoanTabButton(
            icon: Icons.add_box_outlined,
            label: 'Prêt direct',
            selected: false,
            onTap: onDirectLoan,
          ),
          _MaterialLoanTabButton(
            icon: Icons.assignment_return_outlined,
            label: 'Retours',
            count: returnCount,
            selected: activeTab == _MaterialLoanTab.returns,
            onTap: () => onChanged(_MaterialLoanTab.returns),
          ),
        ],
      ),
    );
  }
}

class _MaterialLoanTabButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final int? count;
  final bool selected;
  final VoidCallback? onTap;

  const _MaterialLoanTabButton({
    required this.icon,
    required this.label,
    this.count,
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
              Icon(icon, size: 17, color: foreground),
              const SizedBox(width: 5),
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
              if (count != null) ...[
                const SizedBox(width: 6),
                Container(
                  constraints: const BoxConstraints(minWidth: 22),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
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

class _MemberMaterialRequestCard extends StatelessWidget {
  final VoidCallback onTap;

  const _MemberMaterialRequestCard({required this.onTap});

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
                      'Demander du matériel',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: AppColors.donkerblauw,
                      ),
                    ),
                    SizedBox(height: 3),
                    Text(
                      'Envoyez une demande à l’équipe Gonflage.',
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

class _MemberLoanRequestCard extends StatelessWidget {
  final MaterialLoanRequest request;
  final VoidCallback? onEdit;

  const _MemberLoanRequestCard({required this.request, this.onEdit});

  @override
  Widget build(BuildContext context) {
    final start = request.requestedStartDate;
    final end = request.expectedReturnDate;
    final requestedItems = request.lines.isNotEmpty
        ? request.lines.map((line) => line.label).toList()
        : request.items.map((item) => item.inventoryLabel).toList();
    return Material(
      // A request is not yet a physical loan: it deliberately has its own
      // warm background, while active loans remain white (or red when late).
      color: const Color(0xFFFFF4D8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: Color(0xFFF0C766), width: 1.2),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const _LoanActionIcon(icon: Icons.pending_actions_outlined),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text(
                    'Demande de matériel',
                    style: TextStyle(
                      color: AppColors.donkerblauw,
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                _StatusPill(label: _requestStatusLabel(request.status)),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              start == null || end == null
                  ? 'Période à confirmer par l’équipe Gonflage'
                  : 'Du ${_formatDate(start)} au ${_formatDate(end)}',
              style: const TextStyle(
                color: AppColors.donkerblauw,
                fontWeight: FontWeight.w700,
              ),
            ),
            if (requestedItems.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                requestedItems.join(' · '),
                style: const TextStyle(color: Colors.black87),
              ),
            ],
            if (onEdit != null) ...[
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: onEdit,
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Modifier la demande'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  static String _requestStatusLabel(String status) {
    switch (status) {
      case 'approved':
      case 'validated':
      case 'ready':
        return 'Acceptée';
      case 'handed_over':
        return 'Remise effectuée';
      case 'refused':
        return 'Refusée';
      default:
        return 'En attente';
    }
  }
}

/// Compact operational card for Gonflage: one member and their requested kit.
class _GonflageRequestCard extends StatelessWidget {
  final MaterialLoanRequest request;
  final List<MaterialLoan> currentLoans;
  final VoidCallback? onPrepare;

  const _GonflageRequestCard({
    required this.request,
    this.currentLoans = const [],
    this.onPrepare,
  });

  @override
  Widget build(BuildContext context) {
    final requestedItems = request.lines.isNotEmpty
        ? request.lines.map((line) => line.label).toList()
        : request.items.map((item) => item.inventoryLabel).toList();
    final start = request.requestedStartDate;
    final end = request.expectedReturnDate;
    return Material(
      color: const Color(0xFFFFF4D8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: Color(0xFFF0C766), width: 1.2),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const _LoanActionIcon(icon: Icons.person_outline),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    request.memberName,
                    style: const TextStyle(
                      color: AppColors.donkerblauw,
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const _StatusPill(label: 'En attente'),
              ],
            ),
            if (start != null || end != null) ...[
              const SizedBox(height: 12),
              Text(
                start != null && end != null
                    ? 'Du ${_formatDate(start)} au ${_formatDate(end)}'
                    : 'Période à confirmer',
                style: const TextStyle(
                  color: AppColors.donkerblauw,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
            if (requestedItems.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                requestedItems.join(' · '),
                style: const TextStyle(color: Colors.black87),
              ),
            ],
            if (currentLoans.isNotEmpty) ...[
              const SizedBox(height: 10),
              _ExistingLoanWarning(loans: currentLoans),
            ],
            if (request.notes?.trim().isNotEmpty == true) ...[
              const SizedBox(height: 8),
              Text(
                request.notes!.trim(),
                style: const TextStyle(color: Colors.black54, fontSize: 13),
              ),
            ],
            if (onPrepare != null) ...[
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.icon(
                  onPressed: onPrepare,
                  icon: const Icon(Icons.inventory_2_outlined, size: 18),
                  label: const Text('Préparer le prêt'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _LoanRequestMemberGroup {
  final String memberId;
  final String memberName;
  final List<MaterialLoanRequest> requests;

  const _LoanRequestMemberGroup({
    required this.memberId,
    required this.memberName,
    required this.requests,
  });

  DateTime? get nextStartDate {
    final dates = requests
        .map((request) => request.requestedStartDate)
        .whereType<DateTime>()
        .toList()
      ..sort();
    return dates.isEmpty ? null : dates.first;
  }
}

class _GonflageMemberRequestCard extends StatefulWidget {
  final _LoanRequestMemberGroup group;
  final String clubId;
  final List<MaterialLoan> currentLoans;
  final VoidCallback onTap;

  const _GonflageMemberRequestCard({
    required this.group,
    required this.clubId,
    required this.currentLoans,
    required this.onTap,
  });

  @override
  State<_GonflageMemberRequestCard> createState() =>
      _GonflageMemberRequestCardState();
}

class _GonflageMemberRequestCardState
    extends State<_GonflageMemberRequestCard> {
  late final Future<MemberProfile?> _memberProfile;

  @override
  void initState() {
    super.initState();
    _memberProfile = MemberService().getMemberById(
      widget.clubId,
      widget.group.memberId,
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<MemberProfile?>(
      future: _memberProfile,
      builder: (context, snapshot) {
        final profile = snapshot.data;
        final photoUrl =
            profile?.hasPhoto == true && profile?.consentInternalPhoto == true
                ? profile!.photoUrl
                : null;
        final requestCount = widget.group.requests.length;
        final startDate = widget.group.nextStartDate;
        return Material(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            onTap: widget.onTap,
            borderRadius: BorderRadius.circular(16),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 29,
                    backgroundColor:
                        AppColors.middenblauw.withValues(alpha: 0.15),
                    foregroundImage:
                        photoUrl == null ? null : NetworkImage(photoUrl),
                    child: photoUrl == null
                        ? Text(
                            _initials(widget.group.memberName),
                            style: const TextStyle(
                              color: AppColors.donkerblauw,
                              fontWeight: FontWeight.w900,
                            ),
                          )
                        : null,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.group.memberName,
                          style: const TextStyle(
                            color: AppColors.donkerblauw,
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          requestCount == 1
                              ? '1 demande à traiter'
                              : '$requestCount demandes à traiter',
                          style: const TextStyle(color: Colors.black54),
                        ),
                        if (startDate != null) ...[
                          const SizedBox(height: 3),
                          Text(
                            'Prochain prêt : ${_formatDate(startDate)}',
                            style: const TextStyle(
                              color: AppColors.middenblauw,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                        if (widget.currentLoans.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          _ExistingLoanWarning(loans: widget.currentLoans),
                        ],
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: AppColors.middenblauw),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _ExistingLoanWarning extends StatelessWidget {
  final List<MaterialLoan> loans;

  const _ExistingLoanWarning({required this.loans});

  @override
  Widget build(BuildContext context) {
    final hasLateLoan = loans.any(_isLoanLate);
    final color = hasLateLoan ? AppColors.error : Colors.orange.shade800;
    final background = hasLateLoan ? Colors.red.shade50 : Colors.orange.shade50;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(9),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Icon(Icons.warning_amber_rounded, size: 17, color: color),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              hasLateLoan
                  ? 'Attention : retour en retard'
                  : '${loans.length} prêt actif déjà en cours',
              style: TextStyle(color: color, fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
    );
  }
}

class _LoanReturnMemberGroup {
  final String memberId;
  final String memberName;
  final List<MaterialLoan> loans;

  const _LoanReturnMemberGroup({
    required this.memberId,
    required this.memberName,
    required this.loans,
  });

  DateTime? get nextReturnDate {
    final dates = loans
        .map((loan) => loan.expectedReturnDate)
        .whereType<DateTime>()
        .toList()
      ..sort();
    return dates.isEmpty ? null : dates.first;
  }
}

class _GonflageMemberReturnCard extends StatefulWidget {
  final _LoanReturnMemberGroup group;
  final String clubId;
  final VoidCallback onTap;

  const _GonflageMemberReturnCard({
    required this.group,
    required this.clubId,
    required this.onTap,
  });

  @override
  State<_GonflageMemberReturnCard> createState() =>
      _GonflageMemberReturnCardState();
}

class _GonflageMemberReturnCardState extends State<_GonflageMemberReturnCard> {
  late final Future<MemberProfile?> _memberProfile;

  @override
  void initState() {
    super.initState();
    _memberProfile = MemberService().getMemberById(
      widget.clubId,
      widget.group.memberId,
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<MemberProfile?>(
      future: _memberProfile,
      builder: (context, snapshot) {
        final profile = snapshot.data;
        final photoUrl =
            profile?.hasPhoto == true && profile?.consentInternalPhoto == true
                ? profile!.photoUrl
                : null;
        final hasLateLoan = widget.group.loans.any(_isLoanLate);
        final nextReturn = widget.group.nextReturnDate;
        return Material(
          color: hasLateLoan ? Colors.red.shade50 : Colors.white,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            onTap: widget.onTap,
            borderRadius: BorderRadius.circular(16),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 29,
                    backgroundColor:
                        AppColors.middenblauw.withValues(alpha: 0.15),
                    foregroundImage:
                        photoUrl == null ? null : NetworkImage(photoUrl),
                    child: photoUrl == null
                        ? Text(
                            _initials(widget.group.memberName),
                            style: const TextStyle(
                              color: AppColors.donkerblauw,
                              fontWeight: FontWeight.w900,
                            ),
                          )
                        : null,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.group.memberName,
                          style: const TextStyle(
                            color: AppColors.donkerblauw,
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          hasLateLoan
                              ? 'Retour en retard'
                              : '${widget.group.loans.length} retour(s) à contrôler',
                          style: TextStyle(
                            color:
                                hasLateLoan ? AppColors.error : Colors.black54,
                            fontWeight: hasLateLoan
                                ? FontWeight.w800
                                : FontWeight.normal,
                          ),
                        ),
                        if (nextReturn != null) ...[
                          const SizedBox(height: 3),
                          Text(
                            'Retour prévu : ${_formatDate(nextReturn)}',
                            style: const TextStyle(
                              color: AppColors.middenblauw,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: AppColors.middenblauw),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _SelectedRequestMemberHeader extends StatelessWidget {
  final _LoanRequestMemberGroup group;
  final VoidCallback onBack;

  const _SelectedRequestMemberHeader({
    required this.group,
    required this.onBack,
  });

  @override
  Widget build(BuildContext context) => Row(
        children: [
          IconButton(
            onPressed: onBack,
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            tooltip: 'Toutes les demandes',
          ),
          Expanded(
            child: Text(
              group.memberName,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 17,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      );
}

class _SelectedReturnMemberHeader extends StatelessWidget {
  final _LoanReturnMemberGroup group;
  final VoidCallback onBack;

  const _SelectedReturnMemberHeader({
    required this.group,
    required this.onBack,
  });

  @override
  Widget build(BuildContext context) => Row(
        children: [
          IconButton(
            onPressed: onBack,
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            tooltip: 'Tous les retours',
          ),
          Expanded(
            child: Text(
              group.memberName,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 17,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      );
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
  final String? initialMemberId;
  final String? initialMemberName;
  final DateTime? initialReturnDate;
  final String? initialRequestId;
  final List<MaterialLoanRequestLine>? initialRequestLines;

  const _DirectLoanSheet({
    required this.service,
    required this.loanService,
    required this.clubId,
    required this.createdByUserId,
    required this.createdByName,
    this.initialMemberId,
    this.initialMemberName,
    this.initialReturnDate,
    this.initialRequestId,
    this.initialRequestLines,
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
  final Set<String> _alternativeAllowedByLine = {};
  final List<MaterialLoanRequestedLine> _extraLines = [];
  List<MaterialLoanMember> _members = const [];
  MaterialLoanMember? _member;
  DateTime _returnDate = DateTime.now().add(const Duration(days: 7));
  bool _loadingMembers = true;
  final Map<String, String?> _selectedItemIdsByLine = {};
  bool _initialRequestApplied = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _requestCatalog = widget.service.watchRequestCatalog(widget.clubId);
    _returnDate = widget.initialReturnDate ?? _returnDate;
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
      if (mounted) {
        setState(() {
          _members = members;
          if (widget.initialMemberId != null) {
            final matchingMembers = members
                .where((member) => member.id == widget.initialMemberId)
                .toList();
            // A prepared request is authoritative, including requests created
            // by a test account. The general member search deliberately hides
            // those accounts, but it must never prevent staff handing over the
            // material explicitly requested for that member.
            _member = matchingMembers.isEmpty
                ? MaterialLoanMember(
                    id: widget.initialMemberId!,
                    name: widget.initialMemberName ?? 'Membre',
                  )
                : matchingMembers.first;
          }
        });
      }
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
            _applyInitialRequestLines(grouped);
            final isPreparedRequest = widget.initialRequestLines != null &&
                widget.initialRequestLines!.isNotEmpty;
            final requestedLines = isPreparedRequest
                ? _preparedRequestLines(grouped)
                : _selectedVariantByType.entries
                    .where(
                        (entry) => !_disabledInventoryTypes.contains(entry.key))
                    .map((entry) => MaterialLoanRequestedLine(
                          typeId: _selectedTypeIds[entry.key],
                          typeName: entry.key,
                          variant: entry.value,
                        ))
                    .toList();
            final selectedLines = isPreparedRequest
                ? [...requestedLines, ..._extraLines]
                : requestedLines;
            final assignedItems = _assignedItems(selectedLines, items);
            final canSubmit = _member != null &&
                selectedLines.isNotEmpty &&
                assignedItems.length == selectedLines.length &&
                !_submitting;

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
                        isPreparedRequest
                            ? 'Préparer le prêt'
                            : 'Nouveau prêt direct',
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
                      absorbing: _submitting,
                      child: ListView(
                        children: [
                          if (isPreparedRequest)
                            _PreparedLoanMemberSummary(
                              memberName: widget.initialMemberName ??
                                  _member?.name ??
                                  'Membre',
                              returnDate: _returnDate,
                            )
                          else
                            _buildMemberPicker(),
                          const SizedBox(height: 14),
                          if (!isPreparedRequest)
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
                          Text(
                            isPreparedRequest
                                ? 'Matériel demandé'
                                : 'Matériel à remettre',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 10),
                          if (!isPreparedRequest)
                            const Padding(
                              padding: EdgeInsets.only(bottom: 10),
                              child: Text(
                                'Choisissez le type, l’option et le numéro CDC dans chaque fiche.',
                                style: TextStyle(color: Colors.white70),
                              ),
                            ),
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
                          else if (isPreparedRequest)
                            ...requestedLines.map(
                              (line) => _buildCdcAssignmentCard(line, items),
                            )
                          else
                            ...grouped.entries.map(
                              (entry) => _buildInventorySelector(
                                  entry.key, entry.value),
                            ),
                          if (isPreparedRequest) ...[
                            const SizedBox(height: 4),
                            OutlinedButton.icon(
                              onPressed: () => _addExtraMaterial(items),
                              icon: const Icon(Icons.add_circle_outline),
                              label: const Text('Ajouter du matériel'),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: Colors.white,
                                side: const BorderSide(color: Colors.white),
                              ),
                            ),
                            if (_extraLines.isNotEmpty) ...[
                              const SizedBox(height: 14),
                              const Text(
                                'Matériel supplémentaire remis',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(height: 10),
                              ..._extraLines.map(
                                (line) => _buildCdcAssignmentCard(line, items),
                              ),
                            ],
                          ],
                          const SizedBox(height: 14),
                          TextField(
                            controller: _notesController,
                            minLines: 2,
                            maxLines: 4,
                            decoration: InputDecoration(
                              labelText: 'Note de remise (optionnelle)',
                              filled: true,
                              fillColor: Colors.white.withValues(alpha: 0.92),
                              border: const OutlineInputBorder(),
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
                        onPressed: canSubmit
                            ? () => _submit(selectedLines, items)
                            : null,
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
                              : 'Remettre le matériel (${selectedLines.length})',
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

  void _applyInitialRequestLines(
    Map<String, List<MaterialLoanItem>> grouped,
  ) {
    final requestLines = widget.initialRequestLines;
    if (_initialRequestApplied ||
        requestLines == null ||
        requestLines.isEmpty) {
      return;
    }
    _initialRequestApplied = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(() {
        for (final line in requestLines) {
          final category = _normalizeRequestType(line.category);
          final matchingType = grouped.keys.where((type) {
            final normalizedType = _normalizeRequestType(type);
            return normalizedType.contains(category) ||
                category.contains(normalizedType);
          }).toList();
          if (matchingType.isEmpty) continue;
          final type = matchingType.first;
          final items = grouped[type]!;
          final variants = items.map((item) => item.variantLabel).toSet();
          final requestedVariant = line.attributes['option']?.toString();
          _selectedVariantByType[type] = variants.contains(requestedVariant)
              ? requestedVariant!
              : items.first.variantLabel;
          _selectedTypeIds[type] = items.first.typeId;
          _disabledInventoryTypes.remove(type);
        }
      });
    });
  }

  String _normalizeRequestType(String value) => value
      .toLowerCase()
      .replaceAll('é', 'e')
      .replaceAll('è', 'e')
      .replaceAll('ê', 'e')
      .replaceAll(RegExp(r'[^a-z0-9]'), '');

  List<MaterialLoanRequestedLine> _preparedRequestLines(
    Map<String, List<MaterialLoanItem>> grouped,
  ) {
    return widget.initialRequestLines!.map((line) {
      final category = _normalizeRequestType(line.category);
      final matchingTypes = grouped.keys.where((type) {
        final normalizedType = _normalizeRequestType(type);
        return normalizedType.contains(category) ||
            category.contains(normalizedType);
      }).toList();
      if (matchingTypes.isEmpty) {
        return MaterialLoanRequestedLine(
          typeName: line.attributes['label']?.toString() ?? line.category,
          variant: line.attributes['option']?.toString() ?? 'Standard',
        );
      }
      final type = matchingTypes.first;
      final items = grouped[type]!;
      final requestedVariant = line.attributes['option']?.toString();
      // Keep the option the member asked for. Picking the first inventory
      // item here used to silently turn e.g. a 12 L DIN request into 10 L.
      // The actual physical item is only resolved from its CDC number below.
      return MaterialLoanRequestedLine(
        typeId: items.first.typeId,
        typeName: type,
        variant: requestedVariant?.trim().isNotEmpty == true
            ? requestedVariant!
            : 'Standard',
      );
    }).toList();
  }

  Widget _buildInventorySelector(String type, List<MaterialLoanItem> items) {
    final uniqueItemsById = <String, MaterialLoanItem>{};
    for (final item in items) {
      if (item.isBorrowable) uniqueItemsById[item.id] = item;
    }
    final uniqueItems = uniqueItemsById.values.toList();
    if (uniqueItems.isEmpty) return const SizedBox.shrink();
    final variants =
        uniqueItems.map((item) => item.variantLabel).toSet().toList()..sort();
    final selectedVariant = _selectedVariantByType[type] ?? variants.first;
    final isSelected = _selectedVariantByType.containsKey(type) &&
        !_disabledInventoryTypes.contains(type);
    final line = MaterialLoanRequestedLine(
      typeId: _selectedTypeIds[type] ?? uniqueItems.first.typeId,
      typeName: type,
      variant: selectedVariant,
    );
    final lineKey = _lineKey(line);
    final candidates = _availableItemsForLine(line, uniqueItems);
    final selectedItemId = _selectedItemIdsByLine[lineKey];

    return _MaterialChoiceCard(
      icon: _inventoryTypeIcon(type),
      label: type,
      choices: variants,
      selectedChoice: isSelected ? selectedVariant : null,
      onSelected: (value) => setState(() {
        if (value) {
          _disabledInventoryTypes.remove(type);
          _selectedVariantByType[type] = variants.first;
          _selectedTypeIds[type] = uniqueItems.first.typeId;
        } else {
          _disabledInventoryTypes.add(type);
          _selectedVariantByType.remove(type);
        }
      }),
      onChoiceChanged: (variant) => setState(
        () => _selectedVariantByType[type] = variant,
      ),
      choiceFieldLabel: 'Taille / option',
      additionalField: isSelected
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('N° CDC', style: TextStyle(fontSize: 12)),
                const SizedBox(height: 4),
                DropdownButtonFormField<String>(
                  initialValue:
                      candidates.any((item) => item.id == selectedItemId)
                          ? selectedItemId
                          : null,
                  isExpanded: true,
                  onChanged: candidates.isEmpty
                      ? null
                      : (itemId) => setState(
                            () => _selectedItemIdsByLine[lineKey] = itemId,
                          ),
                  decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.qr_code_2_outlined),
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  hint: Text(candidates.isEmpty
                      ? 'Aucun article disponible'
                      : 'Choisir le matériel'),
                  items: candidates
                      .map(
                        (item) => DropdownMenuItem<String>(
                          value: item.id,
                          child: Text(
                            _cdcLabel(item),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      )
                      .toList(),
                ),
              ],
            )
          : null,
    );
  }

  IconData _inventoryTypeIcon(String type) {
    final normalized = _normalizeRequestType(type);
    if (normalized.contains('bouteille')) return Icons.propane_tank_outlined;
    if (normalized.contains('gilet')) return Icons.checkroom_outlined;
    if (normalized.contains('detendeur')) return Icons.air;
    if (normalized.contains('ordinateur')) return Icons.watch_outlined;
    if (normalized.contains('palmes')) return Icons.directions_run_outlined;
    if (normalized.contains('lampe')) return Icons.flashlight_on_outlined;
    return Icons.inventory_2_outlined;
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

  String _lineKey(MaterialLoanRequestedLine line) =>
      '${line.typeId ?? line.typeName}|${line.variant}';

  String _normaliseCdc(String value) =>
      value.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');

  String _normaliseRequestedVariant(String value) {
    switch (_normaliseCdc(value)) {
      case 'SMALL':
        return 'S';
      case 'MEDIUM':
        return 'M';
      case 'LARGE':
        return 'L';
      default:
        return _normaliseCdc(value);
    }
  }

  bool _matchesRequestedLine(
      MaterialLoanRequestedLine line, MaterialLoanItem item) {
    final lineType = _normalizeRequestType(line.typeName);
    final itemType = _normalizeRequestType(item.typeLabel);
    final typeMatches =
        (line.typeId?.isNotEmpty == true && item.typeId == line.typeId) ||
            lineType.contains(itemType) ||
            itemType.contains(lineType);
    final requestedVariant = _normaliseRequestedVariant(line.variant);
    final itemVariant = _normaliseRequestedVariant(item.variantLabel);
    final requestedNumbers = RegExp(r'\d+')
        .allMatches(line.variant)
        .map((match) => match.group(0))
        .whereType<String>()
        .toList();
    final itemNumbers = RegExp(r'\d+')
        .allMatches(item.variantLabel)
        .map((match) => match.group(0))
        .whereType<String>()
        .toList();
    final hasSamePrimaryNumber = requestedNumbers.isNotEmpty &&
        itemNumbers.isNotEmpty &&
        requestedNumbers.first == itemNumbers.first;
    final variantMatches = requestedVariant.isEmpty ||
        requestedVariant == 'STANDARD' ||
        itemVariant.contains(requestedVariant) ||
        requestedVariant.contains(itemVariant) ||
        hasSamePrimaryNumber;
    return typeMatches && variantMatches;
  }

  List<MaterialLoanItem> _availableItemsForLine(
    MaterialLoanRequestedLine line,
    List<MaterialLoanItem> items,
  ) =>
      items
          .where(
            (item) => item.isBorrowable && _matchesRequestedLine(line, item),
          )
          .toList()
        ..sort((left, right) => left.code.compareTo(right.code));

  List<MaterialLoanItem> _alternativeItemsForLine(
    MaterialLoanRequestedLine line,
    List<MaterialLoanItem> items,
  ) {
    final lineType = _normalizeRequestType(line.typeName);
    return items
        .where(
          (item) =>
              item.isBorrowable &&
              ((line.typeId?.isNotEmpty == true &&
                      item.typeId == line.typeId) ||
                  _normalizeRequestType(item.typeLabel).contains(lineType) ||
                  lineType.contains(_normalizeRequestType(item.typeLabel))),
        )
        .toList()
      ..sort((left, right) => left.code.compareTo(right.code));
  }

  List<MaterialLoanItem> _assignedItems(
    List<MaterialLoanRequestedLine> lines,
    List<MaterialLoanItem> items,
  ) {
    final assigned = <MaterialLoanItem>[];
    for (final line in lines) {
      final selectedId = _selectedItemIdsByLine[_lineKey(line)];
      final matches = _availableItemsForLine(line, items)
          .where((item) => item.id == selectedId)
          .toList();
      if (matches.length == 1) assigned.add(matches.single);
    }
    return assigned.map((item) => item.id).toSet().length == assigned.length
        ? assigned
        : const <MaterialLoanItem>[];
  }

  String _cdcLabel(MaterialLoanItem item) {
    final code = item.code.trim();
    final cdc = code.toUpperCase().startsWith('CDC') ? code : 'CDC $code';
    final type = _normalizeRequestType(item.typeLabel);
    final details = <String>[];

    // A bottle is identified first by its usable volume; a BCD by its brand.
    // For computers and all other groups, brand/model is the clearest staff
    // identifier. Never repeat the inventory code as the second value.
    if (type.contains('bouteille')) {
      if (item.variantLabel != 'Standard') {
        details.add(item.variantLabel);
      }
    } else {
      if (item.brand?.trim().isNotEmpty == true) {
        details.add(item.brand!.trim());
      }
      if (item.model?.trim().isNotEmpty == true) {
        details.add(item.model!.trim());
      }
      if (details.isEmpty && item.variantLabel != 'Standard') {
        details.add(item.variantLabel);
      }
    }
    return details.isEmpty ? cdc : '$cdc · ${details.join(' · ')}';
  }

  Widget _buildCdcAssignmentCard(
    MaterialLoanRequestedLine line,
    List<MaterialLoanItem> items,
  ) {
    final lineKey = _lineKey(line);
    final strictCandidates = _availableItemsForLine(line, items);
    final alternativesAllowed = _alternativeAllowedByLine.contains(lineKey);
    final candidates = alternativesAllowed
        ? _alternativeItemsForLine(line, items)
        : strictCandidates;
    final selectedId = _selectedItemIdsByLine[_lineKey(line)];
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        color: AppColors.middenblauw.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.middenblauw.withValues(alpha: 0.45),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                _inventoryTypeIcon(line.typeName),
                color: AppColors.middenblauw,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  line.typeName,
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Taille / option',
                        style: TextStyle(fontSize: 12)),
                    const SizedBox(height: 4),
                    InputDecorator(
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      child: Text(line.variant),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 2,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('N° CDC', style: TextStyle(fontSize: 12)),
                    const SizedBox(height: 4),
                    DropdownButtonFormField<String>(
                      initialValue:
                          candidates.any((item) => item.id == selectedId)
                              ? selectedId
                              : null,
                      isExpanded: true,
                      onChanged: candidates.isEmpty
                          ? null
                          : (itemId) => setState(
                                () => _selectedItemIdsByLine[lineKey] = itemId,
                              ),
                      decoration: const InputDecoration(
                        prefixIcon: Icon(Icons.qr_code_2_outlined),
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      hint: Text(candidates.isEmpty
                          ? 'Aucun article disponible'
                          : 'Choisir le matériel'),
                      items: candidates
                          .map(
                            (item) => DropdownMenuItem<String>(
                              value: item.id,
                              child: Text(
                                _cdcLabel(item),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          )
                          .toList(),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (strictCandidates.isEmpty && !alternativesAllowed)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => setState(
                  () => _alternativeAllowedByLine.add(lineKey),
                ),
                icon: const Icon(Icons.swap_horiz_outlined),
                label: const Text('Remettre une autre taille / option'),
                style: TextButton.styleFrom(foregroundColor: AppColors.error),
              ),
            ),
          if (alternativesAllowed)
            const Padding(
              padding: EdgeInsets.only(bottom: 6),
              child: Text(
                'Écart par rapport à la demande : la taille ou l’option réellement remise sera enregistrée.',
                style: TextStyle(color: AppColors.error, fontSize: 12),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _addExtraMaterial(List<MaterialLoanItem> items) async {
    final grouped = <String, List<MaterialLoanItem>>{};
    for (final item in items.where((item) => item.isBorrowable)) {
      grouped.putIfAbsent(item.typeLabel, () => []).add(item);
    }
    if (grouped.isEmpty) return;
    String selectedType = grouped.keys.first;
    final extra = await showModalBottomSheet<MaterialLoanRequestedLine>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Ajouter du matériel',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              const Text(
                  'Kies eerst de productgroep; daarna kies je het concrete CDC-nummer.'),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: selectedType,
                isExpanded: true,
                decoration: const InputDecoration(
                    labelText: 'Productgroep', border: OutlineInputBorder()),
                items: grouped.keys
                    .map((type) =>
                        DropdownMenuItem(value: type, child: Text(type)))
                    .toList(),
                onChanged: (type) {
                  if (type != null) setSheetState(() => selectedType = type);
                },
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: () => Navigator.of(context).pop(
                    MaterialLoanRequestedLine(
                      typeId: grouped[selectedType]!.first.typeId,
                      typeName: selectedType,
                      variant: 'Standard',
                    ),
                  ),
                  icon: const Icon(Icons.add),
                  label: const Text('Toevoegen'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (extra != null && mounted) {
      setState(() {
        if (!_extraLines.any((line) => line.typeId == extra.typeId)) {
          _extraLines.add(extra);
        }
      });
    }
  }

  Future<void> _submit(
    List<MaterialLoanRequestedLine> lines,
    List<MaterialLoanItem> catalogItems,
  ) async {
    final member = _member;
    if (member == null) return;
    final assignedItems = _assignedItems(lines, catalogItems);
    if (assignedItems.length != lines.length) return;
    setState(() => _submitting = true);
    try {
      final loanId = await widget.loanService.createDirectLoan(
        clubId: widget.clubId,
        member: member,
        items: assignedItems,
        expectedReturnDate: _returnDate,
        createdByUserId: widget.createdByUserId,
        createdByName: widget.createdByName,
        notes: _notesController.text,
      );
      if (widget.initialRequestId != null) {
        await widget.service.markLoanRequestHandedOver(
          clubId: widget.clubId,
          requestId: widget.initialRequestId!,
          loanId: loanId,
          assignedItemIds: assignedItems.map((item) => item.id).toList(),
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Matériel remis et prêt enregistré.'),
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

class _PreparedLoanMemberSummary extends StatelessWidget {
  final String memberName;
  final DateTime returnDate;

  const _PreparedLoanMemberSummary({
    required this.memberName,
    required this.returnDate,
  });

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.94),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            const _LoanActionIcon(icon: Icons.person_outline),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    memberName,
                    style: const TextStyle(
                      color: AppColors.donkerblauw,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text('Retour prévu : ${_formatDate(returnDate)}'),
                ],
              ),
            ),
          ],
        ),
      );
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

/// Shared product-and-option picker used by both a member reservation and a
/// direct handover. Keeping this in one place prevents the two flows drifting.
class _MaterialChoiceCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final List<String> choices;
  final String? selectedChoice;
  final ValueChanged<bool> onSelected;
  final ValueChanged<String> onChoiceChanged;
  final Widget? additionalField;
  final String choiceFieldLabel;

  const _MaterialChoiceCard({
    required this.icon,
    required this.label,
    required this.choices,
    required this.selectedChoice,
    required this.onSelected,
    required this.onChoiceChanged,
    this.additionalField,
    this.choiceFieldLabel = 'Option',
  });

  @override
  Widget build(BuildContext context) {
    final selected = selectedChoice != null;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
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
          Row(
            children: [
              Icon(icon, color: AppColors.middenblauw),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Switch.adaptive(value: selected, onChanged: onSelected),
            ],
          ),
          if (selected) ...[
            const SizedBox(height: 10),
            if (additionalField == null)
              _buildChoiceField()
            else
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: _buildChoiceField()),
                  const SizedBox(width: 10),
                  Expanded(flex: 2, child: additionalField!),
                ],
              ),
          ],
        ],
      ),
    );
  }

  Widget _buildChoiceField() => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(choiceFieldLabel, style: const TextStyle(fontSize: 12)),
          const SizedBox(height: 4),
          DropdownButtonFormField<String>(
            initialValue: selectedChoice,
            isExpanded: true,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              isDense: true,
            ),
            items: choices
                .map(
                  (option) => DropdownMenuItem(
                    value: option,
                    child: Text(option, overflow: TextOverflow.ellipsis),
                  ),
                )
                .toList(),
            onChanged: (value) {
              if (value != null) onChoiceChanged(value);
            },
          ),
        ],
      );
}

class _MaterialRequestSheet extends StatefulWidget {
  final MaterialReturnService service;
  final String clubId;
  final String memberId;
  final String memberName;
  final String memberEmail;
  final MaterialLoanRequest? request;

  const _MaterialRequestSheet({
    required this.service,
    required this.clubId,
    required this.memberId,
    required this.memberName,
    required this.memberEmail,
    this.request,
  });

  @override
  State<_MaterialRequestSheet> createState() => _MaterialRequestSheetState();
}

class _MaterialRequestSheetState extends State<_MaterialRequestSheet> {
  final _notesController = TextEditingController();
  final Map<String, String?> _selectedChoices = {};
  late DateTime _requestedStartDate;
  late DateTime _expectedReturnDate;
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
      choices: ['Small', 'Medium', 'XL'],
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

  bool get _isEditing => widget.request != null;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _requestedStartDate = widget.request?.requestedStartDate ?? now;
    _expectedReturnDate = widget.request?.expectedReturnDate ??
        _requestedStartDate.add(const Duration(days: 7));
    _notesController.text = widget.request?.notes ?? '';
    for (final line
        in widget.request?.lines ?? const <MaterialLoanRequestLine>[]) {
      final category = _categories.where((item) => item.id == line.category);
      if (category.isNotEmpty) {
        final option = line.attributes['option']?.toString();
        _selectedChoices[line.category] =
            category.first.choices.contains(option)
                ? option
                : category.first.choices.first;
      }
    }
  }

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
              _isEditing ? 'Modifier ma demande' : 'Demande de pret',
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
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _pickStartDate,
                    icon: const Icon(Icons.event_available),
                    label: Text('Du ${_formatDate(_requestedStartDate)}'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _pickReturnDate,
                    icon: const Icon(Icons.event_busy),
                    label: Text('Au ${_formatDate(_expectedReturnDate)}'),
                  ),
                ),
              ],
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
                  final choice = _selectedChoices[category.id];
                  return _MaterialChoiceCard(
                    icon: category.icon,
                    label: category.label,
                    choices: category.choices,
                    selectedChoice: choice,
                    onSelected: (selected) =>
                        _toggleCategory(category, selected),
                    onChoiceChanged: (value) => setState(
                      () => _selectedChoices[category.id] = value,
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
                      : _isEditing
                          ? 'Enregistrer les modifications'
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
      firstDate: _requestedStartDate,
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() => _expectedReturnDate = picked);
    }
  }

  Future<void> _pickStartDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _requestedStartDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() {
        _requestedStartDate = picked;
        _expectedReturnDate = picked.add(const Duration(days: 7));
      });
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
      if (_isEditing) {
        await widget.service.updateLoanRequestLines(
          clubId: widget.clubId,
          requestId: widget.request!.id,
          lines: _selectedLines,
          requestedStartDate: _requestedStartDate,
          expectedReturnDate: _expectedReturnDate,
          notes: _notesController.text,
        );
      } else {
        await widget.service.submitLoanRequestLines(
          clubId: widget.clubId,
          memberId: widget.memberId,
          memberName: widget.memberName,
          memberEmail: widget.memberEmail,
          lines: _selectedLines,
          requestedStartDate: _requestedStartDate,
          expectedReturnDate: _expectedReturnDate,
          notes: _notesController.text,
        );
      }

      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_isEditing
              ? 'Demande modifiée.'
              : 'Demande envoyee au responsable materiel.'),
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

bool _isLoanLate(MaterialLoan loan) {
  final dueDate = loan.expectedReturnDate;
  if (dueDate == null) return false;
  final today = DateTime.now();
  return DateTime(dueDate.year, dueDate.month, dueDate.day)
      .isBefore(DateTime(today.year, today.month, today.day));
}

String _initials(String name) {
  final parts =
      name.trim().split(RegExp(r'\s+')).where((part) => part.isNotEmpty);
  return parts.take(2).map((part) => part[0].toUpperCase()).join();
}

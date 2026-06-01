import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/material_loan.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/material_return_service.dart';
import '../../utils/club_role_utils.dart';
import '../../widgets/empty_state_widget.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class MaterialReturnsScreen extends StatefulWidget {
  const MaterialReturnsScreen({super.key});

  @override
  State<MaterialReturnsScreen> createState() => _MaterialReturnsScreenState();
}

class _MaterialReturnsScreenState extends State<MaterialReturnsScreen> {
  final _service = MaterialReturnService();
  final _clubId = FirebaseConfig.defaultClubId;
  String _search = '';

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
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
                child: _RequestMaterialCard(
                  onTap: userId == null
                      ? null
                      : () => _openRequestSheet(
                            memberId: userId,
                            memberName: memberProvider.displayName,
                            memberEmail: memberProvider.email ?? '',
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
                    ? _buildReturnValidationList()
                    : _buildMemberRequests(userId),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildReturnValidationList() {
    return StreamBuilder<List<MaterialLoan>>(
      stream: _service.watchReturnableLoans(_clubId),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const LoadingWidget(
              message: 'Chargement des prets en cours...');
        }

        if (snapshot.hasError) {
          return EmptyStateWidget(
            icon: Icons.error_outline,
            title: 'Impossible de charger les retours',
            subtitle: snapshot.error.toString(),
          );
        }

        final loans = _filterLoans(snapshot.data ?? const []);
        if (loans.isEmpty) {
          return const EmptyStateWidget(
            icon: Icons.inventory_2_outlined,
            title: 'Aucun retour en attente',
            subtitle:
                'Utilisez le bouton ci-dessus pour encoder une demande de pret.',
          );
        }

        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          itemCount: loans.length,
          separatorBuilder: (_, __) => const SizedBox(height: 12),
          itemBuilder: (context, index) {
            final loan = loans[index];
            return _LoanReturnCard(
              loan: loan,
              onValidate: () => _openReturnSheet(loan),
            );
          },
        );
      },
    );
  }

  Widget _buildMemberRequests(String? userId) {
    if (userId == null) {
      return const EmptyStateWidget(
        icon: Icons.login_outlined,
        title: 'Connexion requise',
        subtitle: 'Connectez-vous pour demander du materiel.',
      );
    }

    return StreamBuilder<List<MaterialLoanRequest>>(
      stream: _service.watchMyLoanRequests(clubId: _clubId, memberId: userId),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const LoadingWidget(message: 'Chargement de vos demandes...');
        }

        if (snapshot.hasError) {
          return EmptyStateWidget(
            icon: Icons.error_outline,
            title: 'Impossible de charger vos demandes',
            subtitle: snapshot.error.toString(),
          );
        }

        final requests = snapshot.data ?? const [];
        if (requests.isEmpty) {
          return const EmptyStateWidget(
            icon: Icons.add_shopping_cart_outlined,
            title: 'Aucune demande en cours',
            subtitle:
                'Appuyez sur "Demander du materiel" pour choisir ce que vous voulez emprunter.',
          );
        }

        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          itemCount: requests.length,
          separatorBuilder: (_, __) => const SizedBox(height: 12),
          itemBuilder: (context, index) =>
              _LoanRequestCard(request: requests[index]),
        );
      },
    );
  }

  bool _canValidateReturns(MemberProvider memberProvider) {
    final role = memberProvider.appRole?.toLowerCase();
    if (role == 'admin' || role == 'superadmin' || role == 'validateur') {
      return true;
    }

    final normalized =
        ClubRoleUtils.normalizeRoles(memberProvider.clubStatuten);
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
        onSubmit: _validateReturn,
      ),
    );
  }

  Future<void> _openRequestSheet({
    required String memberId,
    required String memberName,
    required String memberEmail,
  }) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (context) => _MaterialRequestSheet(
        service: _service,
        clubId: _clubId,
        memberId: memberId,
        memberName: memberName,
        memberEmail: memberEmail,
      ),
    );
  }

  Future<void> _validateReturn(
    MaterialLoan loan,
    MaterialReturnDecision decision,
    double refundAmount,
    String notes,
  ) async {
    final authProvider = context.read<AuthProvider>();
    final memberProvider = context.read<MemberProvider>();
    final userId = authProvider.currentUser?.uid;
    if (userId == null) return;

    final messenger = ScaffoldMessenger.of(context);
    try {
      final result = await _service.validateReturn(
        clubId: _clubId,
        loan: loan,
        decision: decision,
        refundAmount: refundAmount,
        validatedByUserId: userId,
        validatedByName: memberProvider.displayName,
        notes: notes,
      );

      if (!mounted) return;
      Navigator.of(context).pop();
      final referenceText = result.paymentReference != null
          ? ' Reference: ${result.paymentReference}.'
          : '';
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            refundAmount > 0
                ? 'Retour valide. Demande de remboursement creee.$referenceText'
                : 'Retour valide. Aucune demande de remboursement creee.',
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

class _LoanReturnCard extends StatelessWidget {
  final MaterialLoan loan;
  final VoidCallback onValidate;

  const _LoanReturnCard({
    required this.loan,
    required this.onValidate,
  });

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
                          '${item.code} - ${item.name}',
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

class _RequestMaterialCard extends StatelessWidget {
  final VoidCallback? onTap;

  const _RequestMaterialCard({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: AppColors.middenblauw.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.add_shopping_cart_outlined,
                  color: AppColors.middenblauw,
                ),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Demander du materiel',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: AppColors.donkerblauw,
                      ),
                    ),
                    SizedBox(height: 3),
                    Text(
                      'Choisir le materiel et envoyer une demande.',
                      style: TextStyle(color: Colors.black54, fontSize: 13.5),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.middenblauw),
            ],
          ),
        ),
      ),
    );
  }
}

class _LoanRequestCard extends StatelessWidget {
  final MaterialLoanRequest request;

  const _LoanRequestCard({required this.request});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.pending_actions_outlined,
                  color: AppColors.middenblauw),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  request.status == 'approved'
                      ? 'Demande acceptee'
                      : 'Demande envoyee',
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                  ),
                ),
              ),
              _StatusPill(
                label: request.status == 'approved' ? 'Acceptee' : 'En attente',
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (request.expectedReturnDate != null)
            _InfoChip(
              icon: Icons.event_available,
              label: 'Retour ${_formatDate(request.expectedReturnDate!)}',
            ),
          const SizedBox(height: 10),
          ...request.items.map(
            (item) => Padding(
              padding: const EdgeInsets.only(bottom: 5),
              child: Text(
                item.displayName,
                style: TextStyle(color: Colors.grey.shade800, fontSize: 13.5),
              ),
            ),
          ),
          if (request.items.isEmpty)
            Text(
              '${request.itemIds.length} article(s) demande(s)',
              style: TextStyle(color: Colors.grey.shade700),
            ),
        ],
      ),
    );
  }
}

class _ReturnValidationSheet extends StatefulWidget {
  final MaterialLoan loan;
  final Future<void> Function(
    MaterialLoan loan,
    MaterialReturnDecision decision,
    double refundAmount,
    String notes,
  ) onSubmit;

  const _ReturnValidationSheet({
    required this.loan,
    required this.onSubmit,
  });

  @override
  State<_ReturnValidationSheet> createState() => _ReturnValidationSheetState();
}

class _ReturnValidationSheetState extends State<_ReturnValidationSheet> {
  final _notesController = TextEditingController();
  late final TextEditingController _refundController;
  MaterialReturnDecision _decision = MaterialReturnDecision.fullRefund;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _refundController = TextEditingController(
      text: widget.loan.cautionAmount.toStringAsFixed(2),
    );
  }

  @override
  void dispose() {
    _notesController.dispose();
    _refundController.dispose();
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
            Text(
              'Validation retour',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: AppColors.donkerblauw,
                  ),
            ),
            const SizedBox(height: 4),
            Text(
              '${widget.loan.memberName} - ${widget.loan.loanNumber}',
              style: TextStyle(color: Colors.grey.shade700),
            ),
            const SizedBox(height: 18),
            ...widget.loan.items.map(
              (item) => CheckboxListTile(
                value: true,
                onChanged: (_) {},
                dense: true,
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                title: Text('${item.code} - ${item.name}'),
                subtitle: item.serialNumber == null
                    ? null
                    : Text('Serie ${item.serialNumber}'),
              ),
            ),
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
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Montant a rembourser',
                suffixText: 'EUR',
                border: OutlineInputBorder(),
              ),
            ),
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
                    : const Icon(Icons.verified_outlined),
                label:
                    Text(_submitting ? 'Validation...' : 'Valider le retour'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.success,
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

  Future<void> _submit() async {
    final refundAmount = double.tryParse(
          _refundController.text.trim().replaceAll(',', '.'),
        ) ??
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

    setState(() => _submitting = true);
    await widget.onSubmit(
      widget.loan,
      _decision,
      refundAmount,
      _notesController.text,
    );
    if (mounted) setState(() => _submitting = false);
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
  final _searchController = TextEditingController();
  final Set<String> _selectedItemIds = {};
  final List<MaterialLoanItem> _selectedItems = [];
  DateTime _expectedReturnDate = DateTime.now().add(const Duration(days: 7));
  String _search = '';
  String _typeFilter = 'Tous';
  bool _submitting = false;

  @override
  void dispose() {
    _notesController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(18, 12, 18, bottomInset + 18),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.78,
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
              'Seul le materiel disponible apparait ici. Le responsable confirmera la sortie et la caution.',
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
            TextField(
              controller: _searchController,
              onChanged: (value) => setState(() => _search = value),
              decoration: const InputDecoration(
                labelText: 'Rechercher',
                hintText: 'Type, code, marque, modele, serie...',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            Expanded(
              child: StreamBuilder<List<MaterialLoanItem>>(
                stream: widget.service.watchBorrowableItems(widget.clubId),
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const LoadingWidget(
                      message: 'Chargement du materiel disponible...',
                    );
                  }

                  if (snapshot.hasError) {
                    return EmptyStateWidget(
                      icon: Icons.error_outline,
                      title: 'Impossible de charger le materiel',
                      subtitle: snapshot.error.toString(),
                    );
                  }

                  final items = snapshot.data ?? const [];
                  if (items.isEmpty) {
                    return const EmptyStateWidget(
                      icon: Icons.inventory_2_outlined,
                      title: 'Aucun materiel disponible',
                      subtitle:
                          'Le responsable peut toujours encoder un pret depuis CalyCompta.',
                    );
                  }

                  final typeFilters = _typeFiltersFor(items);
                  final filteredItems = _filterItems(items);

                  return Column(
                    children: [
                      SizedBox(
                        height: 38,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: typeFilters.length,
                          separatorBuilder: (_, __) => const SizedBox(width: 6),
                          itemBuilder: (context, index) {
                            final label = typeFilters[index];
                            final selected = _typeFilter == label;
                            return ChoiceChip(
                              label: Text(
                                _compactTypeFilterLabel(label),
                                overflow: TextOverflow.ellipsis,
                              ),
                              selected: selected,
                              onSelected: (_) =>
                                  setState(() => _typeFilter = label),
                              visualDensity: VisualDensity.compact,
                              labelPadding:
                                  const EdgeInsets.symmetric(horizontal: 4),
                              materialTapTargetSize:
                                  MaterialTapTargetSize.shrinkWrap,
                              selectedColor:
                                  AppColors.middenblauw.withValues(alpha: 0.18),
                              labelStyle: TextStyle(
                                color: selected
                                    ? AppColors.donkerblauw
                                    : Colors.grey.shade700,
                                fontWeight: selected
                                    ? FontWeight.w800
                                    : FontWeight.w600,
                              ),
                            );
                          },
                        ),
                      ),
                      const SizedBox(height: 8),
                      Expanded(
                        child: filteredItems.isEmpty
                            ? const EmptyStateWidget(
                                icon: Icons.search_off,
                                title: 'Aucun resultat',
                                subtitle:
                                    'Essayez un autre type ou une autre recherche.',
                              )
                            : ListView.separated(
                                itemCount: filteredItems.length,
                                separatorBuilder: (_, __) => Divider(
                                  color: Colors.grey.shade200,
                                  height: 1,
                                ),
                                itemBuilder: (context, index) {
                                  final item = filteredItems[index];
                                  final selected =
                                      _selectedItemIds.contains(item.id);
                                  return CheckboxListTile(
                                    value: selected,
                                    onChanged: (_) => _toggleItem(item),
                                    contentPadding: EdgeInsets.zero,
                                    controlAffinity:
                                        ListTileControlAffinity.leading,
                                    title: Text(
                                      _displayTypeLabel(item.typeLabel),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        color: AppColors.donkerblauw,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                    subtitle: Text(item.technicalDetails),
                                  );
                                },
                              ),
                      ),
                    ],
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
                      : 'Envoyer la demande (${_selectedItems.length})',
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

  void _toggleItem(MaterialLoanItem item) {
    setState(() {
      if (_selectedItemIds.contains(item.id)) {
        _selectedItemIds.remove(item.id);
        _selectedItems.removeWhere((selected) => selected.id == item.id);
      } else {
        _selectedItemIds.add(item.id);
        _selectedItems.add(item);
      }
    });
  }

  List<String> _typeFiltersFor(List<MaterialLoanItem> items) {
    final labels = items.map((item) => item.typeLabel).toSet().toList()..sort();
    return ['Tous', ...labels];
  }

  String _compactTypeFilterLabel(String label) {
    if (label == 'Tous') return 'Tous';

    final normalized = label.toLowerCase();
    if (normalized.contains('bouteille')) return 'Btl.';
    if (normalized.contains('compas') || normalized.contains('boussole')) {
      return 'Comp.';
    }
    if (normalized.contains('detendeur') ||
        normalized.contains('détendeur') ||
        normalized.contains('regulator')) {
      return 'Dét.';
    }
    if (normalized.contains('gilet')) return 'Gilet';
    if (normalized.contains('ordinateur')) return 'Ordi';
    if (normalized.contains('lampe')) return 'Lampe';

    return label.length > 8 ? '${label.substring(0, 8)}.' : label;
  }

  String _displayTypeLabel(String label) {
    final normalized = label.toLowerCase();
    if (normalized.contains('gilet stabilisateur')) return 'Gilet stab. (BCD)';
    if (normalized.contains('bouteille')) return 'Bouteille';
    if (normalized.contains('compas') || normalized.contains('boussole')) {
      return 'Compas / boussole';
    }
    if (normalized.contains('detendeur') || normalized.contains('détendeur')) {
      return 'Détendeur';
    }
    return label;
  }

  List<MaterialLoanItem> _filterItems(List<MaterialLoanItem> items) {
    final term = _search.trim().toLowerCase();
    return items.where((item) {
      if (_typeFilter != 'Tous' && item.typeLabel != _typeFilter) {
        return false;
      }
      if (term.isEmpty) return true;

      final haystack = [
        item.typeLabel,
        item.code,
        item.name,
        item.brand,
        item.model,
        item.serialNumber,
      ].whereType<String>().join(' ').toLowerCase();
      return haystack.contains(term);
    }).toList();
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
    if (_selectedItems.isEmpty) {
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
      await widget.service.submitLoanRequest(
        clubId: widget.clubId,
        memberId: widget.memberId,
        memberName: widget.memberName,
        memberEmail: widget.memberEmail,
        items: _selectedItems,
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

class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String label;

  const _InfoChip({
    required this.icon,
    required this.label,
  });

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

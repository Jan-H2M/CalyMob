import 'package:flutter/material.dart';
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
import '../../widgets/ocean/ocean_gradient_background.dart';

class MaterialReturnsScreen extends StatefulWidget {
  const MaterialReturnsScreen({super.key});

  @override
  State<MaterialReturnsScreen> createState() => _MaterialReturnsScreenState();
}

class _MaterialReturnsScreenState extends State<MaterialReturnsScreen> {
  final _service = MaterialReturnService();
  final _loanService = MaterialLoanService();
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
                    ? _buildReturnValidationList()
                    : _buildMemberLoans(userId),
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
              message: 'Chargement de votre matériel...');
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
    if (role == 'admin' || role == 'superadmin' || role == 'validateur') {
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
      builder: (context) =>
          _ReturnValidationSheet(loan: loan, onSubmit: _validateReturn),
    );
  }

  Future<void> _openLoanSheet({
    required String createdByUserId,
    required String createdByName,
  }) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (context) => _DirectLoanSheet(
        service: _service,
        loanService: _loanService,
        clubId: _clubId,
        createdByUserId: createdByUserId,
        createdByName: createdByName,
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
      await _service.validateReturn(
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
        DateTime(dueDate.year, dueDate.month, dueDate.day)
            .isBefore(DateTime(today.year, today.month, today.day));
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
  final Future<void> Function(
    MaterialLoan loan,
    MaterialReturnDecision decision,
    double refundAmount,
    String notes,
  ) onSubmit;

  const _ReturnValidationSheet({required this.loan, required this.onSubmit});

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
                title: Text('${item.inventoryLabel} · ${item.name}'),
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
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
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
      ),
    );
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
  final Map<String, String?> _selectedInventoryByType = {};
  final Map<String, String> _selectedVariantByType = {};
  List<MaterialLoanMember> _members = const [];
  MaterialLoanMember? _member;
  DateTime _returnDate = DateTime.now().add(const Duration(days: 7));
  bool _loadingMembers = true;
  bool _paymentConfirmed = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
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
          stream: widget.service.watchBorrowableItems(widget.clubId),
          builder: (context, snapshot) {
            final items = snapshot.data ?? const <MaterialLoanItem>[];
            final grouped = <String, List<MaterialLoanItem>>{};
            for (final item in items) {
              grouped.putIfAbsent(item.typeLabel, () => []).add(item);
            }
            final selectedItems = items
                .where(
                    (item) => _selectedInventoryByType.values.contains(item.id))
                .toList();
            final canSubmit = _member != null &&
                selectedItems.isNotEmpty &&
                _paymentConfirmed &&
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
                Text(
                  'Nouveau prêt',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: AppColors.donkerblauw,
                      ),
                ),
                const SizedBox(height: 5),
                const Text(
                  'Le responsable choisit directement le membre et son matériel. Une seule pièce par type est possible.',
                  style: TextStyle(color: Colors.black54),
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: ListView(
                    children: [
                      _buildMemberPicker(),
                      const SizedBox(height: 14),
                      OutlinedButton.icon(
                        onPressed: _pickReturnDate,
                        icon: const Icon(Icons.event_available_outlined),
                        label: Text(
                          'Retour prévu : ${_formatDate(_returnDate)}',
                        ),
                      ),
                      const SizedBox(height: 14),
                      const Text(
                        'Matériel disponible',
                        style: TextStyle(
                          color: AppColors.donkerblauw,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Choisissez d’abord la taille ou variante, puis le numéro d’inventaire exact.',
                        style: TextStyle(color: Colors.black54, fontSize: 13),
                      ),
                      const SizedBox(height: 10),
                      if (snapshot.connectionState == ConnectionState.waiting)
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
                            entry.key,
                            entry.value,
                          ),
                        ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: _notesController,
                        minLines: 2,
                        maxLines: 4,
                        decoration: const InputDecoration(
                          labelText: 'Note de remise',
                          hintText:
                              'État constaté, remarque, incident existant…',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.blueGrey.shade50,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: SwitchListTile.adaptive(
                          contentPadding: EdgeInsets.zero,
                          value: _paymentConfirmed,
                          onChanged: (value) =>
                              setState(() => _paymentConfirmed = value),
                          title: const Text(
                            'Caution de 100,00 EUR confirmée',
                            style: TextStyle(
                              color: AppColors.donkerblauw,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          subtitle: const Text(
                            'À cocher seulement après avoir constaté le paiement sur place. Le paiement à distance sera relié séparément au statut bancaire.',
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: canSubmit ? () => _submit(selectedItems) : null,
                    icon: _submitting
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.assignment_turned_in_outlined),
                    label: Text(
                      _submitting
                          ? 'Création...'
                          : 'Créer et remettre le prêt (${selectedItems.length})',
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.middenblauw,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                  ),
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
              labelText: 'Rechercher un membre',
              hintText: _loadingMembers ? 'Chargement...' : 'Nom ou prénom',
              prefixIcon: const Icon(Icons.search),
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
    final selectedId = _selectedInventoryByType[type];
    MaterialLoanItem? selected;
    for (final item in items) {
      if (item.id == selectedId) {
        selected = item;
        break;
      }
    }
    final variants = items.map((item) => item.variantLabel).toSet().toList()
      ..sort();
    final selectedVariant = _selectedVariantByType[type] ??
        selected?.variantLabel ??
        variants.first;
    final candidates = items
        .where((item) => item.variantLabel == selectedVariant)
        .toList()
      ..sort(
          (left, right) => left.inventoryLabel.compareTo(right.inventoryLabel));
    final isSelected = _selectedInventoryByType.containsKey(type);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      decoration: BoxDecoration(
        color: isSelected
            ? AppColors.middenblauw.withValues(alpha: 0.08)
            : Colors.grey.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isSelected ? AppColors.middenblauw : Colors.grey.shade200,
        ),
      ),
      child: Column(
        children: [
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            value: isSelected,
            onChanged: (value) => setState(() {
              if (value) {
                _selectedInventoryByType[type] = null;
              } else {
                _selectedInventoryByType.remove(type);
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
            subtitle: Text(isSelected
                ? 'Choisir la variante et le numéro'
                : 'Non sélectionné'),
          ),
          if (isSelected) ...[
            DropdownButtonFormField<String>(
              initialValue: selectedVariant,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Taille / variante',
                border: OutlineInputBorder(),
              ),
              items: variants
                  .map((variant) => DropdownMenuItem(
                        value: variant,
                        child: Text(variant),
                      ))
                  .toList(),
              onChanged: (variant) {
                if (variant == null) return;
                setState(() {
                  _selectedVariantByType[type] = variant;
                  _selectedInventoryByType[type] = null;
                });
              },
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: selectedId,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'N° inventaire / série',
                border: OutlineInputBorder(),
              ),
              items: [
                const DropdownMenuItem<String>(
                  value: null,
                  child: Text('Aucun article'),
                ),
                ...candidates.map(
                  (item) => DropdownMenuItem(
                    value: item.id,
                    child: Text(
                      '${item.inventoryLabel} · ${item.technicalDetails}',
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
              ],
              onChanged: (itemId) => setState(
                () => _selectedInventoryByType[type] = itemId,
              ),
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

  Future<void> _submit(List<MaterialLoanItem> items) async {
    final member = _member;
    if (member == null) return;
    setState(() => _submitting = true);
    try {
      await widget.loanService.createDirectLoan(
        clubId: widget.clubId,
        member: member,
        items: items,
        expectedReturnDate: _returnDate,
        createdByUserId: widget.createdByUserId,
        createdByName: widget.createdByName,
        notes: _notesController.text,
      );
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Prêt créé et matériel remis.'),
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

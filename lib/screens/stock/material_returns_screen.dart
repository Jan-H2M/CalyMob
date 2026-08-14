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
              const Icon(
                Icons.pending_actions_outlined,
                color: AppColors.middenblauw,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  _requestTitle(request.status),
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                  ),
                ),
              ),
              _StatusPill(label: _requestStatusLabel(request.status)),
            ],
          ),
          const SizedBox(height: 10),
          if (request.expectedReturnDate != null)
            _InfoChip(
              icon: Icons.event_available,
              label: 'Retour ${_formatDate(request.expectedReturnDate!)}',
            ),
          const SizedBox(height: 10),
          ...(request.lines.isNotEmpty
                  ? request.lines.map((line) => line.label)
                  : request.items.map((item) => item.displayName))
              .map(
            (label) => Padding(
              padding: const EdgeInsets.only(bottom: 5),
              child: Text(
                label,
                style: TextStyle(
                  color: Colors.grey.shade800,
                  fontSize: 13.5,
                ),
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

  String _requestTitle(String status) {
    switch (status) {
      case 'validated':
      case 'approved':
        return 'Demande acceptee';
      case 'ready':
        return 'Pret a retirer';
      case 'handed_over':
        return 'Materiel remis';
      case 'refused':
        return 'Demande refusee';
      default:
        return 'Demande envoyee';
    }
  }

  String _requestStatusLabel(String status) {
    switch (status) {
      case 'validated':
      case 'approved':
        return 'Acceptee';
      case 'ready':
        return 'A retirer';
      case 'handed_over':
        return 'Remis';
      case 'refused':
        return 'Refusee';
      default:
        return 'En attente';
    }
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
  final Map<String, int> _quantities = {};
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
              'Choisissez une catégorie et une taille. Le responsable attribuera le matériel réel lors de la remise.',
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
                  final quantity = _quantities[category.id] ?? 1;

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
                              ? Text('$choice · quantité $quantity')
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
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              const Text(
                                'Quantité',
                                style: TextStyle(fontWeight: FontWeight.w600),
                              ),
                              const Spacer(),
                              IconButton(
                                onPressed: quantity <= 1
                                    ? null
                                    : () => setState(
                                          () => _quantities[category.id] =
                                              quantity - 1,
                                        ),
                                icon: const Icon(Icons.remove_circle_outline),
                              ),
                              Text(
                                '$quantity',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              IconButton(
                                onPressed: quantity >= 4
                                    ? null
                                    : () => setState(
                                          () => _quantities[category.id] =
                                              quantity + 1,
                                        ),
                                icon: const Icon(Icons.add_circle_outline),
                              ),
                            ],
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
          quantity: _quantities[category.id] ?? 1,
        ),
      )
      .toList();

  void _toggleCategory(_MaterialRequestCategory category, bool selected) {
    setState(() {
      if (!selected) {
        _selectedChoices.remove(category.id);
        _quantities.remove(category.id);
      } else {
        _selectedChoices[category.id] = category.choices.first;
        _quantities[category.id] = 1;
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

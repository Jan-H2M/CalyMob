import 'package:flutter/material.dart';

import '../../config/app_colors.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

/// Local-only COM-059 prototype.
///
/// This screen deliberately uses demo data and does not write to Firestore,
/// send an e-mail, or initiate a bank transfer. It is the Flutter counterpart
/// of the organizer finance mock-up used to review the workflow before wiring
/// it to the real loan and accounting services.
class MaterialFinanceMockupScreen extends StatefulWidget {
  const MaterialFinanceMockupScreen({super.key});

  @override
  State<MaterialFinanceMockupScreen> createState() =>
      _MaterialFinanceMockupScreenState();
}

class _MaterialFinanceMockupScreenState
    extends State<MaterialFinanceMockupScreen> {
  int _tab = 0;
  bool _refundCreated = false;
  bool _refundPaid = false;
  String _returnMember = 'Alice DUPONT';
  final Map<String, String> _returnStates = {};

  final List<_DemoRequest> _requests = const [
    _DemoRequest(
      name: 'Alice DUPONT',
      initials: 'AD',
      returnDate: '21/08/2026',
      lines: [
        _DemoLine('Gilet stabilisateur', 'XL'),
        _DemoLine('Ordinateur', '1 article'),
      ],
    ),
    _DemoRequest(
      name: 'Bruno MARTIN',
      initials: 'BM',
      returnDate: '22/08/2026',
      lines: [
        _DemoLine('Bouteille', '12 L · DIN'),
        _DemoLine('Palmes réglables', '42/43'),
      ],
    ),
    _DemoRequest(
      name: 'Camille LEROY',
      initials: 'CL',
      returnDate: '19/08/2026',
      lines: [_DemoLine('Gilet stabilisateur', 'M')],
    ),
    _DemoRequest(
      name: 'David PEETERS',
      initials: 'DP',
      returnDate: '18/08/2026',
      lines: [
        _DemoLine('Détendeur', '1 article'),
        _DemoLine('Bouteille', '10 L · DIN'),
        _DemoLine('Compas / Boussole', '1 article'),
      ],
    ),
  ];

  final Map<String, List<_DemoItem>> _inventory = const {
    'Gilet stabilisateur': [
      _DemoItem(
        'GILET-036',
        'MARES · série M36',
        'XL',
      ),
      _DemoItem(
        'GILET-009',
        'SCUBAPRO T ONE',
        'XL',
      ),
      _DemoItem(
        'GILET-014',
        'AQUALUNG WAVE',
        'M',
      ),
    ],
    'Ordinateur': [
      _DemoItem(
        'ORD-006',
        'CRESSI LEONARDO',
        'CRESSI',
      ),
      _DemoItem(
        'ORD-008',
        'CRESSI LEONARDO',
        'CRESSI',
      ),
    ],
    'Bouteille': [
      _DemoItem(
        'BT-007',
        'FABER · série 79/12399',
        '12 L · DIN',
      ),
      _DemoItem(
        'BT-002',
        'FABER · série 85/3002/27',
        '12 L · DIN',
      ),
      _DemoItem(
        'BT-011',
        'FABER · série 85/3002/56',
        '10 L · DIN',
      ),
    ],
    'Palmes réglables': [
      _DemoItem(
        'PAL-042',
        'MARES AVANTI',
        '42/43',
      ),
      _DemoItem(
        'PAL-038',
        'SCUBAPRO',
        '38/40',
      ),
    ],
    'Détendeur': [
      _DemoItem(
        'DET-008',
        'SCUBAPRO MK2/R195',
        'SCUBAPRO',
      ),
      _DemoItem(
        'DET-007',
        'SCUBAPRO MK2/R195',
        'SCUBAPRO',
      ),
    ],
    'Compas / Boussole': [
      _DemoItem(
        'COMP-003',
        'SUUNTO SK-8',
        'SUUNTO',
      ),
    ],
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'COM-059 · Flux financier',
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
              const Padding(
                padding: EdgeInsets.fromLTRB(18, 8, 18, 10),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Mock-up Flutter · aucune donnée réelle ni paiement réel',
                    style: TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ),
              ),
              _buildTabs(),
              Expanded(child: _buildTabContent()),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTabs() {
    const labels = ['Demandes', 'Prêts actifs', 'Retours', 'Finances'];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (var index = 0; index < labels.length; index++)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  selected: _tab == index,
                  label: Text(
                    index == 0
                        ? 'Demandes 4'
                        : index == 2
                            ? 'Retours 1'
                            : labels[index],
                  ),
                  showCheckmark: false,
                  selectedColor: Colors.white,
                  backgroundColor: Colors.white.withValues(alpha: 0.78),
                  labelStyle: TextStyle(
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.w700,
                  ),
                  onSelected: (_) => setState(() => _tab = index),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildTabContent() {
    switch (_tab) {
      case 1:
        return _buildActiveLoans();
      case 2:
        return _buildReturns();
      case 3:
        return _buildFinances();
      default:
        return _buildRequests();
    }
  }

  Widget _buildRequests() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
      children: [
        _PageHeader(
          title: 'Demandes de prêt',
          subtitle:
              'Traiter une demande CalyMob ou composer directement un paquet pour un membre.',
          action: FilledButton.icon(
            onPressed: _openManualComposer,
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Composer pour un membre'),
          ),
        ),
        const SizedBox(height: 12),
        ..._requests.map(_buildRequestCard),
      ],
    );
  }

  Widget _buildRequestCard(_DemoRequest request) {
    return _SurfaceCard(
      margin: const EdgeInsets.only(bottom: 12),
      onTap: () => _openRequestAssignment(request),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            backgroundColor: AppColors.lichtblauw.withValues(alpha: 0.25),
            foregroundColor: AppColors.donkerblauw,
            child: Text(request.initials),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  request.name,
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                ...request.lines.map(
                  (line) => Text(
                    '${line.category} · ${line.option}',
                    style: const TextStyle(color: Colors.black54),
                  ),
                ),
                const SizedBox(height: 7),
                Text(
                  'Retour prévu · ${request.returnDate}',
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                ),
              ],
            ),
          ),
          const _StatusPill(label: 'Nouveau', color: Colors.orange),
          const Icon(Icons.chevron_right, color: AppColors.middenblauw),
        ],
      ),
    );
  }

  Widget _buildActiveLoans() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
      children: [
        const _PageHeader(
          title: 'Prêts actifs',
          subtitle:
              'Le matériel est remis uniquement après confirmation de la caution.',
        ),
        _SurfaceCard(
          child: Row(
            children: [
              const Icon(Icons.inventory_2_outlined,
                  color: AppColors.middenblauw, size: 30),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Alice DUPONT',
                        style: TextStyle(
                            color: AppColors.donkerblauw,
                            fontWeight: FontWeight.w800,
                            fontSize: 16)),
                    SizedBox(height: 3),
                    Text('PRET-2026-0012 · 2 articles'),
                  ],
                ),
              ),
              _StatusPill(label: 'Caution à payer', color: Colors.orange),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _InfoBanner(
          icon: Icons.lock_outline,
          text:
              'La remise est bloquée jusqu’à une confirmation bancaire ou une confirmation manuelle tracée.',
        ),
      ],
    );
  }

  Widget _buildReturns() {
    final request = _requests.firstWhere((item) => item.name == _returnMember);
    final items = request.lines
        .map((line) => _inventory[line.category]?.first)
        .whereType<_DemoItem>()
        .toList();
    final allChecked = items.every((item) => _returnStates[item.label] != null);
    final retained = items.fold<double>(
      0,
      (total, item) =>
          total +
          (_returnStates[item.label] == 'missing'
              ? 40
              : _returnStates[item.label] == 'damaged'
                  ? 20
                  : 0),
    );
    final refund = 120 - retained;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
      children: [
        const _PageHeader(
          title: 'Retours de matériel',
          subtitle:
              'Choisir le membre, contrôler chaque article et préparer le remboursement.',
        ),
        _SurfaceCard(
          child: DropdownButtonFormField<String>(
            initialValue: _returnMember,
            decoration: const InputDecoration(
              labelText: 'Student / prêt',
              border: OutlineInputBorder(),
            ),
            items: _requests
                .map((item) => DropdownMenuItem(
                      value: item.name,
                      child: Text('${item.name} · PRET-2026-0012'),
                    ))
                .toList(),
            onChanged: (value) => setState(() {
              _returnMember = value ?? _returnMember;
              _returnStates.clear();
            }),
          ),
        ),
        const SizedBox(height: 12),
        ...items.map(
          (item) => _SurfaceCard(
            margin: const EdgeInsets.only(bottom: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.label,
                    style: const TextStyle(
                        color: AppColors.donkerblauw,
                        fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: _returnStates[item.label],
                  decoration: const InputDecoration(
                    labelText: 'État au retour',
                    border: OutlineInputBorder(),
                  ),
                  items: const [
                    DropdownMenuItem(
                      value: 'complete',
                      child: Text('Complet et en bon état'),
                    ),
                    DropdownMenuItem(
                      value: 'damaged',
                      child: Text('Endommagé · retenue 20 EUR'),
                    ),
                    DropdownMenuItem(
                      value: 'missing',
                      child: Text('Manquant · retenue 40 EUR'),
                    ),
                  ],
                  onChanged: (value) => setState(() {
                    if (value == null) {
                      _returnStates.remove(item.label);
                    } else {
                      _returnStates[item.label] = value;
                    }
                  }),
                ),
              ],
            ),
          ),
        ),
        _SurfaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                allChecked ? 'Contrôle complet' : 'Contrôle à terminer',
                style: TextStyle(
                  color:
                      allChecked ? AppColors.success : Colors.orange.shade800,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              _AmountRow(label: 'Caution reçue', value: '120,00 EUR'),
              _AmountRow(
                label: 'Retenue',
                value: '${retained.toStringAsFixed(2)} EUR',
              ),
              _AmountRow(
                label: 'À rembourser',
                value: '${refund.toStringAsFixed(2)} EUR',
                emphasized: true,
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: allChecked
                      ? () => setState(() => _refundCreated = true)
                      : null,
                  icon: Icon(
                    _refundCreated
                        ? Icons.check_circle_outline
                        : Icons.send_outlined,
                  ),
                  label: Text(_refundCreated
                      ? 'Remboursement demandé ✓'
                      : 'Créer la demande de remboursement'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildFinances() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
      children: [
        const _PageHeader(
          title: 'Finances du prêt',
          subtitle:
              'Deux files distinctes : cautions à recevoir et remboursements à exécuter.',
        ),
        _SurfaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Cautions à recevoir',
                  style: TextStyle(
                      color: AppColors.donkerblauw,
                      fontWeight: FontWeight.w800,
                      fontSize: 16)),
              const SizedBox(height: 12),
              const _AmountRow(label: 'Membre', value: 'Alice DUPONT'),
              const _AmountRow(
                label: 'Référence',
                value: '+++PRET-2026-0012+++',
              ),
              const _AmountRow(label: 'Montant', value: '120,00 EUR'),
              const _StatusPill(label: 'À payer', color: Colors.orange),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _SurfaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Remboursements à exécuter',
                  style: TextStyle(
                      color: AppColors.donkerblauw,
                      fontWeight: FontWeight.w800,
                      fontSize: 16)),
              const SizedBox(height: 12),
              if (!_refundCreated)
                const _InfoBanner(
                  icon: Icons.inbox_outlined,
                  text: 'La liste se remplit après le contrôle d’un retour.',
                )
              else ...[
                _AmountRow(label: 'Membre', value: _returnMember),
                const _AmountRow(label: 'Caution reçue', value: '120,00 EUR'),
                const _AmountRow(label: 'Montant proposé', value: '120,00 EUR'),
                _StatusPill(
                  label: _refundPaid ? 'Exécuté' : 'À exécuter',
                  color: _refundPaid ? AppColors.success : Colors.orange,
                ),
                const SizedBox(height: 12),
                if (!_refundPaid)
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () => setState(() => _refundPaid = true),
                      icon: const Icon(Icons.account_balance_outlined),
                      label: const Text('Marquer comme payé'),
                    ),
                  )
                else
                  const _InfoBanner(
                    icon: Icons.check_circle_outline,
                    text:
                        'Remboursement enregistré. La penningmeester peut ensuite ajouter la référence bancaire.',
                  ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        const _InfoBanner(
          icon: Icons.info_outline,
          text:
              'La caution est une garantie remboursable, pas un revenu. Un éventuel tarif de location reste une transaction séparée.',
        ),
      ],
    );
  }

  Future<void> _openManualComposer() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      builder: (_) => _PackageComposerSheet(
        inventory: _inventory,
        requests: _requests,
      ),
    );
  }

  Future<void> _openRequestAssignment(_DemoRequest request) async {
    final selected = await showModalBottomSheet<Map<String, _DemoItem>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      builder: (_) => _RequestAssignmentSheet(
        request: request,
        inventory: _inventory,
      ),
    );
    if (!mounted || selected == null) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      builder: (_) => _PackageComposerSheet(
        inventory: _inventory,
        requests: _requests,
        initialMember: request.name,
        initialSelection: selected,
        initialStep: 2,
      ),
    );
  }
}

class _PackageComposerSheet extends StatefulWidget {
  final Map<String, List<_DemoItem>> inventory;
  final List<_DemoRequest> requests;
  final String? initialMember;
  final Map<String, _DemoItem>? initialSelection;
  final int initialStep;

  const _PackageComposerSheet({
    required this.inventory,
    required this.requests,
    this.initialMember,
    this.initialSelection,
    this.initialStep = 0,
  });

  @override
  State<_PackageComposerSheet> createState() => _PackageComposerSheetState();
}

class _PackageComposerSheetState extends State<_PackageComposerSheet> {
  late int _step;
  late int _furthestStep;
  late String? _member;
  late Map<String, _DemoItem> _selection;
  DateTime _returnDate = DateTime.now().add(const Duration(days: 7));
  String _paymentMode = 'remote';
  String _paymentStatus = 'unpaid';
  String _handoverStatus = 'blocked';

  @override
  void initState() {
    super.initState();
    _step = widget.initialStep;
    _furthestStep = widget.initialStep;
    _member = widget.initialMember;
    _selection = {...?widget.initialSelection};
  }

  void _goToStep(int target) {
    // The organizer can revisit any step already reached, but cannot skip
    // the required member and inventory choices.
    if (target > _furthestStep) return;
    setState(() => _step = target);
  }

  void _setStep(int target) {
    setState(() {
      _step = target;
      if (target > _furthestStep) _furthestStep = target;
    });
  }

  Future<void> _pickReturnDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _returnDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 730)),
      helpText: 'Choisir la date de retour prévue',
      cancelText: 'Annuler',
      confirmText: 'Valider',
    );
    if (picked != null && mounted) {
      setState(() => _returnDate = picked);
    }
  }

  String _formatReturnDate(DateTime value) {
    final day = value.day.toString().padLeft(2, '0');
    final month = value.month.toString().padLeft(2, '0');
    return '$day/$month/${value.year}';
  }

  @override
  Widget build(BuildContext context) {
    final selectedCount = _selection.length;
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.92,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Composer un paquet'),
          automaticallyImplyLeading: false,
          actions: [
            IconButton(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.close),
            ),
          ],
        ),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 2, 16, 8),
              child: _WizardSteps(current: _step, onStepTap: _goToStep),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                children: [
                  if (_step == 0) _memberStep(),
                  if (_step == 1) _inventoryStep(selectedCount),
                  if (_step == 2) _detailsStep(selectedCount),
                  if (_step == 3) _signatureStep(selectedCount),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _memberStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _PageHeader(
          title: '1 · Choisir le membre',
          subtitle:
              'Le responsable peut agir au nom du membre sans demande préalable.',
          dark: true,
        ),
        DropdownButtonFormField<String>(
          initialValue: _member,
          decoration: const InputDecoration(
            labelText: 'Membre',
            border: OutlineInputBorder(),
          ),
          items: widget.requests
              .map((request) => DropdownMenuItem(
                    value: request.name,
                    child: Text(request.name),
                  ))
              .toList(),
          onChanged: (value) => setState(() => _member = value),
        ),
        const SizedBox(height: 16),
        _nextButton(
          label: 'Étape 2 · Choisir le matériel',
          enabled: _member != null,
          onPressed: () => _setStep(1),
        ),
      ],
    );
  }

  Widget _inventoryStep(int selectedCount) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _PageHeader(
          title: '2 · Choisir le matériel',
          subtitle:
              'Un seul article par catégorie. Les listes commencent par le numéro d’inventaire.',
          dark: true,
        ),
        const _InventoryColumnHeader(),
        ...widget.inventory.entries.map(
          (entry) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _InventoryChoiceRow(
              label: entry.key,
              value: _selection[entry.key],
              items: entry.value,
              onChanged: (item) => setState(() {
                if (item == null) {
                  _selection.remove(entry.key);
                } else {
                  _selection[entry.key] = item;
                }
              }),
            ),
          ),
        ),
        _InfoBanner(
          icon: Icons.inventory_2_outlined,
          text: '$selectedCount article(s) sélectionné(s).',
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => _setStep(0),
                child: const Text('Membre'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _nextButton(
                label: 'Étape 3 · Détails',
                enabled: selectedCount > 0,
                onPressed: () => _setStep(2),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _detailsStep(int selectedCount) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _PageHeader(
          title: '3 · Détails et finances',
          subtitle:
              'Cette étape devient active quand le paquet est complet et traçable.',
          dark: true,
        ),
        _SurfaceCard(
          child: Column(
            children: [
              _AmountRow(label: 'Membre', value: _member ?? '—'),
              _AmountRow(
                label: 'Matériel',
                value: '$selectedCount article(s)',
              ),
              InkWell(
                onTap: _pickReturnDate,
                borderRadius: BorderRadius.circular(4),
                child: InputDecorator(
                  decoration: const InputDecoration(
                    labelText: 'Retour prévu',
                    suffixIcon: Icon(Icons.calendar_month_outlined),
                    border: OutlineInputBorder(),
                  ),
                  child: Text(_formatReturnDate(_returnDate)),
                ),
              ),
              const SizedBox(height: 10),
              const TextField(
                maxLines: 2,
                decoration: InputDecoration(
                  labelText: 'Notes',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _PaymentPanel(
          mode: _paymentMode,
          status: _paymentStatus,
          handoverStatus: _handoverStatus,
          amount: selectedCount * 40,
          onModeChanged: (mode) => setState(() {
            _paymentMode = mode;
            _paymentStatus = 'unpaid';
            _handoverStatus = 'blocked';
          }),
          onEmailSent: () => setState(() => _paymentStatus = 'email_sent'),
          onPaymentConfirmed: () => setState(() {
            _paymentStatus = 'paid';
            _handoverStatus = 'ready';
          }),
          onHandover: () => setState(() => _handoverStatus = 'handed_over'),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => _setStep(1),
                child: const Text('Matériel'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _nextButton(
                label: 'Étape 4 · Signature',
                enabled: true,
                onPressed: () => _setStep(3),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _signatureStep(int selectedCount) {
    final canFinish = _handoverStatus == 'handed_over';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _PageHeader(
          title: '4 · Signature et remise',
          subtitle:
              'La remise reste bloquée tant que la caution n’est pas confirmée.',
          dark: true,
        ),
        _InfoBanner(
          icon: canFinish ? Icons.check_circle_outline : Icons.lock_outline,
          text:
              '${_member ?? 'Membre'} · $selectedCount article(s) · ${_paymentStatus == 'paid' ? 'caution payée' : 'caution non payée'}',
        ),
        const SizedBox(height: 14),
        Container(
          height: 170,
          decoration: BoxDecoration(
            border: Border.all(color: Colors.grey.shade400),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Center(child: Text('Zone de signature du membre')),
        ),
        const SizedBox(height: 14),
        _InfoBanner(
          icon: canFinish ? Icons.inventory_2_outlined : Icons.warning_amber,
          text: canFinish
              ? 'Remise autorisée. Le paiement est confirmé.'
              : 'Retournez à l’étape 3 pour confirmer la caution et autoriser la remise.',
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => _setStep(2),
                child: const Text('Détails'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton.icon(
                onPressed: canFinish ? () => Navigator.of(context).pop() : null,
                icon: const Icon(Icons.check),
                label: const Text('Créer le prêt'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _nextButton({
    required String label,
    required bool enabled,
    required VoidCallback onPressed,
  }) {
    return FilledButton(
      onPressed: enabled ? onPressed : null,
      child: Text(label),
    );
  }
}

class _RequestAssignmentSheet extends StatefulWidget {
  final _DemoRequest request;
  final Map<String, List<_DemoItem>> inventory;

  const _RequestAssignmentSheet({
    required this.request,
    required this.inventory,
  });

  @override
  State<_RequestAssignmentSheet> createState() =>
      _RequestAssignmentSheetState();
}

class _RequestAssignmentSheetState extends State<_RequestAssignmentSheet> {
  final Map<String, _DemoItem> _selected = {};
  final Set<String> _resolvedCategories = {};

  @override
  Widget build(BuildContext context) {
    final complete = widget.request.lines.every(
      (line) => _resolvedCategories.contains(line.category),
    );
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.84,
      child: Scaffold(
        appBar: AppBar(
          title: Text('Demande de ${widget.request.name}'),
          automaticallyImplyLeading: false,
          actions: [
            IconButton(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.close),
            ),
          ],
        ),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 22),
          children: [
            const _PageHeader(
              title: '2 · Attribuer l’inventaire',
              subtitle:
                  'Choisissez un numéro disponible correspondant à chaque variante demandée.',
              dark: true,
            ),
            const _InventoryColumnHeader(),
            ...widget.request.lines.map(
              (line) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _InventoryChoiceRow(
                  label: line.category,
                  option: line.option,
                  value: _selected[line.category],
                  items: (widget.inventory[line.category] ?? [])
                      .where((item) =>
                          item.option == line.option ||
                          line.option == '1 article')
                      .toList(),
                  onChanged: (item) => setState(() {
                    _resolvedCategories.add(line.category);
                    if (item == null) {
                      _selected.remove(line.category);
                    } else {
                      _selected[line.category] = item;
                    }
                  }),
                ),
              ),
            ),
            const _InfoBanner(
              icon: Icons.payments_outlined,
              text:
                  'Après l’attribution, l’étape 3 ouvre les dates, la caution et les deux modes de paiement.',
            ),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: complete
                  ? () => Navigator.of(context).pop({..._selected})
                  : null,
              icon: const Icon(Icons.arrow_forward),
              label: const Text('Étape 3 · Détails et paiement'),
            ),
          ],
        ),
      ),
    );
  }
}

class _InventoryColumnHeader extends StatelessWidget {
  const _InventoryColumnHeader();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          const Expanded(
            flex: 2,
            child: Text(
              'Matériel',
              style: TextStyle(
                color: Colors.black54,
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          const SizedBox(width: 10),
          const Expanded(
            flex: 3,
            child: Text(
              'N° inventaire',
              style: TextStyle(
                color: Colors.black54,
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InventoryChoiceRow extends StatelessWidget {
  final String label;
  final String? option;
  final _DemoItem? value;
  final List<_DemoItem> items;
  final ValueChanged<_DemoItem?> onChanged;

  const _InventoryChoiceRow({
    required this.label,
    this.option,
    required this.value,
    required this.items,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 2,
          child: Padding(
            padding: const EdgeInsets.only(top: 13, right: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (option != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    option!,
                    style: const TextStyle(color: Colors.black54, fontSize: 12),
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          flex: 3,
          child: DropdownButtonFormField<_DemoItem?>(
            initialValue: value,
            decoration: const InputDecoration(
              hintText: 'Choisir…',
              border: OutlineInputBorder(),
              contentPadding: EdgeInsets.symmetric(horizontal: 12),
            ),
            items: [
              const DropdownMenuItem<_DemoItem?>(
                value: null,
                child: Text('Aucun article'),
              ),
              ...items.map(
                (item) => DropdownMenuItem<_DemoItem?>(
                  value: item,
                  child: _InventoryMenuItem(item),
                ),
              ),
            ],
            selectedItemBuilder: (context) => [
              const Align(
                alignment: Alignment.centerLeft,
                child: Text('Aucun article'),
              ),
              ...items.map(
                (item) => Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    item.inventoryNumber,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            ],
            onChanged: onChanged,
          ),
        ),
      ],
    );
  }
}

class _InventoryMenuItem extends StatelessWidget {
  final _DemoItem item;

  const _InventoryMenuItem(this.item);

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SizedBox(
          width: 92,
          child: Text(
            item.inventoryNumber,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
        Expanded(
          child: Text(
            item.description,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

class _PaymentPanel extends StatelessWidget {
  final String mode;
  final String status;
  final String handoverStatus;
  final double amount;
  final ValueChanged<String> onModeChanged;
  final VoidCallback onEmailSent;
  final VoidCallback onPaymentConfirmed;
  final VoidCallback onHandover;

  const _PaymentPanel({
    required this.mode,
    required this.status,
    required this.handoverStatus,
    required this.amount,
    required this.onModeChanged,
    required this.onEmailSent,
    required this.onPaymentConfirmed,
    required this.onHandover,
  });

  @override
  Widget build(BuildContext context) {
    final isRemote = mode == 'remote';
    final paid = status == 'paid';
    return _SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Paiement de la caution',
              style: TextStyle(
                  color: AppColors.donkerblauw,
                  fontWeight: FontWeight.w800,
                  fontSize: 16)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _ModeButton(
                  label: 'À distance',
                  subtitle: 'E-mail + QR',
                  selected: isRemote,
                  onTap: () => onModeChanged('remote'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _ModeButton(
                  label: 'Sur place',
                  subtitle: 'QR téléphone',
                  selected: !isRemote,
                  onTap: () => onModeChanged('onsite'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _AmountRow(
            label: 'Caution calculée',
            value: '${amount.toStringAsFixed(2)} EUR',
            emphasized: true,
          ),
          const _AmountRow(
            label: 'Référence',
            value: '+++PRET-2026-0012+++',
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.blueGrey.shade50,
              borderRadius: BorderRadius.circular(12),
            ),
            child: isRemote
                ? Row(
                    children: [
                      Container(
                        width: 92,
                        height: 92,
                        color: Colors.white,
                        child: const Icon(Icons.qr_code_2,
                            size: 82, color: AppColors.donkerblauw),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'QR dans l’e-mail du membre',
                              style: TextStyle(
                                  color: AppColors.donkerblauw,
                                  fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 4),
                            const Text(
                              'Le membre paie avec son application bancaire.',
                              style: TextStyle(color: Colors.black54),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: [
                                OutlinedButton(
                                  onPressed: onEmailSent,
                                  child: Text(status == 'email_sent'
                                      ? 'E-mail envoyé ✓'
                                      : 'Envoyer l’e-mail'),
                                ),
                                OutlinedButton(
                                  onPressed: onPaymentConfirmed,
                                  child: const Text('Simuler paiement reçu'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  )
                : Column(
                    children: [
                      const Icon(Icons.qr_code_2,
                          size: 190, color: AppColors.donkerblauw),
                      const SizedBox(height: 8),
                      const Text(
                        'Présentez ce QR-code au membre',
                        style: TextStyle(
                            color: AppColors.donkerblauw,
                            fontWeight: FontWeight.w800,
                            fontSize: 16),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Le membre paie directement avec son application bancaire.',
                        style: TextStyle(color: Colors.black54),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: onPaymentConfirmed,
                        icon: const Icon(Icons.visibility_outlined),
                        label: const Text('J’ai vu le paiement'),
                      ),
                    ],
                  ),
          ),
          const SizedBox(height: 10),
          _InfoBanner(
            icon: paid ? Icons.check_circle_outline : Icons.lock_outline,
            text: paid
                ? 'Paiement confirmé. La remise peut être autorisée.'
                : 'Remise bloquée tant que le paiement n’est pas confirmé.',
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: paid ? onHandover : null,
              icon: const Icon(Icons.inventory_2_outlined),
              label: Text(handoverStatus == 'handed_over'
                  ? 'Remise autorisée ✓'
                  : 'Autoriser la remise'),
            ),
          ),
        ],
      ),
    );
  }
}

class _ModeButton extends StatelessWidget {
  final String label;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  const _ModeButton({
    required this.label,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: selected ? AppColors.lichtblauw.withValues(alpha: 0.14) : null,
          border: Border.all(
            color: selected ? AppColors.middenblauw : Colors.grey.shade300,
            width: selected ? 1.5 : 1,
          ),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: const TextStyle(
                    color: AppColors.donkerblauw, fontWeight: FontWeight.w800)),
            Text(subtitle, style: const TextStyle(color: Colors.black54)),
          ],
        ),
      ),
    );
  }
}

class _WizardSteps extends StatelessWidget {
  final int current;
  final ValueChanged<int> onStepTap;

  const _WizardSteps({required this.current, required this.onStepTap});

  @override
  Widget build(BuildContext context) {
    const labels = ['Membre', 'Inventaire', 'Détails', 'Signature'];
    return Row(
      children: [
        for (var index = 0; index < labels.length; index++)
          Expanded(
            child: InkWell(
              onTap: index <= current ? () => onStepTap(index) : null,
              borderRadius: BorderRadius.circular(6),
              child: Container(
                margin:
                    EdgeInsets.only(right: index == labels.length - 1 ? 0 : 5),
                padding: const EdgeInsets.only(top: 7, bottom: 5),
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(
                      color: index < current
                          ? AppColors.success
                          : index == current
                              ? AppColors.middenblauw
                              : Colors.grey.shade300,
                      width: 3,
                    ),
                  ),
                ),
                child: Text(
                  '${index + 1} · ${labels[index]}',
                  style: TextStyle(
                    fontSize: 11,
                    color: index <= current
                        ? AppColors.middenblauw
                        : Colors.grey.shade600,
                    fontWeight: index == current ? FontWeight.w800 : null,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _PageHeader extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget? action;
  final bool dark;

  const _PageHeader({
    required this.title,
    required this.subtitle,
    this.action,
    this.dark = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    color: dark ? AppColors.donkerblauw : Colors.white,
                    fontSize: 21,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              if (action != null) action!,
            ],
          ),
          const SizedBox(height: 4),
          Text(subtitle,
              style: TextStyle(
                  color: dark ? Colors.black54 : Colors.white70, height: 1.35)),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}

class _SurfaceCard extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry margin;

  const _SurfaceCard({
    required this.child,
    this.onTap,
    this.margin = EdgeInsets.zero,
  });

  @override
  Widget build(BuildContext context) {
    final card = Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: Padding(padding: const EdgeInsets.all(14), child: child),
    );
    return Container(
      margin: margin,
      child: onTap == null
          ? card
          : InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(14),
              child: card,
            ),
    );
  }
}

class _InfoBanner extends StatelessWidget {
  final IconData icon;
  final String text;

  const _InfoBanner({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.88),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: AppColors.middenblauw, size: 19),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(height: 1.35))),
        ],
      ),
    );
  }
}

class _AmountRow extends StatelessWidget {
  final String label;
  final String value;
  final bool emphasized;

  const _AmountRow({
    required this.label,
    required this.value,
    this.emphasized = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
              child:
                  Text(label, style: const TextStyle(color: Colors.black54))),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: TextStyle(
                color: AppColors.donkerblauw,
                fontWeight: emphasized ? FontWeight.w800 : FontWeight.w600,
                fontSize: emphasized ? 16 : 13,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  final String label;
  final Color color;

  const _StatusPill({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.13),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(label,
          style: TextStyle(
              color: color, fontSize: 11, fontWeight: FontWeight.w800)),
    );
  }
}

class _DemoRequest {
  final String name;
  final String initials;
  final String returnDate;
  final List<_DemoLine> lines;

  const _DemoRequest({
    required this.name,
    required this.initials,
    required this.returnDate,
    required this.lines,
  });
}

class _DemoLine {
  final String category;
  final String option;

  const _DemoLine(this.category, this.option);
}

class _DemoItem {
  final String inventoryNumber;
  final String description;
  final String option;

  const _DemoItem(this.inventoryNumber, this.description, this.option);

  String get label => '$inventoryNumber · $description';
}

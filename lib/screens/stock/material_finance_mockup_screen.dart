import 'package:flutter/material.dart';

import '../../config/app_colors.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

/// Local-only COM-059 prototype.
///
/// This screen deliberately uses demo data and does not write to Firestore,
/// send an e-mail, or initiate a bank transfer. It is the Flutter counterpart
/// of the organizer finance mock-up used to review the workflow before wiring
/// it to the real loan and accounting services. The student view is included
/// here as a read-only Boutique preview of an active loan.
class MaterialFinanceMockupScreen extends StatefulWidget {
  final bool studentPreview;

  const MaterialFinanceMockupScreen({
    super.key,
    this.studentPreview = false,
  });

  @override
  State<MaterialFinanceMockupScreen> createState() =>
      _MaterialFinanceMockupScreenState();
}

class _MaterialFinanceMockupScreenState
    extends State<MaterialFinanceMockupScreen> {
  int _tab = 0;
  String? _selectedReturnLoanId;
  final Map<String, String> _returnStates = {};
  final Map<String, String> _returnComments = {};
  final Map<String, String> _retentionChoices = {};
  final Map<String, String> _manualRetentions = {};
  final Set<String> _returnPhotos = {};
  final Set<String> _maintenanceFollowUps = {};
  final Set<String> _missingEscalations = {};
  final Set<String> _refundCreatedLoanIds = {};
  final Set<String> _refundPaidLoanIds = {};

  final List<_DemoMember> _members = const [
    _DemoMember(
      name: 'Alice DUPONT',
      initials: 'AD',
      email: 'alice.dupont@calypso-demo.test',
    ),
    _DemoMember(
      name: 'Bruno MARTIN',
      initials: 'BM',
      email: 'bruno.martin@calypso-demo.test',
    ),
    _DemoMember(
      name: 'Camille LEROY',
      initials: 'CL',
      email: 'camille.leroy@calypso-demo.test',
    ),
    _DemoMember(
      name: 'David PEETERS',
      initials: 'DP',
      email: 'david.peeters@calypso-demo.test',
    ),
    _DemoMember(
      name: 'Élodie SIMON',
      initials: 'ES',
      email: 'elodie.simon@calypso-demo.test',
    ),
    _DemoMember(
      name: 'François LEFEBVRE',
      initials: 'FL',
      email: 'francois.lefebvre@calypso-demo.test',
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

  final List<_DemoReturnLoan> _returnLoans = const [
    _DemoReturnLoan(
      id: 'PRET-2026-0012',
      memberName: 'Alice DUPONT',
      initials: 'AD',
      returnDate: '21/08/2026',
      deposit: 100,
      itemNumbers: ['GILET-036', 'ORD-006'],
    ),
    _DemoReturnLoan(
      id: 'PRET-2026-0013',
      memberName: 'Bruno MARTIN',
      initials: 'BM',
      returnDate: '22/08/2026',
      deposit: 100,
      itemNumbers: ['BT-007', 'PAL-042'],
    ),
    _DemoReturnLoan(
      id: 'PRET-2026-0014',
      memberName: 'Camille LEROY',
      initials: 'CL',
      returnDate: '12/08/2026',
      deposit: 100,
      itemNumbers: ['GILET-014'],
    ),
  ];

  @override
  Widget build(BuildContext context) {
    if (widget.studentPreview) {
      return const _StudentMaterialLoansMockupScreen();
    }
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
        actions: [
          IconButton(
            tooltip: 'Voir la vue étudiant',
            onPressed: _openStudentView,
            icon: const Icon(Icons.person_outline),
          ),
        ],
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
    const labels = ['Nouveau prêt', 'À restituer', 'Finances'];
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
                    index == 1
                        ? 'À restituer ${_returnLoans.length}'
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
        return _buildReturns();
      case 2:
        return _buildFinances();
      default:
        return _buildNewLoan();
    }
  }

  Widget _buildNewLoan() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
      children: [
        const _PageHeader(
          title: 'Nouveau prêt',
          subtitle:
              'L’encadrant prépare directement le matériel pour un membre, sans demande préalable.',
        ),
        const SizedBox(height: 12),
        _SurfaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(Icons.add_box_outlined,
                      color: AppColors.middenblauw, size: 30),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Composer un prêt de matériel',
                      style: TextStyle(
                        color: AppColors.donkerblauw,
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              const Text(
                'Choisissez le membre, puis le matériel disponible, la date de retour, la caution et la signature.',
                style: TextStyle(color: Colors.black54, height: 1.35),
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _openManualComposer,
                  icon: const Icon(Icons.play_arrow_outlined),
                  label: const Text('Commencer un nouveau prêt'),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        const _InfoBanner(
          icon: Icons.info_outline,
          text:
              'Le membre ne crée pas de demande : tout le parcours est réalisé par la personne autorisée à prêter le matériel.',
        ),
      ],
    );
  }

  Widget _buildReturns() {
    if (_selectedReturnLoanId == null) return _buildReturnList();
    final loan = _returnLoans
        .firstWhere((candidate) => candidate.id == _selectedReturnLoanId);
    return _buildReturnDetails(loan);
  }

  Widget _buildReturnList() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
      children: [
        _PageHeader(
          title: 'Matériel à restituer',
          subtitle:
              '${_returnLoans.length} prêt(s) ouverts. Ouvrez une fiche quand le membre revient avec son matériel.',
        ),
        ..._returnLoans.map((loan) => _buildReturnMemberCard(loan)),
        const SizedBox(height: 4),
        const _InfoBanner(
          icon: Icons.history_outlined,
          text:
              'Les incidents, commentaires et photos restent liés à chaque article et seront visibles dans CaliConta.',
        ),
      ],
    );
  }

  Widget _buildReturnMemberCard(_DemoReturnLoan loan) {
    final status = _returnListStatus(loan);
    final isOverdue = _isReturnOverdue(loan);
    return _SurfaceCard(
      margin: const EdgeInsets.only(bottom: 12),
      backgroundColor: isOverdue ? Colors.deepOrange.shade50 : null,
      borderColor: isOverdue ? Colors.deepOrange.shade300 : null,
      onTap: () => setState(() => _selectedReturnLoanId = loan.id),
      child: Row(
        children: [
          CircleAvatar(
            radius: 25,
            backgroundColor: AppColors.lichtblauw.withValues(alpha: 0.25),
            foregroundColor: AppColors.donkerblauw,
            child: Text(loan.initials,
                style: const TextStyle(fontWeight: FontWeight.w800)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(loan.memberName,
                    style: const TextStyle(
                      color: AppColors.donkerblauw,
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    )),
                const SizedBox(height: 3),
                Text('${loan.id} · ${loan.itemNumbers.length} article(s)'),
                const SizedBox(height: 3),
                Text(
                  '${isOverdue ? 'En retard · retour prévu' : 'Retour prévu'} · ${loan.returnDate}',
                  style: TextStyle(
                    color: isOverdue ? Colors.deepOrange : Colors.grey.shade600,
                    fontSize: 12,
                    fontWeight: isOverdue ? FontWeight.w800 : FontWeight.normal,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              _StatusPill(label: status.$1, color: status.$2),
              const SizedBox(height: 8),
              const Icon(Icons.chevron_right, color: AppColors.middenblauw),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildReturnDetails(_DemoReturnLoan loan) {
    final items = _itemsForReturn(loan);
    final allChecked =
        items.every((item) => _returnStates[_returnKey(loan, item)] != null);
    final hasIncompleteEvidence = items
        .any((item) => _isIssue(loan, item) && !_hasIssueEvidence(loan, item));
    final hasMissingItem =
        items.any((item) => _returnStates[_returnKey(loan, item)] == 'missing');
    final retained = items.fold<double>(
        0, (total, item) => total + _retentionFor(loan, item));
    final refund = loan.deposit - retained;
    final canCreateRefund =
        allChecked && !hasIncompleteEvidence && !hasMissingItem;
    final refundCreated = _refundCreatedLoanIds.contains(loan.id);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
      children: [
        _PageHeader(
          title: 'Retour de ${loan.memberName}',
          subtitle:
              'Contrôlez chaque article. Les incidents sont conservés dans l’historique du matériel.',
          action: IconButton(
            tooltip: 'Liste des retours',
            onPressed: () => setState(() => _selectedReturnLoanId = null),
            icon: const Icon(Icons.arrow_back, color: Colors.white),
          ),
        ),
        _SurfaceCard(
          child: Row(
            children: [
              CircleAvatar(
                radius: 23,
                backgroundColor: AppColors.lichtblauw.withValues(alpha: 0.25),
                foregroundColor: AppColors.donkerblauw,
                child: Text(loan.initials,
                    style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(loan.memberName,
                        style: const TextStyle(
                          color: AppColors.donkerblauw,
                          fontWeight: FontWeight.w800,
                        )),
                    Text('${loan.id} · retour prévu le ${loan.returnDate}'),
                  ],
                ),
              ),
              _StatusPill(
                  label: 'Caution ${_formatAmount(loan.deposit)}',
                  color: AppColors.middenblauw),
            ],
          ),
        ),
        const SizedBox(height: 12),
        ...items.map((item) => _buildReturnItemCard(loan, item)),
        _buildReturnSummary(
          loan: loan,
          allChecked: allChecked,
          hasIncompleteEvidence: hasIncompleteEvidence,
          hasMissingItem: hasMissingItem,
          retained: retained,
          refund: refund,
          refundCreated: refundCreated,
          canCreateRefund: canCreateRefund,
        ),
      ],
    );
  }

  Widget _buildReturnItemCard(_DemoReturnLoan loan, _DemoItem item) {
    final key = _returnKey(loan, item);
    final state = _returnStates[key];
    final issue = _isIssue(loan, item);
    final hasEvidence = _hasIssueEvidence(loan, item);
    final maintenanceCreated = _maintenanceFollowUps.contains(key);
    final escalated = _missingEscalations.contains(key);

    return _SurfaceCard(
      margin: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.inventory_2_outlined,
                  color: AppColors.middenblauw),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${_categoryForItem(item)} · ${item.option}',
                        style: const TextStyle(
                          color: AppColors.donkerblauw,
                          fontWeight: FontWeight.w800,
                        )),
                    Text(
                        'N° inventaire ${item.inventoryNumber} · ${item.description}',
                        style: const TextStyle(color: Colors.black54)),
                  ],
                ),
              ),
              if (state != null)
                _StatusPill(
                  label: _returnStateLabel(state),
                  color: _returnStateColor(state),
                ),
            ],
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: state,
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
                child: Text('Endommagé'),
              ),
              DropdownMenuItem(
                value: 'missing',
                child: Text('Manquant'),
              ),
            ],
            onChanged: (value) {
              if (value == null) return;
              setState(() {
                _returnStates[key] = value;
                if (value != 'missing') _missingEscalations.remove(key);
                if (value != 'damaged') {
                  _retentionChoices.remove(key);
                  _manualRetentions.remove(key);
                  _maintenanceFollowUps.remove(key);
                }
              });
            },
          ),
          if (state == 'damaged') ...[
            const SizedBox(height: 12),
            _buildDamageResolution(loan, item),
          ],
          if (issue) ...[
            const SizedBox(height: 12),
            TextFormField(
              initialValue: _returnComments[key],
              minLines: 2,
              maxLines: 3,
              onChanged: (value) =>
                  setState(() => _returnComments[key] = value),
              decoration: const InputDecoration(
                labelText: 'Commentaire sur l’article',
                hintText: 'Décrivez précisément l’état constaté…',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () => setState(() => _returnPhotos.add(key)),
              icon: Icon(_returnPhotos.contains(key)
                  ? Icons.photo_library_outlined
                  : Icons.add_a_photo_outlined),
              label: Text(_returnPhotos.contains(key)
                  ? 'Photo jointe ✓'
                  : 'Ajouter une photo'),
            ),
            if (!hasEvidence) ...[
              const SizedBox(height: 10),
              const _InfoBanner(
                icon: Icons.warning_amber_outlined,
                text:
                    'Un commentaire et une photo sont requis pour documenter cet incident.',
              ),
            ],
            const SizedBox(height: 12),
            _buildItemHistory(
              loan: loan,
              item: item,
              maintenanceCreated: maintenanceCreated,
              escalated: escalated,
            ),
          ],
          if (state == 'damaged') ...[
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: hasEvidence
                  ? () => setState(() => _maintenanceFollowUps.add(key))
                  : null,
              icon: Icon(maintenanceCreated
                  ? Icons.build_circle_outlined
                  : Icons.build_outlined),
              label: Text(maintenanceCreated
                  ? 'Suivi maintenance créé ✓'
                  : 'Créer un suivi de maintenance'),
            ),
          ],
          if (state == 'missing') ...[
            const SizedBox(height: 10),
            _buildMissingEscalation(
              loan: loan,
              item: item,
              hasEvidence: hasEvidence,
              escalated: escalated,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildDamageResolution(_DemoReturnLoan loan, _DemoItem item) {
    final key = _returnKey(loan, item);
    final choice = _retentionChoices[key] ?? 'none';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DropdownButtonFormField<String>(
          initialValue: choice,
          decoration: const InputDecoration(
            labelText: 'Retenue proposée',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: 'none', child: Text('Aucune retenue')),
            DropdownMenuItem(
              value: 'repair_20',
              child: Text('Forfait réparation · 20,00 EUR'),
            ),
            DropdownMenuItem(
              value: 'replacement_40',
              child: Text('Pièce à remplacer · 40,00 EUR'),
            ),
            DropdownMenuItem(
              value: 'manual',
              child: Text('Montant manuel'),
            ),
          ],
          onChanged: (value) => setState(
            () => _retentionChoices[key] = value ?? 'none',
          ),
        ),
        if (choice == 'manual') ...[
          const SizedBox(height: 10),
          TextFormField(
            initialValue: _manualRetentions[key],
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            onChanged: (value) =>
                setState(() => _manualRetentions[key] = value),
            decoration: const InputDecoration(
              labelText: 'Montant de la retenue',
              suffixText: 'EUR',
              border: OutlineInputBorder(),
            ),
          ),
        ],
        const SizedBox(height: 8),
        const Text(
          'La retenue est proposée par l’encadrant et reste traçable avec le constat.',
          style: TextStyle(color: Colors.black54, fontSize: 12),
        ),
      ],
    );
  }

  Widget _buildMissingEscalation({
    required _DemoReturnLoan loan,
    required _DemoItem item,
    required bool hasEvidence,
    required bool escalated,
  }) {
    final key = _returnKey(loan, item);
    if (escalated) {
      return const _InfoBanner(
        icon: Icons.escalator_warning_outlined,
        text:
            'Incident envoyé à CaliConta. Le responsable matériel décide de la compensation avant tout remboursement.',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _InfoBanner(
          icon: Icons.report_problem_outlined,
          text:
              'Aucune retenue n’est calculée automatiquement pour un article manquant. Une décision est requise.',
        ),
        const SizedBox(height: 10),
        FilledButton.icon(
          onPressed: hasEvidence
              ? () => setState(() => _missingEscalations.add(key))
              : null,
          icon: const Icon(Icons.priority_high_outlined),
          label: const Text('Créer l’escalade dans CaliConta'),
        ),
      ],
    );
  }

  Widget _buildItemHistory({
    required _DemoReturnLoan loan,
    required _DemoItem item,
    required bool maintenanceCreated,
    required bool escalated,
  }) {
    final key = _returnKey(loan, item);
    final state = _returnStates[key] ?? 'damaged';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.blueGrey.shade50,
        border: Border.all(color: Colors.blueGrey.shade100),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Historique matériel · CaliConta',
              style: TextStyle(
                  color: AppColors.donkerblauw, fontWeight: FontWeight.w800)),
          const SizedBox(height: 5),
          Text(
            'Retour contrôlé · ${_returnStateLabel(state)} · commentaire${_returnPhotos.contains(key) ? ' + photo' : ''}',
            style: const TextStyle(fontSize: 12),
          ),
          if (maintenanceCreated)
            const Padding(
              padding: EdgeInsets.only(top: 4),
              child: Text('Suivi de maintenance · à réparer',
                  style: TextStyle(fontSize: 12, color: AppColors.success)),
            ),
          if (escalated)
            const Padding(
              padding: EdgeInsets.only(top: 4),
              child: Text('Incident de matériel · décision en attente',
                  style: TextStyle(fontSize: 12, color: Colors.deepOrange)),
            ),
          const Padding(
            padding: EdgeInsets.only(top: 4),
            child: Text('La clôture “réparé” sera ajoutée à cette même fiche.',
                style: TextStyle(fontSize: 12, color: Colors.black54)),
          ),
        ],
      ),
    );
  }

  Widget _buildReturnSummary({
    required _DemoReturnLoan loan,
    required bool allChecked,
    required bool hasIncompleteEvidence,
    required bool hasMissingItem,
    required double retained,
    required double refund,
    required bool refundCreated,
    required bool canCreateRefund,
  }) {
    final title = !allChecked
        ? 'Contrôle à terminer'
        : hasIncompleteEvidence
            ? 'Constat à compléter'
            : hasMissingItem
                ? 'Décision requise'
                : 'Contrôle complet';
    final titleColor = !allChecked || hasIncompleteEvidence
        ? Colors.orange.shade800
        : hasMissingItem
            ? Colors.deepOrange
            : AppColors.success;

    return _SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: TextStyle(color: titleColor, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          _AmountRow(
              label: 'Caution reçue', value: _formatAmount(loan.deposit)),
          if (hasMissingItem) ...[
            const _AmountRow(label: 'Compensation', value: 'À décider'),
            const _AmountRow(label: 'Remboursement', value: 'En attente'),
            const SizedBox(height: 8),
            const _InfoBanner(
              icon: Icons.pending_actions_outlined,
              text:
                  'Le dossier reste ouvert jusqu’à la décision du responsable matériel dans CaliConta.',
            ),
          ] else ...[
            _AmountRow(label: 'Retenue', value: _formatAmount(retained)),
            _AmountRow(
              label: 'À rembourser',
              value: _formatAmount(refund),
              emphasized: true,
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: canCreateRefund
                    ? () => setState(() => _refundCreatedLoanIds.add(loan.id))
                    : null,
                icon: Icon(refundCreated
                    ? Icons.check_circle_outline
                    : Icons.send_outlined),
                label: Text(refundCreated
                    ? 'Remboursement demandé ✓'
                    : 'Créer la demande de remboursement'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  List<_DemoItem> _itemsForReturn(_DemoReturnLoan loan) {
    final items = <_DemoItem>[];
    for (final number in loan.itemNumbers) {
      final item = _findInventoryItem(number);
      if (item != null) items.add(item);
    }
    return items;
  }

  _DemoItem? _findInventoryItem(String inventoryNumber) {
    for (final items in _inventory.values) {
      for (final item in items) {
        if (item.inventoryNumber == inventoryNumber) return item;
      }
    }
    return null;
  }

  String _categoryForItem(_DemoItem item) {
    for (final entry in _inventory.entries) {
      if (entry.value.any(
          (candidate) => candidate.inventoryNumber == item.inventoryNumber)) {
        return entry.key;
      }
    }
    return 'Matériel';
  }

  String _returnKey(_DemoReturnLoan loan, _DemoItem item) =>
      '${loan.id}:${item.inventoryNumber}';

  bool _isIssue(_DemoReturnLoan loan, _DemoItem item) {
    final state = _returnStates[_returnKey(loan, item)];
    return state == 'damaged' || state == 'missing';
  }

  bool _hasIssueEvidence(_DemoReturnLoan loan, _DemoItem item) {
    final key = _returnKey(loan, item);
    return (_returnComments[key]?.trim().isNotEmpty ?? false) &&
        _returnPhotos.contains(key);
  }

  double _retentionFor(_DemoReturnLoan loan, _DemoItem item) {
    if (_returnStates[_returnKey(loan, item)] != 'damaged') return 0;
    switch (_retentionChoices[_returnKey(loan, item)] ?? 'none') {
      case 'repair_20':
        return 20;
      case 'replacement_40':
        return 40;
      case 'manual':
        return double.tryParse((_manualRetentions[_returnKey(loan, item)] ?? '')
                .replaceAll(',', '.')) ??
            0;
      default:
        return 0;
    }
  }

  (String, Color) _returnListStatus(_DemoReturnLoan loan) {
    final items = _itemsForReturn(loan);
    if (items
        .any((item) => _returnStates[_returnKey(loan, item)] == 'missing')) {
      return ('Incident', Colors.deepOrange);
    }
    if (items.isNotEmpty &&
        items.every((item) => _returnStates[_returnKey(loan, item)] != null)) {
      return ('Contrôlé', AppColors.success);
    }
    if (_isReturnOverdue(loan)) return ('En retard', Colors.deepOrange);
    if (items.any((item) => _returnStates[_returnKey(loan, item)] != null)) {
      return ('En cours', Colors.orange);
    }
    return ('À contrôler', Colors.orange);
  }

  bool _isReturnOverdue(_DemoReturnLoan loan) {
    final parts = loan.returnDate.split('/');
    if (parts.length != 3) return false;
    final day = int.tryParse(parts[0]);
    final month = int.tryParse(parts[1]);
    final year = int.tryParse(parts[2]);
    if (day == null || month == null || year == null) return false;

    final items = _itemsForReturn(loan);
    final fullyChecked = items.isNotEmpty &&
        items.every((item) => _returnStates[_returnKey(loan, item)] != null);
    if (fullyChecked) return false;

    final dueDate = DateTime(year, month, day);
    final today = DateTime.now();
    final startOfToday = DateTime(today.year, today.month, today.day);
    return dueDate.isBefore(startOfToday);
  }

  String _returnStateLabel(String state) {
    switch (state) {
      case 'complete':
        return 'Bon état';
      case 'damaged':
        return 'Endommagé';
      case 'missing':
        return 'Manquant';
      default:
        return state;
    }
  }

  Color _returnStateColor(String state) {
    switch (state) {
      case 'complete':
        return AppColors.success;
      case 'damaged':
        return Colors.orange.shade800;
      case 'missing':
        return Colors.deepOrange;
      default:
        return Colors.grey;
    }
  }

  String _formatAmount(double amount) =>
      '${amount.toStringAsFixed(2).replaceAll('.', ',')} EUR';

  _DemoReturnLoan? _firstCreatedRefundLoan() {
    for (final loan in _returnLoans) {
      if (_refundCreatedLoanIds.contains(loan.id)) return loan;
    }
    return null;
  }

  Widget _buildFinances() {
    final refundLoan = _firstCreatedRefundLoan();
    final refundPaid =
        refundLoan != null && _refundPaidLoanIds.contains(refundLoan.id);
    final proposedRefund = refundLoan == null
        ? 0.0
        : refundLoan.deposit -
            _itemsForReturn(refundLoan).fold<double>(
              0,
              (total, item) => total + _retentionFor(refundLoan, item),
            );
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
              const _AmountRow(label: 'Montant', value: '100,00 EUR'),
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
              if (refundLoan == null)
                const _InfoBanner(
                  icon: Icons.inbox_outlined,
                  text: 'La liste se remplit après le contrôle d’un retour.',
                )
              else ...[
                _AmountRow(label: 'Membre', value: refundLoan.memberName),
                _AmountRow(
                    label: 'Caution reçue',
                    value: _formatAmount(refundLoan.deposit)),
                _AmountRow(
                    label: 'Montant proposé',
                    value: _formatAmount(proposedRefund)),
                _StatusPill(
                  label: refundPaid ? 'Exécuté' : 'À exécuter',
                  color: refundPaid ? AppColors.success : Colors.orange,
                ),
                const SizedBox(height: 12),
                if (!refundPaid)
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () =>
                          setState(() => _refundPaidLoanIds.add(refundLoan.id)),
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
        members: _members,
      ),
    );
  }

  Future<void> _openStudentView() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => const _StudentMaterialLoansMockupScreen(),
      ),
    );
  }
}

/// Read-only student preview shown from the person icon in the organizer mock.
/// It intentionally contains no request, payment or return action: those are
/// handled in person by an authorized encadrant.
class _StudentMaterialLoansMockupScreen extends StatelessWidget {
  const _StudentMaterialLoansMockupScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'Boutique · Mes prêts',
          style: TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.fishAndBubbles,
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
            children: [
              const Padding(
                padding: EdgeInsets.only(top: 4),
                child: _PageHeader(
                  title: 'Mon matériel emprunté',
                  subtitle:
                      'Voici le matériel associé à votre compte jusqu’à son retour.',
                ),
              ),
              _SurfaceCard(
                child: Row(
                  children: [
                    CircleAvatar(
                      backgroundColor:
                          AppColors.lichtblauw.withValues(alpha: 0.22),
                      child: const Text(
                        'AD',
                        style: TextStyle(
                          color: AppColors.donkerblauw,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
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
                          SizedBox(height: 2),
                          Text('PRET-2026-0012',
                              style: TextStyle(color: Colors.black54)),
                        ],
                      ),
                    ),
                    const _StatusPill(
                      label: 'Prêt actif',
                      color: AppColors.success,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              _SurfaceCard(
                backgroundColor: Colors.orange.shade50,
                borderColor: Colors.orange.shade200,
                child: const Row(
                  children: [
                    Icon(Icons.event_available_outlined,
                        color: Colors.deepOrange),
                    SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Retour prévu le 21/08/2026',
                              style: TextStyle(
                                  color: AppColors.donkerblauw,
                                  fontWeight: FontWeight.w800)),
                          SizedBox(height: 2),
                          Text(
                              'Rapportez le matériel lors de la séance piscine.',
                              style: TextStyle(color: Colors.black54)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              const _SurfaceCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Caution',
                        style: TextStyle(
                            color: AppColors.donkerblauw,
                            fontWeight: FontWeight.w800,
                            fontSize: 16)),
                    SizedBox(height: 6),
                    _AmountRow(
                      label: 'Caution versée',
                      value: '100,00 EUR',
                      emphasized: true,
                    ),
                    Text(
                      'Remboursable après le retour et le contrôle du matériel.',
                      style: TextStyle(color: Colors.black54, height: 1.35),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              const Text(
                'Matériel que vous avez avec vous',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              const _StudentLoanItemCard(
                category: 'Gilet stabilisateur',
                option: 'XL',
                inventoryNumber: 'GILET-036',
                description: 'MARES · série M36',
                icon: Icons.accessibility_new_outlined,
              ),
              const SizedBox(height: 10),
              const _StudentLoanItemCard(
                category: 'Ordinateur',
                option: 'CRESSI',
                inventoryNumber: 'ORD-006',
                description: 'CRESSI LEONARDO',
                icon: Icons.watch_outlined,
              ),
              const SizedBox(height: 14),
              const _InfoBanner(
                icon: Icons.info_outline,
                text:
                    'Vous n’avez pas de demande à introduire. Rapportez le matériel lors de la séance piscine ou signalez un problème à un encadrant.',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StudentLoanItemCard extends StatelessWidget {
  final String category;
  final String option;
  final String inventoryNumber;
  final String description;
  final IconData icon;

  const _StudentLoanItemCard({
    required this.category,
    required this.option,
    required this.inventoryNumber,
    required this.description,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return _SurfaceCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: AppColors.middenblauw),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$category · $option',
                    style: const TextStyle(
                        color: AppColors.donkerblauw,
                        fontWeight: FontWeight.w800)),
                const SizedBox(height: 3),
                Text(inventoryNumber,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 1),
                Text(description,
                    style: const TextStyle(color: Colors.black54)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PackageComposerSheet extends StatefulWidget {
  final Map<String, List<_DemoItem>> inventory;
  final List<_DemoMember> members;

  const _PackageComposerSheet({
    required this.inventory,
    required this.members,
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
  final Map<String, String> _handoverConditions = {};
  final Map<String, String> _handoverNotes = {};
  final Set<String> _handoverPhotos = {};

  @override
  void initState() {
    super.initState();
    _step = 0;
    _furthestStep = 0;
    _member = null;
    _selection = {};
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

  Future<void> _pickMember() async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      builder: (_) => _MemberSearchSheet(
        members: widget.members,
        selectedMember: _member,
      ),
    );
    if (picked != null && mounted) {
      setState(() => _member = picked);
    }
  }

  String _formatReturnDate(DateTime value) {
    final day = value.day.toString().padLeft(2, '0');
    final month = value.month.toString().padLeft(2, '0');
    return '$day/$month/${value.year}';
  }

  _DemoMember? get _selectedMember {
    for (final member in widget.members) {
      if (member.name == _member) return member;
    }
    return null;
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
        InkWell(
          onTap: _pickMember,
          borderRadius: BorderRadius.circular(4),
          child: InputDecorator(
            decoration: const InputDecoration(
              labelText: 'Membre',
              suffixIcon: Icon(Icons.search),
              border: OutlineInputBorder(),
            ),
            child: Text(_member ?? 'Rechercher un membre…'),
          ),
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
          amount: 100,
          recipientName: _selectedMember?.name ?? _member ?? 'Membre',
          recipientEmail: _selectedMember?.email ?? '',
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
    final hasConditionIssue =
        _handoverConditions.values.any((condition) => condition != 'Bon');
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
        _handoverConditionSection(hasConditionIssue),
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

  Widget _handoverConditionSection(bool hasConditionIssue) {
    return _SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'État au départ',
            style: TextStyle(
              color: AppColors.donkerblauw,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Chaque constat, note et photo est lié à son propre numéro d’inventaire.',
            style: TextStyle(color: Colors.black54),
          ),
          const SizedBox(height: 12),
          ..._selection.values.map(
            (item) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.blueGrey.shade50,
                  border: Border.all(color: Colors.blueGrey.shade100),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.inventory_2_outlined,
                            color: AppColors.middenblauw),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '${item.inventoryNumber} · ${item.description}',
                            style: const TextStyle(
                              color: AppColors.donkerblauw,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      initialValue:
                          _handoverConditions[item.inventoryNumber] ?? 'Bon',
                      decoration: const InputDecoration(
                        labelText: 'État constaté',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'Bon',
                          child: Text('Bon · rien à signaler'),
                        ),
                        DropdownMenuItem(
                          value: 'À surveiller',
                          child: Text('À surveiller · trace ou usure'),
                        ),
                        DropdownMenuItem(
                          value: 'Endommagé',
                          child: Text('Endommagé · à documenter'),
                        ),
                      ],
                      onChanged: (value) => setState(() {
                        _handoverConditions[item.inventoryNumber] =
                            value ?? 'Bon';
                      }),
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      initialValue: _handoverNotes[item.inventoryNumber],
                      maxLines: 2,
                      onChanged: (value) => setState(() {
                        _handoverNotes[item.inventoryNumber] = value;
                      }),
                      decoration: InputDecoration(
                        labelText: 'Note pour ${item.inventoryNumber}',
                        hintText: 'Ex. petite rayure sur ce matériel…',
                        border: const OutlineInputBorder(),
                      ),
                    ),
                    if (_handoverNotes[item.inventoryNumber]
                            ?.trim()
                            .isNotEmpty ??
                        false)
                      const Padding(
                        padding: EdgeInsets.only(top: 6),
                        child: Text(
                          'Note liée à cet article ✓',
                          style:
                              TextStyle(color: AppColors.success, fontSize: 12),
                        ),
                      ),
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      onPressed: () => setState(
                        () => _handoverPhotos.add(item.inventoryNumber),
                      ),
                      icon: Icon(
                        _handoverPhotos.contains(item.inventoryNumber)
                            ? Icons.photo_library_outlined
                            : Icons.add_a_photo_outlined,
                      ),
                      label: Text(
                        _handoverPhotos.contains(item.inventoryNumber)
                            ? 'Photo de ${item.inventoryNumber} ajoutée ✓'
                            : 'Ajouter une photo de ${item.inventoryNumber}',
                      ),
                    ),
                    if (_handoverPhotos.contains(item.inventoryNumber)) ...[
                      const SizedBox(height: 8),
                      Container(
                        height: 68,
                        width: double.infinity,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.blueGrey.shade100),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.image_outlined,
                                color: AppColors.middenblauw),
                            const SizedBox(width: 8),
                            Text('Photo liée à ${item.inventoryNumber}'),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
          if (hasConditionIssue) ...[
            const _InfoBanner(
              icon: Icons.warning_amber,
              text:
                  'Un article n’est pas déclaré en parfait état. Ajoutez une note et, si utile, une photo.',
            ),
            const SizedBox(height: 10),
          ],
        ],
      ),
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

class _MemberSearchSheet extends StatefulWidget {
  final List<_DemoMember> members;
  final String? selectedMember;

  const _MemberSearchSheet({
    required this.members,
    required this.selectedMember,
  });

  @override
  State<_MemberSearchSheet> createState() => _MemberSearchSheetState();
}

class _MemberSearchSheetState extends State<_MemberSearchSheet> {
  final TextEditingController _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final normalizedQuery = _query.trim().toLowerCase();
    final filteredMembers = widget.members.where((member) {
      if (normalizedQuery.isEmpty) return true;
      return '${member.name} ${member.initials}'
          .toLowerCase()
          .contains(normalizedQuery);
    }).toList();

    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.82,
      child: Material(
        color: Colors.white,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Choisir un membre',
                      style: TextStyle(
                        color: AppColors.donkerblauw,
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              TextField(
                controller: _searchController,
                autofocus: true,
                onChanged: (value) => setState(() => _query = value),
                decoration: InputDecoration(
                  labelText: 'Rechercher par nom',
                  hintText: 'Ex. Alice ou Dupont',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _query.isEmpty
                      ? null
                      : IconButton(
                          onPressed: () {
                            _searchController.clear();
                            setState(() => _query = '');
                          },
                          icon: const Icon(Icons.clear),
                        ),
                  border: const OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                '${filteredMembers.length} membre(s)',
                style: const TextStyle(color: Colors.black54, fontSize: 12),
              ),
              const SizedBox(height: 4),
              Expanded(
                child: filteredMembers.isEmpty
                    ? const Center(
                        child: Text('Aucun membre trouvé.'),
                      )
                    : ListView.separated(
                        keyboardDismissBehavior:
                            ScrollViewKeyboardDismissBehavior.onDrag,
                        itemCount: filteredMembers.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final member = filteredMembers[index];
                          final selected = member.name == widget.selectedMember;
                          return ListTile(
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 4,
                              vertical: 2,
                            ),
                            leading: CircleAvatar(
                              backgroundColor: AppColors.lichtblauw,
                              child: Text(
                                member.initials,
                                style: const TextStyle(
                                  color: AppColors.donkerblauw,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                            title: Text(
                              member.name,
                              style: const TextStyle(
                                color: AppColors.donkerblauw,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            subtitle: const Text('Membre du club'),
                            trailing: selected
                                ? const Icon(Icons.check_circle,
                                    color: AppColors.success)
                                : const Icon(Icons.chevron_right),
                            onTap: () => Navigator.of(context).pop(member.name),
                          );
                        },
                      ),
              ),
            ],
          ),
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
            flex: 2,
            child: Text(
              'Taille / variante',
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
              'N° inventaire / série',
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

class _InventoryChoiceRow extends StatefulWidget {
  final String label;
  final _DemoItem? value;
  final List<_DemoItem> items;
  final ValueChanged<_DemoItem?> onChanged;

  const _InventoryChoiceRow({
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
  });

  @override
  State<_InventoryChoiceRow> createState() => _InventoryChoiceRowState();
}

class _InventoryChoiceRowState extends State<_InventoryChoiceRow> {
  late String? _variant;
  late _DemoItem? _selectedItem;

  @override
  void initState() {
    super.initState();
    _variant = widget.value?.option;
    _selectedItem = widget.value;
  }

  @override
  void didUpdateWidget(covariant _InventoryChoiceRow oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value) {
      _selectedItem = widget.value;
      _variant = widget.value?.option;
    }
  }

  List<String> get _variants => <String>{
        ...widget.items.map((item) => item.option),
      }.toList()
        ..sort();

  List<_DemoItem> get _itemsForVariant => widget.items
      .where((item) => _variant == null || item.option == _variant)
      .toList();

  void _selectVariant(String? variant) {
    setState(() {
      _variant = variant;
      _selectedItem = null;
    });
    widget.onChanged(null);
  }

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
                  widget.label,
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          flex: 2,
          child: DropdownButtonFormField<String?>(
            initialValue: _variant,
            decoration: const InputDecoration(
              hintText: 'Taille / variante',
              border: OutlineInputBorder(),
              contentPadding: EdgeInsets.symmetric(horizontal: 12),
            ),
            items: [
              const DropdownMenuItem<String?>(
                value: null,
                child: Text('—'),
              ),
              ..._variants.map(
                (variant) => DropdownMenuItem<String?>(
                  value: variant,
                  child: Text(variant),
                ),
              ),
            ],
            onChanged: _selectVariant,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          flex: 3,
          child: DropdownButtonFormField<_DemoItem?>(
            initialValue:
                _itemsForVariant.contains(_selectedItem) ? _selectedItem : null,
            decoration: const InputDecoration(
              hintText: 'Choisir un N°',
              border: OutlineInputBorder(),
              contentPadding: EdgeInsets.symmetric(horizontal: 12),
            ),
            items: [
              const DropdownMenuItem<_DemoItem?>(
                value: null,
                child: Text('Aucun article'),
              ),
              ..._itemsForVariant.map(
                (item) => DropdownMenuItem<_DemoItem?>(
                  value: item,
                  child: Text(
                    '${item.inventoryNumber} · ${item.description}',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            ],
            selectedItemBuilder: (context) => [
              const Align(
                alignment: Alignment.centerLeft,
                child: Text('Aucun article'),
              ),
              ..._itemsForVariant.map(
                (item) => Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    item.inventoryNumber,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            ],
            onChanged: _variant == null
                ? null
                : (item) {
                    setState(() => _selectedItem = item);
                    widget.onChanged(item);
                  },
          ),
        ),
      ],
    );
  }
}

class _InventoryPickerResult {
  final _DemoItem? item;

  const _InventoryPickerResult(this.item);
}

class _InventorySearchSheet extends StatefulWidget {
  final String title;
  final String? requestedOption;
  final _DemoItem? selectedItem;
  final List<_DemoItem> items;

  const _InventorySearchSheet({
    required this.title,
    required this.requestedOption,
    required this.selectedItem,
    required this.items,
  });

  @override
  State<_InventorySearchSheet> createState() => _InventorySearchSheetState();
}

class _InventorySearchSheetState extends State<_InventorySearchSheet> {
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  String _query = '';
  String _variantFilter = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _searchFocusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _searchFocusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final variants =
        <String>{...widget.items.map((item) => item.option)}.toList()..sort();
    final normalizedQuery = _query.trim().toLowerCase();
    final filteredItems = widget.items.where((item) {
      final matchesVariant =
          _variantFilter.isEmpty || item.option == _variantFilter;
      final searchable =
          '${item.inventoryNumber} ${item.option} ${item.description}'
              .toLowerCase();
      return matchesVariant &&
          (normalizedQuery.isEmpty || searchable.contains(normalizedQuery));
    }).toList();

    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.82,
      child: Material(
        color: Colors.white,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Choisir · ${widget.title}',
                      style: const TextStyle(
                        color: AppColors.donkerblauw,
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              if (widget.requestedOption != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    'Variante demandée · ${widget.requestedOption}',
                    style: const TextStyle(color: Colors.black54),
                  ),
                ),
              TextField(
                controller: _searchController,
                focusNode: _searchFocusNode,
                onChanged: (value) => setState(() => _query = value),
                decoration: InputDecoration(
                  labelText: 'Rechercher par taille ou N° inventaire',
                  hintText: 'Ex. XL, ORD-006 ou CRESSI',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _query.isEmpty
                      ? null
                      : IconButton(
                          onPressed: () {
                            _searchController.clear();
                            setState(() => _query = '');
                          },
                          icon: const Icon(Icons.clear),
                        ),
                  border: const OutlineInputBorder(),
                ),
              ),
              if (variants.length > 1) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    FilterChip(
                      label: const Text('Toutes'),
                      selected: _variantFilter.isEmpty,
                      onSelected: (_) => setState(() => _variantFilter = ''),
                    ),
                    ...variants.map(
                      (variant) => FilterChip(
                        label: Text(variant),
                        selected: _variantFilter == variant,
                        onSelected: (_) =>
                            setState(() => _variantFilter = variant),
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 8),
              Text(
                '${filteredItems.length} article(s) trouvé(s)',
                style: const TextStyle(color: Colors.black54, fontSize: 12),
              ),
              const SizedBox(height: 4),
              Expanded(
                child: ListView.separated(
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                  itemCount: filteredItems.length + 1,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    if (index == 0) {
                      return ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 4,
                          vertical: 2,
                        ),
                        leading: const Icon(Icons.remove_circle_outline),
                        title: const Text('Aucun article'),
                        subtitle: const Text('Laisser cette ligne vide'),
                        onTap: () => Navigator.of(context)
                            .pop(const _InventoryPickerResult(null)),
                      );
                    }
                    final item = filteredItems[index - 1];
                    final selected = item == widget.selectedItem;
                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 4,
                        vertical: 2,
                      ),
                      title: Row(
                        children: [
                          SizedBox(
                            width: 105,
                            child: Text(
                              item.inventoryNumber,
                              style: const TextStyle(
                                color: AppColors.donkerblauw,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          Expanded(
                            child: Text(
                              item.option,
                              style: const TextStyle(color: Colors.black54),
                            ),
                          ),
                        ],
                      ),
                      subtitle: Text(item.description),
                      trailing: selected
                          ? const Icon(Icons.check_circle,
                              color: AppColors.success)
                          : const Icon(Icons.chevron_right),
                      onTap: () => Navigator.of(context)
                          .pop(_InventoryPickerResult(item)),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PaymentPanel extends StatelessWidget {
  final String mode;
  final String status;
  final String handoverStatus;
  final double amount;
  final String recipientName;
  final String recipientEmail;
  final ValueChanged<String> onModeChanged;
  final VoidCallback onEmailSent;
  final VoidCallback onPaymentConfirmed;
  final VoidCallback onHandover;

  const _PaymentPanel({
    required this.mode,
    required this.status,
    required this.handoverStatus,
    required this.amount,
    required this.recipientName,
    required this.recipientEmail,
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
            label: 'Caution fixe',
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
                              'QR dans l’e-mail de l’étudiant',
                              style: TextStyle(
                                  color: AppColors.donkerblauw,
                                  fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Destinataire · $recipientName',
                              style: const TextStyle(color: Colors.black54),
                            ),
                            Text(
                              recipientEmail.isEmpty
                                  ? 'Aucune adresse e-mail enregistrée'
                                  : recipientEmail,
                              style: TextStyle(
                                color: recipientEmail.isEmpty
                                    ? Colors.deepOrange
                                    : AppColors.donkerblauw,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: [
                                OutlinedButton(
                                  onPressed: recipientEmail.isEmpty
                                      ? null
                                      : onEmailSent,
                                  child: Text(status == 'email_sent'
                                      ? 'E-mail envoyé à l’étudiant ✓'
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
  final Color? backgroundColor;
  final Color? borderColor;

  const _SurfaceCard({
    required this.child,
    this.onTap,
    this.margin = EdgeInsets.zero,
    this.backgroundColor,
    this.borderColor,
  });

  @override
  Widget build(BuildContext context) {
    final card = Material(
      color: backgroundColor ?? Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: borderColor == null
            ? BorderSide.none
            : BorderSide(color: borderColor!),
      ),
      clipBehavior: Clip.antiAlias,
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

class _DemoMember {
  final String name;
  final String initials;
  final String email;

  const _DemoMember({
    required this.name,
    required this.initials,
    required this.email,
  });
}

class _DemoReturnLoan {
  final String id;
  final String memberName;
  final String initials;
  final String returnDate;
  final double deposit;
  final List<String> itemNumbers;

  const _DemoReturnLoan({
    required this.id,
    required this.memberName,
    required this.initials,
    required this.returnDate,
    required this.deposit,
    required this.itemNumbers,
  });
}

class _DemoItem {
  final String inventoryNumber;
  final String description;
  final String option;

  const _DemoItem(this.inventoryNumber, this.description, this.option);

  String get label => '$inventoryNumber · $description';
}

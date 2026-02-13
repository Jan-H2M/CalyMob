import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../config/app_colors.dart';
import '../../models/operation.dart';
import '../../models/participant_operation.dart';
import '../../models/palanquee.dart';
import '../../services/palanquee_service.dart';
import '../../services/lifras_validation_service.dart';
import '../../services/palanquee_auto_assign_service.dart';
import '../../utils/fiche_palanquee_pdf.dart';

/// Écran de composition des palanquées (tap-to-assign)
class PalanqueeScreen extends StatefulWidget {
  final Operation operation;
  final List<ParticipantOperation> participants;
  final String clubId;
  final String userId;

  const PalanqueeScreen({
    Key? key,
    required this.operation,
    required this.participants,
    required this.clubId,
    required this.userId,
  }) : super(key: key);

  @override
  State<PalanqueeScreen> createState() => _PalanqueeScreenState();
}

class _PalanqueeScreenState extends State<PalanqueeScreen> {
  final PalanqueeService _service = PalanqueeService();

  List<Palanquee> _palanquees = [];
  Map<String, String> _memberLevels = {};
  Map<int, ValidationResult> _validationResults = {};

  bool _isLoading = true;
  bool _isSaving = false;
  bool _hasChanges = false;
  bool _unassignedExpanded = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);

    try {
      // Charger niveaux de plongée + assignments en parallèle
      final futures = await Future.wait([
        _fetchMemberLevels(),
        _service.getAssignments(widget.clubId, widget.operation.id),
      ]);

      _memberLevels = futures[0] as Map<String, String>;
      final assignments = futures[1] as PalanqueeAssignments?;

      if (assignments != null && assignments.palanquees.isNotEmpty) {
        _palanquees = assignments.palanquees;
      }

      _revalidate();
    } catch (e) {
      debugPrint('❌ Erreur chargement palanquées: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<Map<String, String>> _fetchMemberLevels() async {
    final memberIds = widget.participants
        .map((p) => p.membreId)
        .where((id) => id.isNotEmpty)
        .toList();
    if (memberIds.isEmpty) return {};

    final levels = <String, String>{};
    final chunks = <List<String>>[];
    for (var i = 0; i < memberIds.length; i += 30) {
      chunks.add(memberIds.sublist(i, (i + 30).clamp(0, memberIds.length)));
    }

    for (final chunk in chunks) {
      final snapshot = await FirebaseFirestore.instance
          .collection('clubs')
          .doc(widget.clubId)
          .collection('members')
          .where(FieldPath.documentId, whereIn: chunk)
          .get();

      for (final doc in snapshot.docs) {
        final data = doc.data();
        final code = data['plongeur_code'] as String?;
        final niveau = data['plongeur_niveau'] as String?;
        if (code != null && code.isNotEmpty) {
          levels[doc.id] = code;
        } else if (niveau != null && niveau.isNotEmpty) {
          levels[doc.id] = normalizeLevelCode(niveau);
        }
      }
    }
    return levels;
  }

  /// Alle participants die nog niet zijn toegewezen
  List<ParticipantOperation> get _unassignedParticipants {
    final assignedIds = <String>{};
    for (final pal in _palanquees) {
      for (final p in pal.participants) {
        assignedIds.add(p.membreId);
      }
    }
    return widget.participants.where((p) => !assignedIds.contains(p.membreId)).toList();
  }

  String _getLevelForMember(String membreId) {
    return _memberLevels[membreId] ?? '';
  }

  String _getLevelDisplay(String level) {
    if (level.isEmpty) return '?';
    if (RegExp(r'^\d$').hasMatch(level)) return '$level★';
    return level;
  }

  void _revalidate() {
    _validationResults = validateAllPalanquees(
      _palanquees,
      lieuType: widget.operation.lieu,
    );
  }

  // ============================================================
  // Actions
  // ============================================================

  void _addPalanquee() {
    setState(() {
      final nextNum = _palanquees.isEmpty ? 1 : _palanquees.last.numero + 1;
      _palanquees.add(Palanquee(numero: nextNum));
      _hasChanges = true;
      _revalidate();
    });
  }

  void _removePalanquee(int numero) {
    setState(() {
      _palanquees.removeWhere((p) => p.numero == numero);
      // Renumeroter
      for (int i = 0; i < _palanquees.length; i++) {
        _palanquees[i] = _palanquees[i].copyWith(numero: i + 1);
      }
      _hasChanges = true;
      _revalidate();
    });
  }

  void _assignTopalanquee(ParticipantOperation participant, int palanqueeNumero) {
    setState(() {
      final palIdx = _palanquees.indexWhere((p) => p.numero == palanqueeNumero);
      if (palIdx == -1) return;

      final level = _getLevelForMember(participant.membreId);
      final newParticipant = PalanqueeParticipant(
        membreId: participant.membreId,
        membreNom: participant.membreNom ?? '',
        membrePrenom: participant.membrePrenom ?? '',
        niveau: level,
        ordre: _palanquees[palIdx].participants.length,
      );

      final updatedParticipants = List<PalanqueeParticipant>.from(_palanquees[palIdx].participants)
        ..add(newParticipant);

      _palanquees[palIdx] = _palanquees[palIdx].copyWith(participants: updatedParticipants);
      _hasChanges = true;
      _revalidate();
    });
  }

  void _removeFromPalanquee(int palanqueeNumero, String membreId) {
    setState(() {
      final palIdx = _palanquees.indexWhere((p) => p.numero == palanqueeNumero);
      if (palIdx == -1) return;

      final updatedParticipants = _palanquees[palIdx]
          .participants
          .where((p) => p.membreId != membreId)
          .toList();

      _palanquees[palIdx] = _palanquees[palIdx].copyWith(participants: updatedParticipants);
      _hasChanges = true;
      _revalidate();
    });
  }

  Future<void> _save() async {
    setState(() => _isSaving = true);
    try {
      final assignments = PalanqueeAssignments(
        palanquees: _palanquees,
        updatedBy: widget.userId,
      );
      await _service.saveAssignments(
        widget.clubId,
        widget.operation.id,
        assignments,
        widget.userId,
      );
      setState(() => _hasChanges = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Palanquées sauvegardées ✓'),
            backgroundColor: Colors.green,
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  void _autoAssign() {
    // Convertir tous les participants en PalanqueeParticipant
    final allParticipants = widget.participants.map((p) {
      final level = _getLevelForMember(p.membreId);
      return PalanqueeParticipant(
        membreId: p.membreId,
        membreNom: p.membreNom ?? '',
        membrePrenom: p.membrePrenom ?? '',
        niveau: level,
      );
    }).toList();

    final result = PalanqueeAutoAssignService.autoAssign(
      allParticipants,
      lieuType: widget.operation.lieu,
    );

    setState(() {
      _palanquees = result.palanquees;
      _hasChanges = true;
      _revalidate();
    });

    if (result.warnings.isNotEmpty) {
      _showWarningsDialog(result.warnings);
    }
  }

  Future<void> _generatePdf() async {
    try {
      await FichePalanqueePdf.generateAndShare(
        context: context,
        operation: widget.operation,
        participants: widget.participants,
        clubId: widget.clubId,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur PDF: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  void _showWarningsDialog(List<String> warnings) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.warning_amber, color: Colors.orange),
            SizedBox(width: 8),
            Text('Avertissements', style: TextStyle(fontSize: 16)),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: warnings
                .map((w) => Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('• ', style: TextStyle(fontWeight: FontWeight.bold)),
                          Expanded(child: Text(w, style: const TextStyle(fontSize: 13))),
                        ],
                      ),
                    ))
                .toList(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  // ============================================================
  // Bottom sheets
  // ============================================================

  void _showAddMemberBottomSheet(int palanqueeNumero) {
    final unassigned = _unassignedParticipants;
    if (unassigned.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Tous les plongeurs sont déjà assignés'),
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.5,
        minChildSize: 0.3,
        maxChildSize: 0.8,
        expand: false,
        builder: (ctx, scrollController) {
          return Column(
            children: [
              // Handle
              Container(
                margin: const EdgeInsets.only(top: 8),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  'Ajouter à la palanquée $palanqueeNumero',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppColors.donkerblauw,
                  ),
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: ListView.builder(
                  controller: scrollController,
                  itemCount: unassigned.length,
                  itemBuilder: (ctx, idx) {
                    final p = unassigned[idx];
                    final level = _getLevelForMember(p.membreId);
                    return ListTile(
                      dense: true,
                      title: Text(
                        '${(p.membreNom ?? '').toUpperCase()} ${p.membrePrenom ?? ''}',
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                      ),
                      trailing: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: _levelColor(level).withOpacity(0.15),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: _levelColor(level).withOpacity(0.4)),
                        ),
                        child: Text(
                          _getLevelDisplay(level),
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                            color: _levelColor(level),
                          ),
                        ),
                      ),
                      onTap: () {
                        _assignTopalanquee(p, palanqueeNumero);
                        Navigator.pop(ctx);
                      },
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showAssignToBottomSheet(ParticipantOperation participant) {
    if (_palanquees.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Créez d\'abord une palanquée'),
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 8),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey[300],
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(
              'Assigner ${(participant.membreNom ?? '').toUpperCase()} ${participant.membrePrenom ?? ''}',
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: AppColors.donkerblauw,
              ),
            ),
          ),
          const Divider(height: 1),
          ..._palanquees.map((pal) {
            final validation = _validationResults[pal.numero];
            final depthText = validation?.maxDepth != null ? '${validation!.maxDepth}m' : '—';
            return ListTile(
              leading: CircleAvatar(
                radius: 16,
                backgroundColor: AppColors.middenblauw,
                child: Text('${pal.numero}', style: const TextStyle(color: Colors.white, fontSize: 14)),
              ),
              title: Text('Palanquée ${pal.numero}'),
              subtitle: Text('${pal.participants.length} plongeur(s) • $depthText'),
              trailing: const Icon(Icons.add_circle_outline, color: AppColors.middenblauw),
              onTap: () {
                _assignTopalanquee(participant, pal.numero);
                Navigator.pop(context);
              },
            );
          }),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Color _levelColor(String level) {
    final code = normalizeLevelCode(level);
    switch (code) {
      case 'NB':
        return Colors.grey;
      case '1':
        return Colors.orange;
      case '2':
        return Colors.blue;
      case '3':
        return Colors.green[700]!;
      case '4':
        return Colors.purple;
      case 'AM':
        return Colors.teal;
      case 'MC':
      case 'MF':
      case 'MN':
        return Colors.red[700]!;
      default:
        return Colors.grey;
    }
  }

  // ============================================================
  // Build
  // ============================================================

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[50],
      appBar: AppBar(
        title: const Text('Palanquées', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: AppColors.donkerblauw,
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          // Auto-assign
          IconButton(
            onPressed: _isLoading ? null : _autoAssign,
            icon: const Icon(Icons.auto_fix_high),
            tooltip: 'Auto-assigner',
          ),
          // PDF
          IconButton(
            onPressed: _isLoading ? null : _generatePdf,
            icon: const Icon(Icons.picture_as_pdf),
            tooltip: 'Fiche de palanquée (PDF)',
          ),
          // Save
          IconButton(
            onPressed: (_hasChanges && !_isSaving) ? _save : null,
            icon: _isSaving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : Icon(
                    Icons.save,
                    color: _hasChanges ? AppColors.oranje : Colors.white38,
                  ),
            tooltip: 'Sauvegarder',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // Info bar
                _buildInfoBar(),
                // Content
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.only(bottom: 100),
                    children: [
                      // Non assignés
                      _buildUnassignedPanel(),
                      // Palanquées
                      ..._palanquees.map((pal) => _buildPalanqueeCard(pal)),
                      // Ajouter palanquée button
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        child: OutlinedButton.icon(
                          onPressed: _addPalanquee,
                          icon: const Icon(Icons.add),
                          label: const Text('Ajouter une palanquée'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.middenblauw,
                            side: const BorderSide(color: AppColors.middenblauw),
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildInfoBar() {
    final total = widget.participants.length;
    final assigned = total - _unassignedParticipants.length;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: AppColors.donkerblauw.withOpacity(0.08),
      child: Row(
        children: [
          Icon(Icons.groups, size: 18, color: AppColors.donkerblauw),
          const SizedBox(width: 6),
          Text(
            '$assigned/$total assignés',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: assigned == total ? Colors.green[700] : AppColors.donkerblauw,
            ),
          ),
          const Spacer(),
          Text(
            '${_palanquees.length} palanquée${_palanquees.length != 1 ? 's' : ''}',
            style: const TextStyle(fontSize: 13, color: AppColors.donkerblauw),
          ),
          if (_hasChanges) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.oranje.withOpacity(0.2),
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Text(
                'Non sauvegardé',
                style: TextStyle(fontSize: 10, color: AppColors.oranje, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildUnassignedPanel() {
    final unassigned = _unassignedParticipants;
    return Card(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ExpansionTile(
        initiallyExpanded: _unassignedExpanded,
        onExpansionChanged: (expanded) => _unassignedExpanded = expanded,
        leading: Icon(
          Icons.person_off,
          color: unassigned.isEmpty ? Colors.green : AppColors.oranje,
          size: 20,
        ),
        title: Text(
          'Non assignés (${unassigned.length})',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 14,
            color: unassigned.isEmpty ? Colors.green[700] : AppColors.donkerblauw,
          ),
        ),
        children: unassigned.isEmpty
            ? [
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text(
                    'Tous les plongeurs sont assignés ✓',
                    style: TextStyle(color: Colors.green, fontStyle: FontStyle.italic),
                  ),
                ),
              ]
            : unassigned.map((p) {
                final level = _getLevelForMember(p.membreId);
                return ListTile(
                  dense: true,
                  title: Text(
                    '${(p.membreNom ?? '').toUpperCase()} ${p.membrePrenom ?? ''}',
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                  ),
                  trailing: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: _levelColor(level).withOpacity(0.15),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: _levelColor(level).withOpacity(0.4)),
                    ),
                    child: Text(
                      _getLevelDisplay(level),
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                        color: _levelColor(level),
                      ),
                    ),
                  ),
                  onTap: () => _showAssignToBottomSheet(p),
                );
              }).toList(),
      ),
    );
  }

  Widget _buildPalanqueeCard(Palanquee pal) {
    final validation = _validationResults[pal.numero];
    final isValid = validation?.valid ?? true;
    final maxDepth = validation?.maxDepth;
    final hasErrors = validation != null && validation.errors.isNotEmpty;
    final hasWarnings = validation != null && validation.warnings.isNotEmpty;

    Color statusColor;
    IconData statusIcon;
    if (pal.participants.isEmpty) {
      statusColor = Colors.grey;
      statusIcon = Icons.remove_circle_outline;
    } else if (hasErrors) {
      statusColor = Colors.red;
      statusIcon = Icons.error;
    } else if (hasWarnings) {
      statusColor = Colors.orange;
      statusIcon = Icons.warning_amber;
    } else {
      statusColor = Colors.green;
      statusIcon = Icons.check_circle;
    }

    return Card(
      margin: const EdgeInsets.fromLTRB(12, 4, 12, 4),
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: hasErrors ? Colors.red.withOpacity(0.4) : Colors.transparent,
          width: hasErrors ? 1.5 : 0,
        ),
      ),
      child: Column(
        children: [
          // Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.donkerblauw,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
            ),
            child: Row(
              children: [
                Text(
                  'Palanquée ${pal.numero}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(width: 8),
                if (maxDepth != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '${maxDepth}m',
                      style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                    ),
                  ),
                const Spacer(),
                Icon(statusIcon, color: statusColor == Colors.green ? Colors.greenAccent : statusColor, size: 18),
                const SizedBox(width: 4),
                // Supprimer palanquée
                InkWell(
                  onTap: () => _confirmRemovePalanquee(pal.numero),
                  child: const Icon(Icons.delete_outline, color: Colors.white54, size: 18),
                ),
              ],
            ),
          ),

          // Validation banner
          if (hasErrors || hasWarnings)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              color: (hasErrors ? Colors.red : Colors.orange).withOpacity(0.1),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (hasErrors)
                    ...validation!.errors.map((e) => Padding(
                          padding: const EdgeInsets.only(bottom: 2),
                          child: Text(
                            e.message,
                            style: const TextStyle(color: Colors.red, fontSize: 11, fontWeight: FontWeight.w500),
                          ),
                        )),
                  if (hasWarnings && !hasErrors)
                    Text(
                      '${validation!.warnings.length} avis',
                      style: const TextStyle(color: Colors.orange, fontSize: 11, fontWeight: FontWeight.w500),
                    ),
                ],
              ),
            ),

          // Participants
          if (pal.participants.isEmpty)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'Aucun plongeur',
                style: TextStyle(color: Colors.grey, fontStyle: FontStyle.italic, fontSize: 13),
              ),
            )
          else
            ...pal.participants.map((p) => _buildParticipantTile(pal.numero, p)),

          // Ajouter button
          InkWell(
            onTap: () => _showAddMemberBottomSheet(pal.numero),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                border: Border(top: BorderSide(color: Colors.grey[200]!)),
                borderRadius: const BorderRadius.vertical(bottom: Radius.circular(12)),
              ),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.add, size: 16, color: AppColors.middenblauw),
                  SizedBox(width: 4),
                  Text(
                    'Ajouter',
                    style: TextStyle(
                      color: AppColors.middenblauw,
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
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

  Widget _buildParticipantTile(int palanqueeNumero, PalanqueeParticipant p) {
    final level = p.niveau.isNotEmpty ? p.niveau : _getLevelForMember(p.membreId);
    return Dismissible(
      key: ValueKey('${palanqueeNumero}_${p.membreId}'),
      direction: DismissDirection.endToStart,
      background: Container(
        color: Colors.red[50],
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 16),
        child: const Icon(Icons.remove_circle, color: Colors.red),
      ),
      confirmDismiss: (_) async {
        _removeFromPalanquee(palanqueeNumero, p.membreId);
        return false; // We handle the removal manually
      },
      child: ListTile(
        dense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 0),
        title: Text(
          '${p.membreNom.toUpperCase()} ${p.membrePrenom}',
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
        ),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: _levelColor(level).withOpacity(0.15),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            _getLevelDisplay(level),
            style: TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 12,
              color: _levelColor(level),
            ),
          ),
        ),
        onTap: () => _confirmRemoveParticipant(palanqueeNumero, p),
      ),
    );
  }

  void _confirmRemoveParticipant(int palanqueeNumero, PalanqueeParticipant p) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Retirer le plongeur ?', style: TextStyle(fontSize: 16)),
        content: Text('${p.membreNom} ${p.membrePrenom} sera remis dans les non assignés.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () {
              _removeFromPalanquee(palanqueeNumero, p.membreId);
              Navigator.pop(ctx);
            },
            child: const Text('Retirer', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  void _confirmRemovePalanquee(int numero) {
    final pal = _palanquees.firstWhere((p) => p.numero == numero);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Supprimer la palanquée ?', style: TextStyle(fontSize: 16)),
        content: Text(
          pal.participants.isEmpty
              ? 'Supprimer la palanquée $numero ?'
              : 'Les ${pal.participants.length} plongeurs seront remis dans les non assignés.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () {
              _removePalanquee(numero);
              Navigator.pop(ctx);
            },
            child: const Text('Supprimer', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}

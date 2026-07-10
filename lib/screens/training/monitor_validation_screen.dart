/// Carnet de Formation — Monitor validation screen.
///
/// Opened by a monitor from their inbox when a student declared an exercise
/// and picked them as validator. Shows the claim context, lets the monitor
/// confirm / correct / reject with one tap.
///
/// On accept : sets claim status to 'accepted' — the onClaimAccepted Cloud
/// Function then writes the official member_observation server-side.
///
/// Spec : `CARNET_DE_FORMATION_TECH.md` v2.1 §11 (mockup 04 monitor pane).

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/formation_task.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/formation_task_service.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class MonitorValidationScreen extends StatefulWidget {
  final FormationTask task;
  const MonitorValidationScreen({super.key, required this.task});

  @override
  State<MonitorValidationScreen> createState() =>
      _MonitorValidationScreenState();
}

class _MonitorValidationScreenState extends State<MonitorValidationScreen> {
  final FormationTaskService _taskService = FormationTaskService();
  Map<String, dynamic>? _claim;
  bool _loading = true;
  bool _submitting = false;
  final TextEditingController _comment = TextEditingController();
  final Map<String, Future<String>> _evidenceUrls = {};

  bool get _isExternalProof =>
      widget.task.type == FormationTaskType.externalProofReview;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final claimId = widget.task.context.exerciseClaimId;
    if (claimId == null) {
      setState(() => _loading = false);
      return;
    }
    const clubId = FirebaseConfig.defaultClubId;
    final snap = await FirebaseFirestore.instance
        .collection('clubs')
        .doc(clubId)
        .collection('exercise_claims')
        .doc(claimId)
        .get();
    setState(() {
      _claim = snap.data();
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final keyboardInset = MediaQuery.viewInsetsOf(context).bottom;

    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _header(),
              Expanded(
                child: _loading
                    ? const Center(
                        child: CircularProgressIndicator(color: Colors.white))
                    : _claim == null
                        ? const Center(
                            child: Text(
                              'Claim non trouvée',
                              style: TextStyle(color: Colors.white),
                            ),
                          )
                        : _body(),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: _loading || _claim == null
          ? null
          : AnimatedPadding(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOut,
              padding: EdgeInsets.only(bottom: keyboardInset),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ElevatedButton.icon(
                        onPressed:
                            _submitting ? null : () => _decide('accepted'),
                        icon: const Icon(Icons.check_circle),
                        label: Text(_isExternalProof
                            ? 'Accepter la preuve'
                            : 'Confirmer comme acquis'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF4CAF50),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          minimumSize: const Size.fromHeight(48),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: _submitting
                                  ? null
                                  : _isExternalProof
                                      ? _promptAskInfo
                                      : () => _decide('corrected'),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: Colors.white,
                                side: const BorderSide(color: Colors.white),
                                padding:
                                    const EdgeInsets.symmetric(vertical: 14),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                              child: Text(_isExternalProof
                                  ? 'Demander des infos'
                                  : 'En progrès'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton(
                              onPressed: _submitting ? null : _promptReject,
                              style: OutlinedButton.styleFrom(
                                foregroundColor: const Color(0xFFE5484D),
                                side:
                                    const BorderSide(color: Color(0xFFE5484D)),
                                padding:
                                    const EdgeInsets.symmetric(vertical: 14),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                              child: const Text('Refuser'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
    );
  }

  Widget _header() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 12, 8, 12),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white, size: 26),
            onPressed: () => Navigator.pop(context),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _isExternalProof
                      ? 'Contrôle de preuve'
                      : 'Validation à confirmer',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  _isExternalProof
                      ? 'Vérifie la pièce jointe avant de décider'
                      : 'Tu es désigné·e comme validateur',
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _body() {
    final c = _claim!;
    final memberName = c['member_name'] ?? c['member_id'] ?? 'Élève';
    final exerciseCode = c['exercise_code'] ?? c['exercise_id'] ?? '';
    final exerciseLabel = c['exercise_label'] ?? '';
    final context = c['context_type'] == 'pool' ? 'Piscine' : 'Sortie';
    final notes = c['declaration_notes'] ?? '';
    final evidence =
        (c['evidence'] as List?)?.whereType<Map<String, dynamic>>().toList() ??
            const <Map<String, dynamic>>[];

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      children: [
        // Top context card
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFB8E2BC)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'DEMANDE DE $memberName'.toUpperCase(),
                style: const TextStyle(
                  color: Color(0xFF2E7D32),
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.1,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                exerciseCode,
                style: const TextStyle(
                  color: AppColors.donkerblauw,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (exerciseLabel.toString().isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    exerciseLabel,
                    style: TextStyle(
                      color: AppColors.donkerblauw.withValues(alpha: 0.7),
                      fontSize: 13,
                    ),
                  ),
                ),
              const SizedBox(height: 6),
              Text(
                '$context · ${_formatContextRef(c)}',
                style: TextStyle(
                  color: AppColors.donkerblauw.withValues(alpha: 0.65),
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
        if (notes.toString().isNotEmpty) ...[
          const SizedBox(height: 14),
          _sectionTitle('NOTE DE L\'ÉLÈVE'),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.96),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Text(
              '« $notes »',
              style: TextStyle(
                color: AppColors.donkerblauw.withValues(alpha: 0.85),
                fontSize: 13.5,
                fontStyle: FontStyle.italic,
              ),
            ),
          ),
        ],
        if (_isExternalProof) ...[
          const SizedBox(height: 14),
          _sectionTitle('PREUVE TRANSMISE'),
          if (evidence.isEmpty)
            _infoCard(
              icon: Icons.image_not_supported_outlined,
              text: 'Aucune photo exploitable n’est jointe à cette demande.',
            )
          else
            ...evidence.map(_evidenceCard),
        ],
        const SizedBox(height: 14),
        _sectionTitle('TON COMMENTAIRE (optionnel)'),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.96),
            borderRadius: BorderRadius.circular(14),
          ),
          child: TextField(
            controller: _comment,
            maxLines: 3,
            decoration: const InputDecoration(
              hintText: 'Ex: « Excellent contrôle de la palanquée »',
              border: InputBorder.none,
            ),
          ),
        ),
      ],
    );
  }

  Widget _sectionTitle(String s) => Padding(
        padding: const EdgeInsets.only(bottom: 6, left: 2),
        child: Text(
          s,
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.85),
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.2,
          ),
        ),
      );

  Widget _infoCard({required IconData icon, required String text}) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.96),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            Icon(icon, color: const Color(0xFFE08A00)),
            const SizedBox(width: 10),
            Expanded(child: Text(text)),
          ],
        ),
      );

  Widget _evidenceCard(Map<String, dynamic> evidence) {
    final storagePath = evidence['storage_path']?.toString();
    final directUrl = evidence['download_url']?.toString();
    if ((storagePath == null || storagePath.isEmpty) &&
        (directUrl == null || directUrl.isEmpty)) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: _infoCard(
          icon: Icons.broken_image_outlined,
          text: 'Une preuve est enregistrée, mais son fichier est introuvable.',
        ),
      );
    }

    final key = directUrl?.isNotEmpty == true ? directUrl! : storagePath!;
    final future = _evidenceUrls.putIfAbsent(
      key,
      () => directUrl?.isNotEmpty == true
          ? Future.value(directUrl!)
          : FirebaseStorage.instance.ref(storagePath!).getDownloadURL(),
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: FutureBuilder<String>(
        future: future,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return _infoCard(
              icon: Icons.broken_image_outlined,
              text: 'La photo n’a pas pu être chargée.',
            );
          }
          if (!snapshot.hasData) {
            return const SizedBox(
              height: 160,
              child: Center(
                child: CircularProgressIndicator(color: Colors.white),
              ),
            );
          }
          final url = snapshot.data!;
          return GestureDetector(
            onTap: () => _showEvidence(url),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Stack(
                alignment: Alignment.bottomRight,
                children: [
                  Image.network(
                    url,
                    width: double.infinity,
                    height: 220,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => _infoCard(
                      icon: Icons.broken_image_outlined,
                      text: 'La photo n’a pas pu être affichée.',
                    ),
                  ),
                  Container(
                    margin: const EdgeInsets.all(10),
                    padding: const EdgeInsets.all(7),
                    decoration: const BoxDecoration(
                      color: Colors.black54,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.zoom_in, color: Colors.white),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _showEvidence(String url) => showDialog<void>(
        context: context,
        builder: (dialogContext) => Dialog.fullscreen(
          backgroundColor: Colors.black,
          child: SafeArea(
            child: Stack(
              children: [
                Center(
                  child: InteractiveViewer(
                    minScale: 0.7,
                    maxScale: 5,
                    child: Image.network(url),
                  ),
                ),
                Positioned(
                  top: 8,
                  right: 8,
                  child: IconButton(
                    onPressed: () => Navigator.of(dialogContext).pop(),
                    icon: const Icon(Icons.close, color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
        ),
      );

  String _formatContextRef(Map<String, dynamic> c) {
    return c['operation_id'] ?? c['pool_session_id'] ?? '—';
  }

  static const List<String> _rejectSuggestions = [
    'Technique à retravailler',
    'Conditions insuffisantes',
    'Exercice incomplet',
  ];

  Future<void> _promptAskInfo() async {
    final controller = TextEditingController(text: _comment.text);
    final question = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Demander plus d’informations'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: 3,
          decoration: const InputDecoration(
            hintText: 'Quelle information ou nouvelle photo faut-il fournir ?',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () {
              final text = controller.text.trim();
              if (text.isNotEmpty) Navigator.of(dialogContext).pop(text);
            },
            child: const Text('Envoyer'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (question == null || question.isEmpty || !mounted) return;
    _comment.text = question;
    await _decide('draft', decisionKey: 'ask_info');
  }

  /// Ouvre le dialogue de refus : raison obligatoire (min 10 caractères) +
  /// chips de suggestion. Le bouton reste désactivé tant que la raison est
  /// trop courte (WP-02, décision D2).
  Future<void> _promptReject() async {
    final controller = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            final text = controller.text.trim();
            final valid = text.length >= 10;
            return AlertDialog(
              title: const Text('Refuser l\'exercice'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Explique à l\'élève ce qu\'il doit corriger. '
                    'Cette raison lui sera envoyée immédiatement.',
                    style: TextStyle(fontSize: 13),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: controller,
                    autofocus: true,
                    maxLines: 3,
                    onChanged: (_) => setDialogState(() {}),
                    decoration: InputDecoration(
                      hintText: 'Raison du refus (min. 10 caractères)',
                      border: const OutlineInputBorder(),
                      errorText: text.isNotEmpty && !valid
                          ? 'Encore un peu de détail (min. 10 caractères)'
                          : null,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: _rejectSuggestions.map((s) {
                      return ActionChip(
                        label: Text(s, style: const TextStyle(fontSize: 12)),
                        onPressed: () {
                          controller.text = s;
                          controller.selection = TextSelection.fromPosition(
                            TextPosition(offset: controller.text.length),
                          );
                          setDialogState(() {});
                        },
                      );
                    }).toList(),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text('Annuler'),
                ),
                ElevatedButton(
                  onPressed: valid
                      ? () => Navigator.of(dialogContext).pop(text)
                      : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFE5484D),
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('Confirmer le refus'),
                ),
              ],
            );
          },
        );
      },
    );
    controller.dispose();

    if (reason == null || reason.trim().length < 10) return;
    if (!mounted) return;
    final userId = context.read<AuthProvider>().currentUser?.uid;
    await _decide('rejected', extraDecision: {
      'rejected_reason': reason.trim(),
      'rejected_by': userId,
      'rejected_at': FieldValue.serverTimestamp(),
    });
  }

  Future<void> _decide(
    String newStatus, {
    Map<String, dynamic>? extraDecision,
    String? decisionKey,
  }) async {
    if (_claim == null) return;
    setState(() => _submitting = true);
    try {
      final auth = context.read<AuthProvider>();
      final memberProvider = context.read<MemberProvider>();
      final userId = auth.currentUser?.uid;
      if (userId == null) throw 'Session non identifiée';

      const clubId = FirebaseConfig.defaultClubId;
      final claimId = widget.task.context.exerciseClaimId!;

      final decidedByName =
          '${memberProvider.prenom ?? ''} ${memberProvider.nom ?? ''}'.trim();

      final decision = <String, dynamic>{
        'decided_by': userId,
        'decided_by_name': decidedByName,
        'decided_at': FieldValue.serverTimestamp(),
        'comment': _comment.text.isEmpty ? null : _comment.text,
        if (extraDecision != null) ...extraDecision,
      };

      await FirebaseFirestore.instance
          .collection('clubs')
          .doc(clubId)
          .collection('exercise_claims')
          .doc(claimId)
          .update({
        'status': newStatus,
        'decision': decision,
        'updated_at': FieldValue.serverTimestamp(),
      });

      // The Cloud Function onClaimAccepted handles the rest if accepted.
      // We still want to resolve the validation task locally for non-accepted
      // outcomes (no CF picks them up).
      if (_isExternalProof || newStatus != 'accepted') {
        await _taskService.markDone(
          clubId,
          widget.task.id,
          userId,
          completionData: _isExternalProof
              ? {
                  'decision': decisionKey ??
                      (newStatus == 'accepted' ? 'accept' : 'reject'),
                  'claim_id': claimId,
                  if (_comment.text.trim().isNotEmpty)
                    'comment': _comment.text.trim(),
                }
              : null,
        );
      }

      if (mounted) {
        final label = newStatus == 'accepted'
            ? 'Acquis ✓'
            : newStatus == 'draft'
                ? 'Informations demandées'
                : newStatus == 'corrected'
                    ? 'En progrès'
                    : 'Refusé';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(label)),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur : $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

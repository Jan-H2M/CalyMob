import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/historical_exercise_claim_batch.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/historical_exercise_claim_service.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class HistoricalValidationScreen extends StatefulWidget {
  final String batchId;
  const HistoricalValidationScreen({super.key, required this.batchId});

  @override
  State<HistoricalValidationScreen> createState() =>
      _HistoricalValidationScreenState();
}

class _HistoricalValidationScreenState
    extends State<HistoricalValidationScreen> {
  final _service = HistoricalExerciseClaimService();
  final _commentController = TextEditingController();
  final _decisions = <String, HistoricalExerciseClaimDecision>{};
  HistoricalExerciseClaimBatch? _batch;
  bool _loading = true;
  bool _checkedPaperCard = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _loadBatch();
  }

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _loadBatch() async {
    final batch = await _service.getBatch(
      clubId: FirebaseConfig.defaultClubId,
      batchId: widget.batchId,
    );
    if (!mounted) return;
    setState(() {
      _batch = batch;
      _loading = false;
    });
  }

  Future<void> _submit(List<HistoricalExerciseClaim> claims) async {
    final auth = context.read<AuthProvider>();
    final member = context.read<MemberProvider>();
    final monitorId = auth.currentUser?.uid;
    if (monitorId == null) return;

    final effectiveDecisions = <String, HistoricalExerciseClaimDecision>{
      for (final claim in claims)
        claim.id:
            _decisions[claim.id] ?? HistoricalExerciseClaimDecision.accepted,
    };

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Valider officiellement ?'),
        content: Text(
          'Les exercices marqués OK seront ajoutés à la progression officielle de ${_batch?.memberName ?? 'cet élève'}.\n\n'
          'Les exercices refusés resteront visibles avec ton commentaire.\n\n'
          'Confirme uniquement si tu as vu la carte papier.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Valider'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    setState(() => _submitting = true);
    try {
      await _service.validateBatch(
        clubId: FirebaseConfig.defaultClubId,
        batchId: widget.batchId,
        monitorId: monitorId,
        monitorName: member.displayName,
        decisions: effectiveDecisions,
        comment: _commentController.text,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Reprise validée')),
      );
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Impossible de valider: $e')),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
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
                        child: CircularProgressIndicator(color: Colors.white),
                      )
                    : _batch == null
                        ? const Center(
                            child: Text(
                              'Reprise introuvable',
                              style: TextStyle(color: Colors.white),
                            ),
                          )
                        : _body(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 16, 10),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          const Expanded(
            child: Text(
              'Validation carte papier',
              style: TextStyle(
                color: Colors.white,
                fontSize: 21,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _body() {
    return StreamBuilder<List<HistoricalExerciseClaim>>(
      stream: _service.streamBatchClaims(
        clubId: FirebaseConfig.defaultClubId,
        batchId: widget.batchId,
      ),
      builder: (context, snap) {
        final claims = snap.data ?? const <HistoricalExerciseClaim>[];
        if (claims.isEmpty) {
          return const Center(
            child: Text(
              'Aucun exercice soumis',
              style: TextStyle(color: Colors.white),
            ),
          );
        }

        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          children: [
            _introCard(),
            const SizedBox(height: 14),
            _claimsCard(claims),
            const SizedBox(height: 14),
            _commentField(),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: _checkedPaperCard && !_submitting
                  ? () => _submit(claims)
                  : null,
              icon: _submitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.verified),
              label: const Text('Valider officiellement'),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _introCard() {
    return _WhiteCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${_batch?.memberName ?? 'Élève'} · ${_batch?.targetLevel ?? ''}',
            style: const TextStyle(
              color: AppColors.donkerblauw,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Étape 3/3 — validation officielle\n'
            'Compare cette liste avec la carte papier. Les exercices acceptés '
            'seront ajoutés à la progression officielle.',
            style: TextStyle(
              color: AppColors.donkerblauw.withValues(alpha: 0.78),
              height: 1.38,
            ),
          ),
          const SizedBox(height: 12),
          CheckboxListTile(
            value: _checkedPaperCard,
            onChanged: (value) =>
                setState(() => _checkedPaperCard = value == true),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: const Text(
              'J’ai vérifié la carte papier',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            subtitle: const Text(
              'Ne valide que si la carte physique confirme la liste.',
            ),
          ),
        ],
      ),
    );
  }

  Widget _claimsCard(List<HistoricalExerciseClaim> claims) {
    return _WhiteCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 14, 16, 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Exercices soumis',
                style: TextStyle(
                  color: AppColors.donkerblauw,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
          const Divider(height: 1),
          for (final claim in claims) _claimRow(claim),
        ],
      ),
    );
  }

  Widget _claimRow(HistoricalExerciseClaim claim) {
    final decision =
        _decisions[claim.id] ?? HistoricalExerciseClaimDecision.accepted;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  claim.exerciseCode,
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  claim.exerciseLabel,
                  style: TextStyle(
                    color: AppColors.donkerblauw.withValues(alpha: 0.68),
                    fontSize: 12.5,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          SegmentedButton<HistoricalExerciseClaimDecision>(
            segments: const [
              ButtonSegment(
                value: HistoricalExerciseClaimDecision.accepted,
                label: Text('OK'),
              ),
              ButtonSegment(
                value: HistoricalExerciseClaimDecision.rejected,
                label: Text('Refuser'),
              ),
            ],
            selected: {decision},
            onSelectionChanged: (selection) {
              setState(() => _decisions[claim.id] = selection.first);
            },
            showSelectedIcon: false,
            style: ButtonStyle(
              visualDensity: VisualDensity.compact,
              textStyle: WidgetStateProperty.all(
                const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _commentField() {
    return TextField(
      controller: _commentController,
      minLines: 2,
      maxLines: 4,
      decoration: InputDecoration(
        filled: true,
        fillColor: Colors.white,
        labelText: 'Commentaire audit',
        hintText: 'Ex. carte papier vérifiée à Watermael',
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
  }
}

class _WhiteCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  const _WhiteCard({
    required this.child,
    this.padding = const EdgeInsets.all(16),
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: child,
    );
  }
}

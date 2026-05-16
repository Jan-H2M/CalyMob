import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/exercice_lifras.dart';
import '../../models/historical_exercise_claim_batch.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/historical_exercise_claim_service.dart';
import '../../services/lifras_service.dart';
import '../../utils/plongeur_utils.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'historical_validation_screen.dart';

class HistoricalClaimsScreen extends StatefulWidget {
  const HistoricalClaimsScreen({super.key});

  @override
  State<HistoricalClaimsScreen> createState() => _HistoricalClaimsScreenState();
}

class _HistoricalClaimsScreenState extends State<HistoricalClaimsScreen> {
  final _lifrasService = LifrasService();
  final _historicalService = HistoricalExerciseClaimService();
  final _noteController = TextEditingController();
  final _selected = <String>{};
  List<ExerciceLIFRAS> _catalog = const [];
  NiveauLIFRAS? _targetNiveau;
  bool _loading = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadCatalog());
  }

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _loadCatalog() async {
    final member = context.read<MemberProvider>();
    final target = PlongeurUtils.getTargetNiveau(
      plongeurCode: member.plongeurCode,
      formationActive: member.formationActive,
    );

    setState(() {
      _loading = true;
      _targetNiveau = target;
    });

    final exercises = target == null
        ? await _lifrasService.getAllExercices(FirebaseConfig.defaultClubId)
        : await _lifrasService.getExercicesByNiveau(
            FirebaseConfig.defaultClubId,
            target,
          );

    if (!mounted) return;
    setState(() {
      _catalog = exercises.where((e) => e.niveau != NiveauLIFRAS.tn).toList();
      _loading = false;
    });
  }

  Future<void> _submit() async {
    final auth = context.read<AuthProvider>();
    final member = context.read<MemberProvider>();
    final userId = auth.currentUser?.uid;
    if (userId == null || _selected.isEmpty) return;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Soumettre cette reprise ?'),
        content: const Text(
          'Tes exercices passeront en statut "à vérifier".\n\n'
          'Ils ne compteront officiellement qu’après contrôle de ta carte '
          'papier par un moniteur.\n\n'
          'Prochaine étape : montre ta carte papier au club ou à la piscine.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Soumettre'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    setState(() => _submitting = true);
    try {
      final selectedExercises =
          _catalog.where((e) => _selected.contains(e.id)).toList();
      final batchId = await _historicalService.submitHistoricalClaims(
        clubId: FirebaseConfig.defaultClubId,
        memberId: userId,
        memberName: member.displayName,
        targetLevel: _targetNiveau?.code ?? member.plongeurCode ?? '',
        exercises: selectedExercises,
        note: _noteController.text,
      );
      if (!mounted) return;
      _selected.clear();
      _noteController.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Reprise envoyée pour vérification')),
      );
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => HistoricalClaimQrScreen(batchId: batchId),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Impossible d’envoyer la reprise: $e')),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final userId = context.watch<AuthProvider>().currentUser?.uid;
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
                    : ListView(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                        children: [
                          _explanationCard(),
                          const SizedBox(height: 14),
                          _exerciseList(),
                          const SizedBox(height: 14),
                          _noteField(),
                          const SizedBox(height: 18),
                          _submitButton(),
                          if (userId != null) ...[
                            const SizedBox(height: 24),
                            _history(userId),
                          ],
                        ],
                      ),
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
              'Reprendre ma carte papier',
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

  Widget _explanationCard() {
    return _WhiteCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Tu as déjà une carte papier ?',
            style: TextStyle(
              color: AppColors.donkerblauw,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Étape 1/3 — préparation\n'
            'Coche ici uniquement les exercices déjà signés sur ta carte papier. '
            'Rien ne sera validé sans contrôle d’un moniteur.',
            style: TextStyle(
              color: AppColors.donkerblauw.withValues(alpha: 0.78),
              height: 1.38,
            ),
          ),
          const SizedBox(height: 12),
          const _InfoLine(
            icon: Icons.fact_check_outlined,
            text:
                'Après l’envoi, ces exercices seront affichés comme "à vérifier".',
          ),
          const SizedBox(height: 8),
          const _InfoLine(
            icon: Icons.badge_outlined,
            text: 'Montre ensuite la carte papier au club ou à la piscine.',
          ),
        ],
      ),
    );
  }

  Widget _exerciseList() {
    if (_catalog.isEmpty) {
      return const _WhiteCard(
        child: Text('Aucun exercice LIFRAS trouvé pour ce niveau.'),
      );
    }
    return _WhiteCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Brevet ${_targetNiveau?.code ?? ''}',
                    style: const TextStyle(
                      color: AppColors.donkerblauw,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                Text(
                  '${_selected.length} sélectionné${_selected.length > 1 ? 's' : ''}',
                  style: TextStyle(
                    color: AppColors.donkerblauw.withValues(alpha: 0.6),
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          for (final exercise in _catalog)
            CheckboxListTile(
              value: _selected.contains(exercise.id),
              onChanged: (checked) {
                setState(() {
                  if (checked == true) {
                    _selected.add(exercise.id);
                  } else {
                    _selected.remove(exercise.id);
                  }
                });
              },
              controlAffinity: ListTileControlAffinity.leading,
              title: Text(
                exercise.code,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              subtitle: Text(exercise.description),
            ),
        ],
      ),
    );
  }

  Widget _noteField() {
    return TextField(
      controller: _noteController,
      minLines: 2,
      maxLines: 4,
      decoration: InputDecoration(
        filled: true,
        fillColor: Colors.white,
        labelText: 'Note pour le moniteur',
        hintText: 'Ex. carte signée par Michel, dates non lisibles',
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
  }

  Widget _submitButton() {
    return FilledButton.icon(
      onPressed: _selected.isEmpty || _submitting ? null : _submit,
      icon: _submitting
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const Icon(Icons.send),
      label: Text(
        _selected.isEmpty
            ? 'Sélectionne au moins un exercice'
            : 'Soumettre pour vérification',
      ),
      style: FilledButton.styleFrom(
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
  }

  Widget _history(String userId) {
    return StreamBuilder<List<HistoricalExerciseClaimBatch>>(
      stream: _historicalService.streamMemberBatches(
        clubId: FirebaseConfig.defaultClubId,
        memberId: userId,
      ),
      builder: (context, snap) {
        final batches = snap.data ?? const <HistoricalExerciseClaimBatch>[];
        if (batches.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Mes reprises envoyées',
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 10),
            for (final batch in batches.take(5))
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _WhiteCard(
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(batch.status.label),
                    subtitle: Text(
                      '${batch.claimIds.length} exercice${batch.claimIds.length > 1 ? 's' : ''} · ${batch.targetLevel ?? ''}',
                    ),
                    trailing: const Icon(Icons.qr_code_2),
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => HistoricalClaimQrScreen(
                          batchId: batch.id,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

class HistoricalClaimQrScreen extends StatelessWidget {
  final String batchId;
  const HistoricalClaimQrScreen({super.key, required this.batchId});

  @override
  Widget build(BuildContext context) {
    final qrPayload = 'calymob://historical-validation?batchId=$batchId';
    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(8, 8, 16, 10),
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.arrow_back, color: Colors.white),
                      onPressed: () => Navigator.pop(context),
                    ),
                    const Expanded(
                      child: Text(
                        'Reprise envoyée',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 21,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: _WhiteCard(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text(
                            'Étape 2/3 — contrôle par un moniteur',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: AppColors.donkerblauw,
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            'Montre ta carte papier à un moniteur. Il peut scanner ce QR pour ouvrir la liste. Ces exercices ne sont pas encore officiels.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color:
                                  AppColors.donkerblauw.withValues(alpha: 0.75),
                              height: 1.35,
                            ),
                          ),
                          const SizedBox(height: 20),
                          QrImageView(
                            data: qrPayload,
                            size: 220,
                            backgroundColor: Colors.white,
                          ),
                          const SizedBox(height: 14),
                          Text(
                            'Statut : À vérifier',
                            style: TextStyle(
                              color:
                                  AppColors.donkerblauw.withValues(alpha: 0.72),
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 18),
                          OutlinedButton.icon(
                            icon: const Icon(Icons.admin_panel_settings),
                            label: const Text('Ouvrir en mode moniteur'),
                            onPressed: () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => HistoricalValidationScreen(
                                  batchId: batchId,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
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

class _InfoLine extends StatelessWidget {
  final IconData icon;
  final String text;
  const _InfoLine({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: AppColors.middenblauw),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              color: AppColors.donkerblauw.withValues(alpha: 0.72),
              fontSize: 13,
              height: 1.3,
            ),
          ),
        ),
      ],
    );
  }
}

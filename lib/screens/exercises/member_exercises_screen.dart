import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/exercice_valide.dart';
import '../../models/exercice_lifras.dart';
import '../../models/formation_snapshot_doc.dart';
import '../../models/mil_experience_overview.dart';
import '../../providers/exercice_valide_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/exercice_valide_service.dart';
import '../../services/lifras_service.dart';
import '../../services/formation_snapshot_reader.dart';
import '../../services/mil_experience_service.dart';
import '../../utils/date_formatter.dart';
import '../../models/member_formation_dossier.dart';
import '../../models/member_profile.dart';
import '../../utils/permission_helper.dart';
import '../formation/student_360_screen.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../../widgets/formation/mil_requirements_card.dart';
import '../../widgets/formation/mil_protocol_code_sheet.dart';
import '../training/historical_claims_screen.dart';
import '../training/external_proof_capture_screen.dart';
import '../training/evaluation_request_screen.dart';
import 'validate_exercise_screen.dart';

/// Écran affichant les exercices LIFRAS d'un membre.
///
/// Deux modes:
/// - **isOwnProfile == true** → liste condensée 'À faire / Validés' pour le
///   target-niveau du membre. Lecture seule: la validation passe désormais
///   par les observations encadrants (Carnet de Formation) qui déclenchent
///   automatiquement la création d'un exercice validé via la Cloud Function
///   `onObservationAcquis`. Les anciennes déclarations 'pending' éventuelles
///   sont affichées comme à-faire avec une petite étiquette discrète.
/// - **isOwnProfile == false** → klassieke readonly lijst van validated
///   exercices met filter-chips (oude gedrag), eventueel met CRUD voor
///   moniteurs.
class MemberExercisesScreen extends StatefulWidget {
  final String memberId;
  final String memberName;
  final bool isMonitor; // L'utilisateur actuel est moniteur (peut éditer)
  final bool isOwnProfile; // C'est le profil de l'utilisateur lui-même

  const MemberExercisesScreen({
    super.key,
    required this.memberId,
    required this.memberName,
    this.isMonitor = false,
    this.isOwnProfile = false,
  });

  @override
  State<MemberExercisesScreen> createState() => _MemberExercisesScreenState();
}

@visibleForTesting
class MemberFormationExperienceSection extends StatelessWidget {
  final FormationSnapshotDoc? snapshot;
  final MilExperienceOverview? overview;
  final bool loading;

  const MemberFormationExperienceSection({
    super.key,
    required this.snapshot,
    this.overview,
    required this.loading,
  });

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Center(child: CircularProgressIndicator());
    }
    final data = snapshot;
    final experience = overview ??
        (data == null ? null : MilExperienceOverview.fromSnapshot(data));
    if (experience == null || experience.isEmpty) {
      return const SizedBox.shrink();
    }
    return MilRequirementsCard(overview: experience);
  }
}

class _MemberExercisesScreenState extends State<MemberExercisesScreen> {
  final ExerciceValideService _service = ExerciceValideService();
  final LifrasService _lifrasService = LifrasService();
  final FormationSnapshotReader _formationReader = FormationSnapshotReader();
  final MilExperienceService _milExperienceService = MilExperienceService();
  final String _clubId = FirebaseConfig.defaultClubId;

  // Catalog for self-declaration view
  List<ExerciceLIFRAS> _catalog = [];
  NiveauLIFRAS? _targetNiveau;
  bool _isLoadingCatalog = false;
  bool _catalogFailed = false;
  FormationSnapshotDoc? _formationSnapshot;
  MilExperienceOverview? _milOverview;
  bool _isLoadingFormationSnapshot = false;

  // Classic view state (non-self)
  List<ExerciceValide> _exercices = [];
  bool _isLoading = true;
  String? _errorMessage;
  NiveauLIFRAS? _filterNiveau;

  @override
  void initState() {
    super.initState();
    if (widget.isOwnProfile) {
      // For self: listen to the stream of exercices_valides + load catalog
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final provider = context.read<ExerciceValideProvider>();
        provider.listenToMemberExercices(_clubId, widget.memberId);
        _loadCatalog();
        _loadFormationSnapshot();
      });
    } else {
      _loadExercices();
    }
  }

  Future<void> _loadCatalog() async {
    final memberProvider = context.read<MemberProvider>();

    final target = dossierTargetNiveau(
      memberTarget: memberProvider.targetFormationLevel,
      currentCode: memberProvider.plongeurCode,
      snapshotTarget: _formationSnapshot?.targetLevel,
    );

    if (target == null) {
      debugPrint(
          '⚠️ Aucun niveau cible pour plongeur_code="${memberProvider.plongeurCode}"');
      if (mounted) {
        setState(() {
          _catalog = [];
          _targetNiveau = null;
        });
      }
      return;
    }

    setState(() {
      _isLoadingCatalog = true;
      _catalogFailed = false;
      _catalog = [];
      _targetNiveau = target;
    });

    try {
      final exercices =
          await _lifrasService.getExercicesByNiveau(_clubId, target);
      if (!mounted) return;
      setState(() {
        _catalog = exercices;
        _isLoadingCatalog = false;
      });
    } catch (e) {
      debugPrint('❌ Erreur chargement catalogue: $e');
      if (!mounted) return;
      setState(() {
        _isLoadingCatalog = false;
        _catalogFailed = true;
      });
    }
  }

  Future<void> _loadFormationSnapshot() async {
    setState(() => _isLoadingFormationSnapshot = true);
    final member = context.read<MemberProvider>();
    final snapshot =
        await _formationReader.getSnapshot(_clubId, widget.memberId);
    MilExperienceOverview? overview;
    try {
      overview = await _milExperienceService.load(
        clubId: _clubId,
        memberId: widget.memberId,
        preferredBrevet: resolvePreferredMilBrevet(
          targetFormationLevel: member.targetFormationLevel,
          currentCode: member.plongeurCode,
          snapshotTargetLevel: snapshot?.targetLevel,
        ),
      );
    } catch (error, stackTrace) {
      debugPrint('[member_exercises] lecture MIL impossible: '
          '$error\n$stackTrace');
    }
    if (!mounted) return;
    setState(() {
      _formationSnapshot = snapshot;
      final preferred = resolvePreferredMilBrevet(
        targetFormationLevel: member.targetFormationLevel,
        currentCode: member.plongeurCode,
        snapshotTargetLevel: snapshot?.targetLevel,
      );
      _milOverview = overview ??
          (snapshot != null &&
                  milBrevetCodeForTarget(snapshot.targetLevel) == preferred
              ? MilExperienceOverview.fromSnapshot(snapshot)
              : MilExperienceOverview(
                  preferredBrevet: preferred, byBrevet: const {}));
      _isLoadingFormationSnapshot = false;
    });
  }

  Future<void> _loadExercices() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      _exercices =
          await _service.getMemberExercicesValides(_clubId, widget.memberId);
    } catch (e) {
      _errorMessage = e.toString();
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  // ============================================================
  // Classic (non-self) view helpers — unchanged behavior
  // ============================================================

  List<ExerciceValide> get _filteredExercices {
    if (_filterNiveau == null) return _exercices;
    return _exercices.where((e) => e.exerciceNiveau == _filterNiveau).toList();
  }

  Future<void> _deleteExercice(ExerciceValide exercice) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Supprimer ?'),
        content: Text(
            'Voulez-vous supprimer la validation de "${exercice.exerciceCode}" ?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child:
                const Text('Supprimer', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      await _service.deleteExerciceValide(
        clubId: _clubId,
        memberId: widget.memberId,
        exerciceValideId: exercice.id,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Exercice supprimé'),
            backgroundColor: Colors.green,
          ),
        );
        _loadExercices();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  // ============================================================
  // Build
  // ============================================================

  @override
  Widget build(BuildContext context) {
    if (widget.isOwnProfile) return _buildSelfView();
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.isOwnProfile ? 'Mes exercices' : 'Exercices validés',
              style: const TextStyle(color: Colors.white),
            ),
            Text(
              widget.memberName,
              style: const TextStyle(fontSize: 14, color: Colors.white70),
            ),
          ],
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          if (widget.isMonitor && !widget.isOwnProfile)
            IconButton(
              icon: const Icon(Icons.add),
              onPressed: () async {
                final result = await Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ValidateExerciseScreen(
                      memberId: widget.memberId,
                      memberName: widget.memberName,
                    ),
                  ),
                );
                if (result == true) {
                  _loadExercices();
                }
              },
              tooltip: 'Valider un exercice',
            ),
          if (widget.isOwnProfile)
            IconButton(
              icon: const Icon(Icons.add_a_photo_outlined),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const ExternalProofCaptureScreen(),
                ),
              ),
              tooltip: 'Preuve externe',
            ),
          if (widget.isOwnProfile)
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: _loadCatalog,
              tooltip: 'Rafraîchir',
            ),
        ],
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.fish,
        child: SafeArea(
          child: widget.isOwnProfile ? _buildSelfView() : _buildClassicView(),
        ),
      ),
    );
  }

  // ============================================================
  // Self view — compact 2-section list (À faire / Validés)
  // ============================================================

  Widget _buildSelfView() {
    return Consumer<ExerciceValideProvider>(
      builder: (context, provider, _) {
        final member = context.watch<MemberProvider>();
        final desiredTarget = dossierTargetNiveau(
          memberTarget: member.targetFormationLevel,
          currentCode: member.plongeurCode,
          snapshotTarget: _formationSnapshot?.targetLevel,
        );
        if (!_isLoadingCatalog && desiredTarget != _targetNiveau) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              _loadCatalog();
              _loadFormationSnapshot();
            }
          });
          return const Scaffold(
              body: Center(child: CircularProgressIndicator()));
        }
        if (_isLoadingCatalog ||
            _isLoadingFormationSnapshot ||
            provider.isLoading) {
          return const Scaffold(
              body: Center(child: CircularProgressIndicator()));
        }

        if (_targetNiveau == null) {
          return Scaffold(
              appBar: AppBar(title: const Text('Mes exercices')),
              body: _buildNoNiveauState());
        }
        if (_catalogFailed) {
          return Scaffold(
              appBar: AppBar(title: const Text('Mes exercices')),
              body: Center(
                  child: TextButton.icon(
                      onPressed: _loadCatalog,
                      icon: const Icon(Icons.refresh),
                      label:
                          const Text('Catalogue indisponible · Réessayer'))));
        }

        // Split catalog three ways:
        //   - target exercises that are still TODO (priority — top of list)
        //   - target exercises already validated
        //   - "Tous Niveaux" specialties (Etanche / Nitrox / …) — bottom,
        //     less central to brevet progression but useful to surface
        // Pending declarations (legacy self-declare flow) get a discreet
        // "demande envoyée" tag in TODO.
        final targetTodo = <ExerciceLIFRAS>[];
        final targetValidated = <ExerciceLIFRAS>[];
        final tnAll = <ExerciceLIFRAS>[];
        final pendingIds = <String>{};

        for (final ex in _catalog) {
          final isTN = ex.niveau == NiveauLIFRAS.tn;
          final match = _matchingValidations(provider.exercicesValides, ex);
          final isValid = match.any((e) => e.isValidated);
          final isPending = match.any((e) => e.isPending);

          if (isTN) {
            tnAll.add(ex);
            if (isPending) pendingIds.add(ex.id);
            continue;
          }
          if (isValid) {
            targetValidated.add(ex);
          } else {
            targetTodo.add(ex);
            if (isPending) pendingIds.add(ex.id);
          }
        }

        final snapshot = memberDossierSnapshot(
          memberId: widget.memberId,
          currentCode: member.plongeurCode ?? '',
          target: _targetNiveau!,
          catalog: _catalog,
          validations: provider.exercicesValides,
          source: _formationSnapshot,
        );
        List<Widget> sections(bool pool) {
          bool included(ExerciceLIFRAS ex) => pool
              ? formationModalityForExercise(ex.code, ex.description) ==
                  FormationModality.pool
              : formationModalityForExercise(ex.code, ex.description) !=
                  FormationModality.pool;
          final todo = targetTodo.where(included).toList();
          final validated = targetValidated.where(included).toList();
          return [
            _buildSelfActions(),
            const SizedBox(height: 8),
            _buildSection(
              title: 'À faire',
              icon: Icons.radio_button_unchecked,
              iconColor: Colors.amber,
              emptyText: todo.isEmpty && validated.isEmpty
                  ? 'Aucune épreuve renseignée dans ce volet pour ce brevet.'
                  : 'Toutes les épreuves de ce volet sont validées.',
              children: todo
                  .map((ex) =>
                      _buildTodoRow(ex, isPending: pendingIds.contains(ex.id)))
                  .toList(),
            ),
            const SizedBox(height: 12),
            _buildSection(
              title: 'Validés',
              icon: Icons.check_circle,
              iconColor: Colors.greenAccent,
              emptyText: 'Aucune épreuve validée dans ce volet.',
              children: validated
                  .map((ex) => _buildValidatedRow(
                      ex,
                      _matchingValidations(provider.exercicesValides, ex)
                          .firstWhere((v) => v.isValidated)))
                  .toList(),
            ),
          ];
        }

        return Student360Screen(
          clubId: _clubId,
          member: MemberProfile(
            id: widget.memberId,
            nom: member.nom ?? '',
            prenom: member.prenom ?? '',
            email: member.email ?? '',
            photoUrl: member.photoUrl,
            plongeurCode: member.plongeurCode,
            targetFormationLevel: member.targetFormationLevel,
            formationActive: member.formationActive,
          ),
          scope: FormationTrackingScope.full,
          isOwnProfile: true,
          providedSnapshot: snapshot,
          providedMilOverview: _milOverview,
          exerciseSections: sections,
          appBarActions: [
            IconButton(
              tooltip: 'Preuve externe',
              icon: const Icon(Icons.add_a_photo_outlined),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => const ExternalProofCaptureScreen())),
            ),
            IconButton(
              tooltip: 'Rafraîchir',
              icon: const Icon(Icons.refresh),
              onPressed: () async {
                await Future.wait([_loadCatalog(), _loadFormationSnapshot()]);
              },
            ),
          ],
          specialties: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _buildSelfActions(),
              const SizedBox(height: 8),
              _buildSection(
                title: 'Spécialités (Tous niveaux)',
                icon: Icons.workspace_premium_outlined,
                iconColor: Colors.tealAccent,
                emptyText: 'Aucune spécialité renseignée.',
                children: tnAll.map((ex) {
                  final matches =
                      _matchingValidations(provider.exercicesValides, ex);
                  if (matches.any((v) => v.isValidated)) {
                    return _buildValidatedRow(
                        ex, matches.firstWhere((v) => v.isValidated));
                  }
                  return _buildTodoRow(ex,
                      isPending: pendingIds.contains(ex.id));
                }).toList(),
              ),
            ],
          ),
        );
      },
    );
  }

  Iterable<ExerciceValide> _matchingValidations(
    List<ExerciceValide> validations,
    ExerciceLIFRAS exercice,
  ) {
    return validations.where(
      (validation) =>
          validation.exerciceId == exercice.id ||
          validation.exerciceCode == exercice.code,
    );
  }

  Widget _buildSelfActions() {
    return Container(
      decoration: BoxDecoration(
          color: AppColors.donkerblauw.withValues(alpha: 0.65),
          borderRadius: BorderRadius.circular(12)),
      child: Wrap(
        spacing: 8,
        runSpacing: 4,
        children: [
          TextButton.icon(
            style: TextButton.styleFrom(
                foregroundColor: Colors.white, minimumSize: const Size(48, 48)),
            icon: const Icon(Icons.fact_check_outlined, size: 18),
            label: const Text('Demander une évaluation',
                style: TextStyle(fontSize: 12)),
            onPressed: () => _openEvaluationRequest(),
          ),
          TextButton.icon(
            style: TextButton.styleFrom(
                foregroundColor: Colors.white, minimumSize: const Size(48, 48)),
            icon: const Icon(Icons.history_edu_outlined, size: 18),
            label: const Text('Exercices sur papier',
                style: TextStyle(fontSize: 12)),
            onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) => const HistoricalClaimsScreen())),
          ),
        ],
      ),
    );
  }

  Future<void> _openEvaluationRequest([ExerciceLIFRAS? selected]) async {
    await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => EvaluationRequestScreen(
        exercises: _catalog.map(EvaluationExerciseOption.fromExercise).toList(),
        initialExerciseId: selected?.id,
      ),
    ));
  }

  Widget _buildSection({
    required String title,
    required IconData icon,
    required Color iconColor,
    required String? emptyText,
    required List<Widget> children,
  }) {
    if (children.isEmpty && emptyText == null) {
      // Skip empty 'En attente' section entirely
      return const SizedBox.shrink();
    }
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
          color: AppColors.donkerblauw.withValues(alpha: 0.65),
          borderRadius: BorderRadius.circular(14)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section header — white text on the blue ocean gradient.
          Row(
            children: [
              Icon(icon, size: 18, color: Colors.white),
              const SizedBox(width: 6),
              Expanded(
                  child: Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 15,
                  color: Colors.white,
                  shadows: [
                    Shadow(
                      offset: Offset(0, 1),
                      blurRadius: 3,
                      color: Colors.black26,
                    ),
                  ],
                ),
              )),
              const SizedBox(width: 6),
              if (children.isNotEmpty)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.22),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.35),
                    ),
                  ),
                  child: Text(
                    children.length.toString(),
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          if (children.isEmpty && emptyText != null)
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.donkerblauw.withValues(alpha: 0.65),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                emptyText,
                style: const TextStyle(
                  fontSize: 13,
                  color: Colors.white70,
                ),
              ),
            )
          else
            // Wrap all rows in one white card so dark text reads cleanly
            // on the blue ocean gradient backdrop.
            Container(
              decoration: BoxDecoration(
                color: AppColors.donkerblauw.withValues(alpha: 0.65),
                borderRadius: BorderRadius.circular(14),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.08),
                    blurRadius: 10,
                    offset: const Offset(0, 3),
                  ),
                ],
              ),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Column(
                children: [
                  for (int i = 0; i < children.length; i++) ...[
                    if (i > 0)
                      const Divider(
                        height: 1,
                        thickness: 1,
                        color: Colors.white12,
                      ),
                    children[i],
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }

  /// Compact one-line row used for both 'À faire' and 'Validés'.
  /// Tap on a validated row → bottom sheet with full details.
  Widget _buildExerciceRow({
    required ExerciceLIFRAS exercice,
    required bool isValidated,
    String? trailingText,
    String? hintTag,
    String? sourceTag,
    VoidCallback? onTap,
  }) {
    final niveauColor = _getNiveauColor(exercice.niveau);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            // Niveau badge / status indicator
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: isValidated
                    ? Colors.green
                    : niveauColor.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(6),
                border: isValidated
                    ? null
                    : Border.all(color: niveauColor.withValues(alpha: 0.4)),
              ),
              child: Center(
                child: isValidated
                    ? const Icon(Icons.check, size: 16, color: Colors.white)
                    : Text(
                        exercice.niveau.code,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 10,
                        ),
                      ),
              ),
            ),
            const SizedBox(width: 12),
            // Code (bold) + description (one line, ellipsis)
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Wrap(
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        exercice.code,
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                          color: Colors.white,
                        ),
                      ),
                      if (hintTag != null) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: Colors.orange[50],
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            hintTag,
                            style: TextStyle(
                              fontSize: 10,
                              color: Colors.orange[800],
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                      if (sourceTag != null) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: Colors.green[50],
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            sourceTag,
                            style: TextStyle(
                              fontSize: 10,
                              color: Colors.green[800],
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  Text(
                    exercice.description,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      color: Colors.white70,
                    ),
                  ),
                ],
              ),
            ),
            if (trailingText != null) ...[
              const SizedBox(width: 8),
              Text(
                trailingText,
                style: const TextStyle(fontSize: 11, color: Colors.white70),
              ),
            ],
            IconButton(
              tooltip: 'Voir le protocole MIL',
              onPressed: exercice.code.trim().isEmpty
                  ? null
                  : () => MilProtocolCodeSheet.show(context,
                      clubId: _clubId, code: exercice.code),
              icon: const Icon(Icons.info_outline, color: Colors.white70),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTodoRow(ExerciceLIFRAS exercice, {bool isPending = false}) {
    return _buildExerciceRow(
      exercice: exercice,
      isValidated: false,
      hintTag: isPending ? 'demande envoyée' : null,
      onTap: isPending ? null : () => _openEvaluationRequest(exercice),
    );
  }

  Widget _buildValidatedRow(
      ExerciceLIFRAS exercice, ExerciceValide validation) {
    return _buildExerciceRow(
      exercice: exercice,
      isValidated: true,
      sourceTag: validation.isFromCarnetFormation ? 'QR moniteur' : null,
      trailingText: DateFormatter.formatShort(validation.dateValidation),
      onTap: () => _showValidatedDetails(exercice, validation),
    );
  }

  void _showValidatedDetails(
      ExerciceLIFRAS exercice, ExerciceValide validation) {
    showModalBottomSheet(
      context: context,
      builder: (context) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: _getNiveauColor(exercice.niveau),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    exercice.niveau.code,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    exercice.code,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(exercice.description, style: const TextStyle(fontSize: 15)),
            const Divider(height: 32),
            _buildDetailRow(Icons.calendar_today, 'Validé le',
                DateFormatter.formatLong(validation.dateValidation)),
            if (validation.moniteurNom.isNotEmpty)
              _buildDetailRow(Icons.person, 'Moniteur', validation.moniteurNom),
            if (validation.isFromCarnetFormation)
              _buildDetailRow(
                Icons.verified_user_outlined,
                'Origine',
                'Confirmé par un moniteur via le carnet de formation',
              ),
            if (validation.lieu != null && validation.lieu!.isNotEmpty)
              _buildDetailRow(Icons.location_on, 'Lieu', validation.lieu!),
            if (validation.notes != null && validation.notes!.isNotEmpty)
              _buildDetailRow(Icons.notes, 'Notes', validation.notes!),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Widget _buildNoNiveauState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.help_outline, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              'Niveau non déterminé',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: Colors.grey[700],
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Ton niveau de plongeur n\'est pas encore défini dans ton profil. '
              'Contacte un responsable du club pour le mettre à jour.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
      ),
    );
  }

  // ============================================================
  // Classic view (non-self) — preserved from original implementation
  // ============================================================

  Widget _buildClassicView() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_errorMessage != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 64, color: Colors.red[300]),
            const SizedBox(height: 16),
            Text(_errorMessage!, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadExercices,
              child: const Text('Réessayer'),
            ),
          ],
        ),
      );
    }
    if (_exercices.isEmpty) {
      return _buildClassicEmptyState();
    }
    return _buildClassicContent();
  }

  Widget _buildClassicEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.assignment_outlined, size: 80, color: Colors.grey[400]),
          const SizedBox(height: 16),
          Text(
            'Aucun exercice validé',
            style: TextStyle(
              fontSize: 18,
              color: Colors.grey[600],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Les exercices validés apparaîtront ici',
            style: TextStyle(color: Colors.grey[500]),
          ),
          if (widget.isMonitor) ...[
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () async {
                final result = await Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ValidateExerciseScreen(
                      memberId: widget.memberId,
                      memberName: widget.memberName,
                    ),
                  ),
                );
                if (result == true) {
                  _loadExercices();
                }
              },
              icon: const Icon(Icons.add),
              label: const Text('Valider un exercice'),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.teal),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildClassicContent() {
    final stats = _service.getStats(_exercices);

    return Column(
      children: [
        // Stats header
        Container(
          padding: const EdgeInsets.all(16),
          color: Colors.teal[50],
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildStat(
                  'Total', stats['validatedCount'].toString(), Colors.teal),
              if (stats['lastValidation'] != null)
                _buildStat(
                  'Dernière',
                  DateFormatter.formatShort(
                      stats['lastValidation'] as DateTime),
                  Colors.blue,
                ),
            ],
          ),
        ),

        // Filter chips
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Row(
            children: [
              FilterChip(
                label: const Text('Tous'),
                selected: _filterNiveau == null,
                onSelected: (_) => setState(() => _filterNiveau = null),
                selectedColor: Colors.teal[100],
              ),
              const SizedBox(width: 8),
              ..._getAvailableNiveaux().map(
                (niveau) => Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(niveau.code),
                    selected: _filterNiveau == niveau,
                    onSelected: (_) => setState(() => _filterNiveau = niveau),
                    selectedColor:
                        _getNiveauColor(niveau).withValues(alpha: 0.3),
                    avatar: CircleAvatar(
                      backgroundColor: _getNiveauColor(niveau),
                      radius: 10,
                      child: Text(
                        _exercices
                            .where((e) => e.exerciceNiveau == niveau)
                            .length
                            .toString(),
                        style:
                            const TextStyle(fontSize: 10, color: Colors.white),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),

        // Exercise list
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadExercices,
            child: ListView.builder(
              padding: const EdgeInsets.all(8),
              itemCount: _filteredExercices.length,
              itemBuilder: (context, index) {
                final exercice = _filteredExercices[index];
                return _buildClassicCard(exercice);
              },
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildStat(String label, String value, Color color) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey[600],
          ),
        ),
      ],
    );
  }

  List<NiveauLIFRAS> _getAvailableNiveaux() {
    final niveaux = _exercices.map((e) => e.exerciceNiveau).toSet().toList();
    niveaux.sort((a, b) => a.index.compareTo(b.index));
    return niveaux;
  }

  Widget _buildClassicCard(ExerciceValide exercice) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ListTile(
        leading: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: _getNiveauColor(exercice.exerciceNiveau),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Center(
            child: Text(
              exercice.exerciceNiveau.code,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 14,
              ),
            ),
          ),
        ),
        title: Text(
          exercice.exerciceCode,
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(exercice.exerciceDescription),
            const SizedBox(height: 4),
            Row(
              children: [
                Icon(Icons.calendar_today, size: 12, color: Colors.grey[600]),
                const SizedBox(width: 4),
                Text(
                  DateFormatter.formatMedium(exercice.dateValidation),
                  style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                ),
                const SizedBox(width: 12),
                Icon(Icons.person, size: 12, color: Colors.grey[600]),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    exercice.moniteurNom,
                    style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            if (exercice.isFromCarnetFormation) ...[
              const SizedBox(height: 4),
              Row(
                children: [
                  Icon(Icons.verified_user_outlined,
                      size: 12, color: Colors.green[700]),
                  const SizedBox(width: 4),
                  Text(
                    'Confirmé via QR / carnet',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.green[700],
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ],
            if (exercice.lieu != null && exercice.lieu!.isNotEmpty) ...[
              const SizedBox(height: 2),
              Row(
                children: [
                  Icon(Icons.location_on, size: 12, color: Colors.grey[600]),
                  const SizedBox(width: 4),
                  Text(
                    exercice.lieu!,
                    style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                  ),
                ],
              ),
            ],
          ],
        ),
        trailing: widget.isMonitor
            ? PopupMenuButton<String>(
                onSelected: (value) {
                  if (value == 'delete') {
                    _deleteExercice(exercice);
                  }
                },
                itemBuilder: (_) => [
                  const PopupMenuItem(
                    value: 'delete',
                    child: Row(
                      children: [
                        Icon(Icons.delete, color: Colors.red),
                        SizedBox(width: 8),
                        Text('Supprimer'),
                      ],
                    ),
                  ),
                ],
              )
            : null,
        onTap: () => _showClassicDetails(exercice),
      ),
    );
  }

  void _showClassicDetails(ExerciceValide exercice) {
    showModalBottomSheet(
      context: context,
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: _getNiveauColor(exercice.exerciceNiveau),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    exercice.exerciceNiveau.code,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    exercice.exerciceCode,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              exercice.exerciceDescription,
              style: const TextStyle(fontSize: 16),
            ),
            const Divider(height: 32),
            _buildDetailRow(Icons.calendar_today, 'Date de validation',
                DateFormatter.formatLong(exercice.dateValidation)),
            _buildDetailRow(Icons.person, 'Moniteur', exercice.moniteurNom),
            if (exercice.isFromCarnetFormation)
              _buildDetailRow(
                Icons.verified_user_outlined,
                'Origine',
                'Confirmé par un moniteur via le carnet de formation',
              ),
            if (exercice.lieu != null && exercice.lieu!.isNotEmpty)
              _buildDetailRow(Icons.location_on, 'Lieu', exercice.lieu!),
            if (exercice.notes != null && exercice.notes!.isNotEmpty)
              _buildDetailRow(Icons.notes, 'Notes', exercice.notes!),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: Colors.teal),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[600],
                  ),
                ),
                Text(
                  value,
                  style: const TextStyle(fontSize: 16),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Color _getNiveauColor(NiveauLIFRAS niveau) {
    switch (niveau) {
      case NiveauLIFRAS.tn:
        return Colors.teal;
      case NiveauLIFRAS.nb:
        return Colors.grey;
      case NiveauLIFRAS.p2:
        return Colors.blue;
      case NiveauLIFRAS.p3:
        return Colors.green;
      case NiveauLIFRAS.p4:
        return Colors.orange;
      case NiveauLIFRAS.am:
        return Colors.purple;
      case NiveauLIFRAS.mc:
        return Colors.red;
      case NiveauLIFRAS.mf:
        return Colors.red.shade800;
      case NiveauLIFRAS.mn:
        return Colors.brown.shade800;
    }
  }
}

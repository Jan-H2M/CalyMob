import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/exercice_valide.dart';
import '../../models/exercice_lifras.dart';
import '../../providers/exercice_valide_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/exercice_valide_service.dart';
import '../../services/lifras_service.dart';
import '../../utils/date_formatter.dart';
import '../../utils/plongeur_utils.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../training/historical_claims_screen.dart';
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

class _MemberExercisesScreenState extends State<MemberExercisesScreen> {
  final ExerciceValideService _service = ExerciceValideService();
  final LifrasService _lifrasService = LifrasService();
  final String _clubId = FirebaseConfig.defaultClubId;

  // Catalog for self-declaration view
  List<ExerciceLIFRAS> _catalog = [];
  NiveauLIFRAS? _targetNiveau;
  bool _isLoadingCatalog = false;

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
      });
    } else {
      _loadExercices();
    }
  }

  Future<void> _loadCatalog() async {
    final memberProvider = context.read<MemberProvider>();

    // Determine target niveau: formation_active → next brevet, else current
    final target = PlongeurUtils.getTargetNiveau(
      plongeurCode: memberProvider.plongeurCode,
      formationActive: memberProvider.formationActive,
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
      });
    }
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
        if (_isLoadingCatalog || provider.isLoading) {
          return const Center(child: CircularProgressIndicator());
        }

        if (_targetNiveau == null) {
          return _buildNoNiveauState();
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
          final match =
              provider.exercicesValides.where((e) => e.exerciceId == ex.id);
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

        // Progress counts only target-level — TN are cross-level and don't
        // gate the next brevet, so we keep them out of the headline metric.
        final targetTotal = targetTodo.length + targetValidated.length;
        final progressFraction =
            targetTotal == 0 ? 0.0 : targetValidated.length / targetTotal;

        return RefreshIndicator(
          onRefresh: () async {
            await _loadCatalog();
          },
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Progress header
              _buildProgressHeader(
                niveau: _targetNiveau!,
                validated: targetValidated.length,
                total: targetTotal,
                progress: progressFraction,
              ),
              const SizedBox(height: 12),
              _buildHistoricalRepriseCard(),
              const SizedBox(height: 20),

              // Section 1: À faire (target-level, priority)
              _buildSection(
                title: 'À faire',
                icon: Icons.radio_button_unchecked,
                iconColor: Colors.blueGrey,
                emptyText: 'Tous les exercices de ${_targetNiveau!.code} '
                    'sont validés 🎉',
                children: targetTodo
                    .map((ex) => _buildTodoRow(
                          ex,
                          isPending: pendingIds.contains(ex.id),
                        ))
                    .toList(),
              ),
              const SizedBox(height: 20),

              // Section 2: Validés (target-level)
              _buildSection(
                title: 'Validés',
                icon: Icons.check_circle,
                iconColor: Colors.green,
                emptyText: 'Aucun exercice validé pour le moment',
                children: targetValidated.map((ex) {
                  final match = provider.exercicesValides.firstWhere(
                    (e) => e.exerciceId == ex.id && e.isValidated,
                    orElse: () => provider.exercicesValides
                        .firstWhere((e) => e.exerciceId == ex.id),
                  );
                  return _buildValidatedRow(ex, match);
                }).toList(),
              ),
              const SizedBox(height: 20),

              // Section 3: Spécialités — cross-level, lower priority.
              if (tnAll.isNotEmpty)
                _buildSection(
                  title: 'Spécialités (Tous niveaux)',
                  icon: Icons.workspace_premium_outlined,
                  iconColor: Colors.teal,
                  emptyText: null,
                  children: tnAll.map((ex) {
                    final match = provider.exercicesValides
                        .where((e) => e.exerciceId == ex.id);
                    final isValid = match.any((e) => e.isValidated);
                    if (isValid) {
                      final v = match.firstWhere((e) => e.isValidated);
                      return _buildValidatedRow(ex, v);
                    }
                    return _buildTodoRow(ex,
                        isPending: pendingIds.contains(ex.id));
                  }).toList(),
                ),
              const SizedBox(height: 40),
            ],
          ),
        );
      },
    );
  }

  Widget _buildProgressHeader({
    required NiveauLIFRAS niveau,
    required int validated,
    required int total,
    required double progress,
  }) {
    final niveauColor = _getNiveauColor(niveau);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: niveauColor,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Center(
                  child: Text(
                    niveau.code,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Objectif: ${niveau.label}',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    Text(
                      '$validated / $total exercices validés',
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.grey[700],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: progress.clamp(0.0, 1.0),
              backgroundColor: Colors.grey[200],
              color: niveauColor,
              minHeight: 8,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHistoricalRepriseCard() {
    return Material(
      color: Colors.white.withValues(alpha: 0.96),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const HistoricalClaimsScreen()),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: AppColors.middenblauw.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.history_edu_outlined,
                  color: AppColors.middenblauw,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'J’ai déjà des exercices sur papier',
                      style: TextStyle(
                        color: AppColors.donkerblauw,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      'Prépare la liste; un moniteur validera après contrôle de ta carte.',
                      style: TextStyle(
                        color: AppColors.donkerblauw.withValues(alpha: 0.65),
                        fontSize: 12.5,
                        height: 1.25,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: Colors.grey.shade500),
            ],
          ),
        ),
      ),
    );
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Section header — white text on the blue ocean gradient.
        Row(
          children: [
            Icon(icon, size: 18, color: Colors.white),
            const SizedBox(width: 6),
            Text(
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
            ),
            const SizedBox(width: 6),
            if (children.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
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
              color: Colors.white.withValues(alpha: 0.95),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              emptyText,
              style: TextStyle(
                fontSize: 13,
                color: Colors.grey[700],
              ),
            ),
          )
        else
          // Wrap all rows in one white card so dark text reads cleanly
          // on the blue ocean gradient backdrop.
          Container(
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.96),
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
                    Divider(
                      height: 1,
                      thickness: 1,
                      color: Colors.grey.shade200,
                    ),
                  children[i],
                ],
              ],
            ),
          ),
      ],
    );
  }

  /// Compact one-line row used for both 'À faire' and 'Validés'.
  /// Tap on a validated row → bottom sheet with full details.
  Widget _buildExerciceRow({
    required ExerciceLIFRAS exercice,
    required bool isValidated,
    String? trailingText,
    String? hintTag,
    VoidCallback? onTap,
  }) {
    final niveauColor = _getNiveauColor(exercice.niveau);
    final muted = !isValidated;

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
                color:
                    isValidated ? Colors.green : niveauColor.withOpacity(0.18),
                borderRadius: BorderRadius.circular(6),
                border: isValidated
                    ? null
                    : Border.all(color: niveauColor.withOpacity(0.4)),
              ),
              child: Center(
                child: isValidated
                    ? const Icon(Icons.check, size: 16, color: Colors.white)
                    : Text(
                        exercice.niveau.code,
                        style: TextStyle(
                          color: niveauColor,
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
                  Row(
                    children: [
                      Text(
                        exercice.code,
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                          color: muted ? Colors.grey[800] : Colors.grey[900],
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
                    ],
                  ),
                  Text(
                    exercice.description,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
                ],
              ),
            ),
            if (trailingText != null) ...[
              const SizedBox(width: 8),
              Text(
                trailingText,
                style: TextStyle(fontSize: 11, color: Colors.grey[500]),
              ),
            ],
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
    );
  }

  Widget _buildValidatedRow(
      ExerciceLIFRAS exercice, ExerciceValide validation) {
    return _buildExerciceRow(
      exercice: exercice,
      isValidated: true,
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
                    selectedColor: _getNiveauColor(niveau).withOpacity(0.3),
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

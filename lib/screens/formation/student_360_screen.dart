import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../models/formation_snapshot_doc.dart';
import '../../models/member_profile.dart';
import '../../models/mil_experience_overview.dart';
import '../../models/pool_formation_snapshot_doc.dart';
import '../../models/pool_student_history.dart';
import '../../providers/auth_provider.dart';
import '../../services/formation_snapshot_reader.dart';
import '../../services/member_observation_service.dart';
import '../../services/mil_experience_service.dart';
import '../../services/pool_student_history_reader.dart';
import '../../utils/member_name.dart';
import '../../utils/permission_helper.dart';
import '../../widgets/formation/mil_requirements_card.dart';
import '../../widgets/ocean_background.dart';

@visibleForTesting
bool formationObservationVisible(
  FormationTrackingScope scope,
  Map<String, dynamic> observation,
) {
  return scope == FormationTrackingScope.full ||
      observation['contextType']?.toString() == 'piscine';
}

/// WP-10 — Fiche élève 360°.
///
/// Lecteur PUR du snapshot matérialisé (WP-09) + observations. En-tête
/// (photo, trajet, épreuves, examens et expérience requise) + onglets :
/// Milieu naturel · Piscine · Expériences brevet · Objectifs · Observations.
class Student360Screen extends StatefulWidget {
  final String clubId;
  final MemberProfile member;
  final FormationTrackingScope scope;
  final PoolFormationSnapshotDoc? poolSnapshot;
  final bool previewMode;
  final FormationSnapshotDoc? previewSnapshot;
  final MilExperienceOverview? previewMilOverview;
  final PoolFormationSnapshotDoc? previewPoolSnapshot;
  final List<Map<String, dynamic>> previewObservations;
  final List<PoolStudentSession> previewPoolHistory;

  const Student360Screen({
    super.key,
    required this.clubId,
    required this.member,
    required this.scope,
    this.poolSnapshot,
    this.previewMode = false,
    this.previewSnapshot,
    this.previewMilOverview,
    this.previewPoolSnapshot,
    this.previewObservations = const [],
    this.previewPoolHistory = const [],
  });

  @override
  State<Student360Screen> createState() => _Student360ScreenState();
}

class _Student360ScreenState extends State<Student360Screen> {
  FormationSnapshotReader? _reader;

  bool _loading = true;
  FormationSnapshotDoc? _snapshot;
  MilExperienceOverview? _milOverview;
  PoolFormationSnapshotDoc? _poolSnapshot;
  List<Map<String, dynamic>> _observations = const [];
  List<PoolStudentSession> _poolHistory = const [];
  bool _historyLoading = false;
  bool _historyFailed = false;
  bool _observationsFailed = false;

  @override
  void initState() {
    super.initState();
    if (widget.previewMode) {
      _poolHistory = widget.previewPoolHistory;
    } else {
      _loadPoolHistory();
    }
    if (widget.previewMode) {
      if (widget.scope == FormationTrackingScope.piscineOnly) {
        _poolSnapshot = widget.previewPoolSnapshot;
      } else {
        _snapshot = widget.previewSnapshot;
        _milOverview = widget.previewMilOverview ??
            (widget.previewSnapshot == null
                ? null
                : MilExperienceOverview.fromSnapshot(widget.previewSnapshot!));
      }
      _observations = widget.previewObservations
          .where(
            (observation) =>
                formationObservationVisible(widget.scope, observation),
          )
          .toList(growable: false);
      _loading = false;
    } else if (widget.scope == FormationTrackingScope.piscineOnly) {
      _poolSnapshot = widget.poolSnapshot;
      _loadPoolObservations();
    } else {
      _reader = FormationSnapshotReader();
      _loadFull();
    }
  }

  Future<void> _loadPoolHistory() async {
    setState(() {
      _historyLoading = true;
      _historyFailed = false;
    });
    try {
      final history = await PoolStudentHistoryReader().load(
        widget.clubId,
        widget.member.id,
        automaticLevel: poolAutomaticFormationLevel(
            widget.member.plongeurCode, widget.member.formationActive),
      );
      if (!mounted) return;
      setState(() {
        _poolHistory = history;
        _historyLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _historyLoading = false;
        _historyFailed = true;
      });
    }
  }

  Future<void> _loadFull() async {
    final snapshot = await _reader!.getSnapshot(
      widget.clubId,
      widget.member.id,
    );
    MilExperienceOverview? milOverview;
    try {
      milOverview = await MilExperienceService().load(
        clubId: widget.clubId,
        memberId: widget.member.id,
        preferredBrevet: resolvePreferredMilBrevet(
          targetFormationLevel: widget.member.targetFormationLevel,
          currentCode: widget.member.plongeurCode,
          snapshotTargetLevel: snapshot?.targetLevel,
        ),
      );
    } catch (error, stackTrace) {
      debugPrint('[student_360] lecture MIL impossible: $error\n$stackTrace');
    }
    final observations = await _loadObservations();
    if (!mounted) return;
    setState(() {
      _snapshot = snapshot;
      _milOverview = milOverview ??
          (snapshot == null
              ? null
              : MilExperienceOverview.fromSnapshot(snapshot));
      _observations = observations;
      _loading = false;
    });
  }

  Future<void> _loadPoolObservations() async {
    final observations = await _loadObservations();
    if (!mounted) return;
    setState(() {
      _observations = observations;
      _loading = false;
    });
  }

  Future<List<Map<String, dynamic>>> _loadObservations() async {
    _observationsFailed = false;
    try {
      Query<Map<String, dynamic>> query = FirebaseFirestore.instance
          .collection('clubs')
          .doc(widget.clubId)
          .collection('member_observations')
          .where('memberId', isEqualTo: widget.member.id);
      if (widget.scope == FormationTrackingScope.piscineOnly) {
        query = query.where('contextType', isEqualTo: 'piscine');
      }
      final snap = await query.get();
      final list = snap.docs
          .map((d) => {'id': d.id, ...d.data()})
          .where(
            (observation) =>
                formationObservationVisible(widget.scope, observation),
          )
          .toList();
      final observerIds = list
          .map((o) => o['observerId']?.toString() ?? '')
          .where((id) => id.isNotEmpty)
          .toSet();
      final members = FirebaseFirestore.instance
          .collection('clubs')
          .doc(widget.clubId)
          .collection('member_directory');
      final names = <String, String>{};
      await Future.wait(
        observerIds.map((observerId) async {
          final member = await members.doc(observerId).get();
          final data = member.data();
          if (data != null) {
            names[observerId] = memberDisplayName(data, fallback: 'Encadrant');
          }
        }),
      );
      for (final observation in list) {
        observation['canonicalObserverName'] =
            names[observation['observerId']?.toString() ?? ''] ?? '';
      }
      list.sort((a, b) {
        final da = _obsDate(a)?.millisecondsSinceEpoch ?? 0;
        final db = _obsDate(b)?.millisecondsSinceEpoch ?? 0;
        return db.compareTo(da);
      });
      return list;
    } catch (_) {
      _observationsFailed = true;
      return const [];
    }
  }

  DateTime? _obsDate(Map<String, dynamic> o) {
    final v = o['contextDate'] ?? o['createdAt'];
    if (v is Timestamp) return v.toDate();
    if (v is String) return DateTime.tryParse(v);
    return null;
  }

  String get _fullName => '${widget.member.prenom} ${widget.member.nom}'.trim();

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: widget.scope == FormationTrackingScope.piscineOnly ? 2 : 5,
      child: Scaffold(
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          iconTheme: const IconThemeData(color: Colors.white),
          title: Text(
            _fullName.isEmpty ? 'Fiche élève' : _fullName,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
        body: OceanBackground(
          child: SafeArea(
            top: false,
            child: _loading
                ? const Center(
                    child: CircularProgressIndicator(color: Colors.white),
                  )
                : widget.scope == FormationTrackingScope.piscineOnly
                    ? _poolSnapshot == null
                        ? _buildHistoryWithoutSnapshot()
                        : _buildPiscineContent(_poolSnapshot!)
                    : _snapshot == null
                        ? _buildHistoryWithoutSnapshot()
                        : _buildContent(_snapshot!),
          ),
        ),
      ),
    );
  }

  Widget _buildHistoryWithoutSnapshot() => Padding(
        padding: const EdgeInsets.only(top: kToolbarHeight),
        child: _buildPoolHistoryTab(),
      );

  Widget _buildContent(FormationSnapshotDoc s) {
    return Column(
      children: [
        _buildHeader(s),
        if (s.attentionPoints.isNotEmpty) _buildAttentionBanner(s),
        Container(
          color: AppColors.donkerblauw.withValues(alpha: 0.82),
          child: const TabBar(
            isScrollable: true,
            labelColor: Colors.white,
            unselectedLabelColor: Color(0xFFD3E2EF),
            indicatorColor: AppColors.lichtblauw,
            indicatorWeight: 3,
            labelStyle: TextStyle(fontWeight: FontWeight.w600),
            unselectedLabelStyle: TextStyle(fontWeight: FontWeight.w500),
            tabs: [
              Tab(text: 'Milieu naturel'),
              Tab(text: 'Piscine'),
              Tab(text: 'Expériences brevet'),
              Tab(text: 'Objectifs'),
              Tab(text: 'Observations'),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            children: [
              _buildExercisesTab(s),
              _buildPoolHistoryTab(snapshot: s),
              _buildMilTab(s),
              _buildGoalsTab(s),
              _buildObservationsTab(s),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildPiscineContent(PoolFormationSnapshotDoc s) {
    return Column(
      children: [
        _buildPiscineHeader(s),
        Container(
          color: AppColors.donkerblauw.withValues(alpha: 0.82),
          child: const TabBar(
            labelColor: Colors.white,
            unselectedLabelColor: Color(0xFFD3E2EF),
            indicatorColor: AppColors.lichtblauw,
            indicatorWeight: 3,
            labelStyle: TextStyle(fontWeight: FontWeight.w600),
            unselectedLabelStyle: TextStyle(fontWeight: FontWeight.w500),
            tabs: [
              Tab(text: 'Piscine'),
              Tab(text: 'Observations piscine'),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            children: [
              _buildPoolHistoryTab(poolSnapshot: s),
              _buildObservationsTab(null),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildPiscineHeader(PoolFormationSnapshotDoc s) {
    final topInset = MediaQuery.of(context).padding.top + kToolbarHeight;
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            AppColors.donkerblauw.withValues(alpha: 0.94),
            AppColors.donkerblauw.withValues(alpha: 0.82),
          ],
        ),
      ),
      padding: EdgeInsets.fromLTRB(16, topInset, 16, 12),
      child: Row(
        children: [
          _avatar(widget.member, 64),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Suivi piscine',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                _fractionProgressBar(
                  'Exercices piscine',
                  s.validated,
                  s.total,
                  AppColors.lichtblauw,
                ),
                if (s.pending > 0) ...[
                  const SizedBox(height: 7),
                  Text(
                    '${s.pending} en attente',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.78),
                      fontSize: 12,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(FormationSnapshotDoc s) {
    final m = widget.member;
    final natural = s.modalityProgress[FormationModality.career]!;
    final exams = s.examProgress;
    final liveTargetCode = _milOverview?.initialBrevet;
    final liveMil =
        liveTargetCode == null ? null : _milOverview?.byBrevet[liveTargetCode];
    // Le panneau foncé remonte derrière l'AppBar transparente + la status bar
    // (SafeArea top:false) → titre « Alison » et stats toujours sur fond foncé.
    final topInset = MediaQuery.of(context).padding.top + kToolbarHeight;
    final trajet = s.targetLevel != null && s.targetLevel!.isNotEmpty
        ? '${s.currentCode.isEmpty ? '—' : s.currentCode} → ${s.targetLevel}'
        : (s.currentCode.isEmpty ? '' : s.currentCode);
    return Container(
      decoration: BoxDecoration(
        // Scrim dégradé : garantit la lisibilité du texte blanc au-dessus des
        // zones claires du fond océan (halo de surface).
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            AppColors.donkerblauw.withValues(alpha: 0.94),
            AppColors.donkerblauw.withValues(alpha: 0.82),
          ],
        ),
      ),
      padding: EdgeInsets.fromLTRB(16, topInset, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              _avatar(m, 48),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  trajet.isEmpty ? 'Suivi du brevet' : trajet,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          LayoutBuilder(builder: (context, constraints) {
            return FittedBox(
              key: const Key('brevet-status-strip'),
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: ConstrainedBox(
                constraints: BoxConstraints(minWidth: constraints.maxWidth),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    _compactBrevetStatus(
                      'Épreuves',
                      'Épreuves en milieu naturel : '
                          '${natural.total == 0 ? 'non renseignées' : '${natural.validated} sur ${natural.total} réalisées'}'
                          '${natural.pending > 0 ? ' · ${natural.pending} en attente de validation' : ''}',
                      count: natural.total == 0
                          ? '—'
                          : '${natural.validated}/${natural.total}',
                      complete: natural.total > 0 &&
                          natural.validated == natural.total,
                    ),
                    _compactExamStatus('Théorie', 'Examen théorique',
                        exams[FormationModality.theory]!),
                    _compactExamStatus('Piscine', 'Examen piscine',
                        exams[FormationModality.pool]!),
                    _compactBrevetStatus(
                      'Exp.',
                      'Expérience requise pour le brevet : '
                          '${liveMil == null || liveMil.requirements.isEmpty ? 'non renseignée' : liveMil.requiredCount == 0 ? 'aucune exigence' : liveMil.isSufficient ? 'suffisante' : liveMil.hasMissingData ? 'à vérifier · données manquantes' : 'à compléter'}'
                          '${liveMil != null && liveMil.requiredCount > 0 ? ' · ${liveMil.attainedCount} sur ${liveMil.requiredCount} exigences atteintes' : ''}',
                      complete: liveMil?.isSufficient == true,
                      unknown: liveMil == null ||
                          liveMil.requirements.isEmpty ||
                          liveMil.requiredCount == 0 ||
                          liveMil.hasMissingData,
                    ),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _compactExamStatus(
      String label, String fullLabel, FormationModalityProgress progress) {
    final done = progress.total > 0 && progress.validated == progress.total;
    return _compactBrevetStatus(
      label,
      '$fullLabel : ${progress.total == 0 ? 'non renseigné' : done ? 'réalisé' : progress.remaining == 0 && progress.pending > 0 ? 'en attente de validation' : 'à faire'}'
      '${!done && progress.pending > 0 && progress.remaining > 0 ? ' · ${progress.pending} en attente de validation' : ''}',
      complete: done,
      unknown: progress.total == 0,
      pending: !done && progress.remaining == 0 && progress.pending > 0,
    );
  }

  Widget _compactBrevetStatus(String label, String explanation,
      {String? count,
      bool complete = false,
      bool unknown = false,
      bool pending = false}) {
    final color = unknown
        ? Colors.white70
        : pending
            ? Colors.amberAccent
            : complete
                ? Colors.greenAccent
                : Colors.redAccent;
    return Tooltip(
      message: explanation,
      triggerMode: TooltipTriggerMode.tap,
      excludeFromSemantics: true,
      child: Semantics(
        label: explanation,
        child: ExcludeSemantics(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 3),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label,
                    style:
                        const TextStyle(color: Colors.white70, fontSize: 12)),
                const SizedBox(width: 4),
                if (count != null)
                  Text(count,
                      style: TextStyle(
                          color: complete ? Colors.greenAccent : Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 12))
                else
                  Icon(
                      unknown
                          ? Icons.help_outline
                          : pending
                              ? Icons.hourglass_top
                              : complete
                                  ? Icons.check
                                  : Icons.close,
                      color: color,
                      size: 17),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _avatar(MemberProfile m, double size) {
    final hasPhoto = m.hasPhoto && m.consentInternalPhoto && m.photoUrl != null;
    if (hasPhoto) {
      return ClipOval(
        child: CachedNetworkImage(
          imageUrl: m.photoUrl!,
          width: size,
          height: size,
          fit: BoxFit.cover,
          errorWidget: (_, __, ___) => _initialsAvatar(m, size),
        ),
      );
    }
    return _initialsAvatar(m, size);
  }

  Widget _initialsAvatar(MemberProfile m, double size) {
    final initials =
        '${m.prenom.isNotEmpty ? m.prenom[0] : ''}${m.nom.isNotEmpty ? m.nom[0] : ''}'
            .toUpperCase();
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white.withValues(alpha: 0.2),
      ),
      alignment: Alignment.center,
      child: Text(
        initials,
        style: TextStyle(
          color: Colors.white,
          fontSize: size * 0.35,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  Widget _fractionProgressBar(
    String label,
    int validated,
    int total,
    Color color,
  ) {
    final value = total == 0 ? 0.0 : validated / total;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              label,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.85),
                fontSize: 12,
              ),
            ),
            Text(
              total == 0 ? '—' : '$validated/$total',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
        const SizedBox(height: 3),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(
            value: value,
            minHeight: 7,
            backgroundColor: Colors.white.withValues(alpha: 0.18),
            valueColor: AlwaysStoppedAnimation<Color>(color),
          ),
        ),
      ],
    );
  }

  Widget _buildPoolRemarkButton() {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
        child: SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white,
              backgroundColor: AppColors.donkerblauw.withValues(alpha: 0.85),
              side: BorderSide(color: Colors.white.withValues(alpha: 0.72)),
              padding: const EdgeInsets.symmetric(vertical: 13),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            onPressed: () => _addPoolRemark(),
            icon: const Icon(Icons.add_comment_outlined),
            label: const Text('Ajouter une remarque piscine'),
          ),
        ),
      ),
    );
  }

  Future<void> _addPoolRemark([PoolStudentSession? session]) =>
      _addRemark(session: session);

  Future<void> _addRemark(
      {PoolStudentSession? session, bool pool = true}) async {
    // Pool-only instructors may never create non-pool observations.
    if (!pool && widget.scope != FormationTrackingScope.full) return;
    var draft = '';
    final note = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(
          session == null
              ? pool
                  ? 'Remarque piscine'
                  : 'Ajouter une observation'
              : 'Remarque · ${_sessionDate(session.date)}',
        ),
        content: TextField(
          onChanged: (value) => draft = value,
          autofocus: true,
          minLines: 3,
          maxLines: 5,
          maxLength: 2000,
          decoration: const InputDecoration(
            hintText: 'Ajoutez une remarque sur la progression de l’élève…',
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
              final value = draft.trim();
              if (value.isNotEmpty) Navigator.of(dialogContext).pop(value);
            },
            child: const Text('Enregistrer'),
          ),
        ],
      ),
    );
    if (note == null || note.isEmpty || !mounted) return;

    final auth = context.read<AuthProvider>();
    final observerId = auth.currentUser?.uid ?? '';
    if (observerId.isEmpty) return;
    try {
      if (session != null) {
        if (session.date == null) return;
        await MemberObservationService().addPoolSessionRemark(
          clubId: widget.clubId,
          memberId: widget.member.id,
          memberName: _fullName,
          observerId: observerId,
          sessionId: session.id,
          sessionDate: session.date!,
          note: note,
        );
      } else if (pool) {
        await MemberObservationService().addPoolFormationRemark(
          clubId: widget.clubId,
          memberId: widget.member.id,
          memberName: _fullName,
          memberNiveau: widget.scope == FormationTrackingScope.full
              ? _snapshot?.targetLevel ?? ''
              : '',
          note: note,
          observerId: observerId,
        );
      } else {
        await MemberObservationService().addFormationRemark(
          clubId: widget.clubId,
          memberId: widget.member.id,
          memberName: _fullName,
          memberNiveau: _snapshot?.targetLevel ?? '',
          observerId: observerId,
          note: note,
        );
      }
      final observations = await _loadObservations();
      if (!mounted) return;
      setState(() => _observations = observations);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(pool
                ? 'Remarque piscine enregistrée'
                : 'Observation enregistrée')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('L’observation n’a pas pu être enregistrée.'),
          backgroundColor: Colors.redAccent,
        ),
      );
    }
  }

  // WP-12 — bandeau « Points d'attention » (vue moniteur).
  Widget _buildAttentionBanner(FormationSnapshotDoc s) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.redAccent.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.redAccent.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.warning_amber_rounded,
                color: Colors.redAccent,
                size: 18,
              ),
              const SizedBox(width: 6),
              Text(
                'Points d\'attention (${s.attentionPoints.length})',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ...s.attentionPoints.map((code) {
            final pc = s.perCode[code];
            final attempts = pc?.attempts ?? 0;
            final detail = attempts > 0 ? ' · ×$attempts pratiqué' : '';
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Text(
                '• ${_describeCode(s, code)}$detail',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.92),
                  fontSize: 13,
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  String _describeCode(FormationSnapshotDoc s, String code) {
    for (final ex in [...s.remaining, ...s.pending, ...s.validated]) {
      if (ex.code == code && ex.description.isNotEmpty) {
        return '$code — ${ex.description}';
      }
    }
    return code;
  }

  /// Description seule d'un code d'exercice (pour l'onglet Observations, où
  /// seul le code est stocké — « ET.PL1 » ne parle à personne).
  String _lookupDesc(FormationSnapshotDoc s, String code) {
    if (code.isEmpty) return '';
    for (final ex in [...s.validated, ...s.pending, ...s.remaining]) {
      if (ex.code == code && ex.description.isNotEmpty) return ex.description;
    }
    return '';
  }

  // ---- Onglet Exercices ----------------------------------------------------
  String _sessionDate(DateTime? date) => date == null
      ? 'Date non renseignée'
      : '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';

  Widget _buildPoolHistoryTab({
    FormationSnapshotDoc? snapshot,
    PoolFormationSnapshotDoc? poolSnapshot,
  }) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      children: [
        _buildPoolRemarkButton(),
        _section(
          'Séances piscine · ${_poolHistory.length} présences enregistrées',
          [
            const Text(
              'Une présence ou un groupe attribué ne valide pas automatiquement un exercice.',
              style: TextStyle(color: Colors.white70),
            ),
            if (_historyLoading) const LinearProgressIndicator(),
            if (_historyFailed) ...[
              const Text(
                'Historique indisponible. Les présences ne sont pas considérées comme nulles.',
                style: TextStyle(color: Colors.amberAccent),
              ),
              TextButton(
                onPressed: _loadPoolHistory,
                child: const Text('Réessayer'),
              ),
            ],
            if (!_historyLoading && !_historyFailed && _poolHistory.isEmpty)
              const Text(
                'Aucune présence piscine enregistrée.',
                style: TextStyle(color: Colors.white70),
              ),
          ],
        ),
        ..._poolHistory.map(_poolSessionCard),
        if (snapshot != null) ..._exerciseSections(snapshot, pool: true),
        if (poolSnapshot != null)
          _section('Progression piscine', [
            _poolCountRow(
              'Validés',
              poolSnapshot.validated,
              Icons.check_circle_outline,
              Colors.greenAccent,
            ),
            _poolCountRow(
              'En attente',
              poolSnapshot.pending,
              Icons.hourglass_top_rounded,
              Colors.amberAccent,
            ),
            _poolCountRow(
              'Restants',
              poolSnapshot.remaining,
              Icons.radio_button_unchecked,
              Colors.white70,
            ),
          ]),
      ],
    );
  }

  Widget _poolSessionCard(PoolStudentSession session) {
    final notes = _observations.where(
      (note) =>
          note['contextType'] == 'piscine' && note['contextId'] == session.id,
    );
    return _section('${_sessionDate(session.date)} · ${session.location}', [
      Text(
        session.trainingReported
            ? 'Participation à la formation rapportée'
            : 'Présence enregistrée · participation non confirmée',
        style: const TextStyle(color: Colors.white70),
      ),
      if (session.lessons.isEmpty)
        const Text(
          'Groupe et contenu de la séance non renseignés.',
          style: TextStyle(color: Colors.white70),
        ),
      ...session.lessons.map(
        (lesson) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                [
                  lesson.level.endsWith('*')
                      ? 'Formation ${lesson.level.replaceAll('*', '★')}'
                      : lesson.level == 'MC'
                          ? 'Formation Moniteur Club'
                          : lesson.level == 'AM'
                              ? 'Formation Assistant Moniteur'
                              : lesson.level,
                  if (lesson.group.isNotEmpty) 'Groupe ${lesson.group}',
                  if (lesson.hour.isNotEmpty)
                    lesson.hour == '1ere_heure'
                        ? '1re heure'
                        : lesson.hour == '2eme_heure'
                            ? '2e heure'
                            : lesson.hour,
                ].where((v) => v.isNotEmpty).join(' · '),
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                lesson.theme.isEmpty ? 'Contenu non renseigné' : lesson.theme,
                style: const TextStyle(color: Colors.white),
              ),
              Text(
                'Encadrants : ${lesson.monitorNames.isEmpty ? 'non renseignés' : lesson.monitorNames.join(', ')}',
                style: const TextStyle(color: Colors.white70),
              ),
              if (lesson.sourceLabel.isNotEmpty)
                Text(lesson.sourceLabel,
                    style:
                        const TextStyle(color: Colors.white70, fontSize: 11)),
            ],
          ),
        ),
      ),
      if (session.instructorRemark.isNotEmpty)
        Text(
          'Remarque enregistrée : ${session.instructorRemark}',
          style: const TextStyle(color: Colors.white),
        ),
      if (session.personalNotes.isNotEmpty)
        Text(
          'Note de l’élève : ${session.personalNotes}',
          style: const TextStyle(color: Colors.white70),
        ),
      ...notes.map(
        (note) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${note['note'] ?? ''}',
                style: const TextStyle(color: Colors.white),
              ),
              Text(
                '${note['canonicalObserverName'] ?? 'Encadrant'} · écrit le ${_sessionDate(poolDate(note['createdAt']))}',
                style: const TextStyle(color: Colors.white70, fontSize: 12),
              ),
            ],
          ),
        ),
      ),
      OutlinedButton.icon(
        onPressed: session.date == null || !session.hasLessonDate
            ? null
            : () => _addPoolRemark(session),
        style: OutlinedButton.styleFrom(foregroundColor: Colors.white),
        icon: const Icon(Icons.add_comment_outlined),
        label: const Text('Ajouter une remarque à cette séance'),
      ),
    ]);
  }

  Widget _poolCountRow(String label, int count, IconData icon, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(label, style: const TextStyle(color: Colors.white)),
          ),
          Text(
            '$count',
            style: TextStyle(
              color: color,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildExercisesTab(FormationSnapshotDoc s) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      children: [
        ..._exerciseSections(s, pool: false),
      ],
    );
  }

  List<Widget> _exerciseSections(FormationSnapshotDoc s, {required bool pool}) {
    bool belongs(String code, String description) =>
        (formationModalityForExercise(code, description) ==
            FormationModality.pool) ==
        pool;
    final validated =
        s.validated.where((e) => belongs(e.code, e.description)).toList();
    final pending =
        s.pending.where((e) => belongs(e.code, e.description)).toList();
    final claims =
        s.pendingClaims.where((e) => belongs(e.code, e.label)).toList();
    final remaining =
        s.remaining.where((e) => belongs(e.code, e.description)).toList();
    return [
      if (!pool)
        const Text(
          'Exercices en milieu naturel et théorie',
          style: TextStyle(color: Colors.white70),
        ),
      _section(
        '✓ Validés (${validated.length})',
        validated
            .map((e) => _exRow(e.code, e.description, Colors.greenAccent))
            .toList(),
        emptyText: 'Aucun exercice validé.',
      ),
      _section(
        '⏳ En attente (${pending.length + claims.length})',
        [
          ...pending.map(
            (e) => _exRow(e.code, e.description, Colors.amberAccent),
          ),
          ...claims.map(
            (c) => _exRow(
              c.code,
              c.label.isNotEmpty ? c.label : c.status,
              Colors.amberAccent,
            ),
          ),
        ],
        emptyText: 'Rien en attente.',
      ),
      _section(
        '○ Restants (${remaining.length})',
        remaining.map((e) {
          final pc = s.perCode[e.code];
          final badge = (pc != null && pc.attempts > 0)
              ? '×${pc.attempts} pratiqué'
              : null;
          return _exRow(e.code, e.description, Colors.white54, badge: badge);
        }).toList(),
        emptyText: 'Tous les exercices de l\'objectif sont couverts.',
      ),
    ];
  }

  Widget _exRow(String code, String subtitle, Color dot, {String? badge}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 5),
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: dot, shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  code,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (subtitle.isNotEmpty)
                  Text(
                    subtitle,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.75),
                      fontSize: 12,
                    ),
                  ),
              ],
            ),
          ),
          if (badge != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                badge,
                style: const TextStyle(color: Colors.white, fontSize: 11),
              ),
            ),
        ],
      ),
    );
  }

  // ---- Onglet Expérience (MIL) --------------------------------------------
  Widget _buildMilTab(FormationSnapshotDoc s) {
    final zones = s.diveStats.zones;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      children: [
        MilRequirementsCard(
          overview: _milOverview ?? MilExperienceOverview.fromSnapshot(s),
          dark: true,
          inlineExpanded: true,
        ),
        const SizedBox(height: 14),
        _section('Répartition des plongées par profondeur', [
          _kv('0–10 m', '${zones['0_10'] ?? 0}'),
          _kv('10–20 m', '${zones['10_20'] ?? 0}'),
          _kv('20–30 m', '${zones['20_30'] ?? 0}'),
          _kv('30 m et +', '${zones['30_plus'] ?? 0}'),
        ]),
      ],
    );
  }

  Widget _kv(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            k,
            style: TextStyle(color: Colors.white.withValues(alpha: 0.85)),
          ),
          Text(
            v,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  // ---- Onglet Objectifs (lecture seule, D7) -------------------------------
  Widget _buildGoalsTab(FormationSnapshotDoc s) {
    if (s.goalCodes.isEmpty && s.goalNote.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            "L'élève n'a pas encore défini d'objectifs.",
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white.withValues(alpha: 0.85)),
          ),
        ),
      );
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      children: [
        _section(
          '🎯 Objectifs de l\'élève',
          s.goalCodes
              .map(
                (c) => _exRow(
                  c,
                  s.perCode[c]?.lastResult ?? '',
                  Colors.tealAccent,
                ),
              )
              .toList(),
          emptyText: 'Aucun exercice ciblé.',
        ),
        if (s.goalNote.isNotEmpty)
          _section('Note', [
            Text(
              s.goalNote,
              style: TextStyle(color: Colors.white.withValues(alpha: 0.9)),
            ),
          ]),
      ],
    );
  }

  // ---- Onglet Observations -------------------------------------------------
  Widget _buildObservationsTab(FormationSnapshotDoc? s) {
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      itemCount: _observations.length +
          1 +
          (_observations.isEmpty || _observationsFailed ? 1 : 0),
      itemBuilder: (context, i) {
        if (i == 0) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: FilledButton.icon(
              style: FilledButton.styleFrom(
                  backgroundColor: AppColors.donkerblauw,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14)),
              onPressed: () => _addRemark(
                  pool: widget.scope == FormationTrackingScope.piscineOnly),
              icon: const Icon(Icons.add_comment_outlined),
              label: Text(widget.scope == FormationTrackingScope.piscineOnly
                  ? 'Ajouter une remarque piscine'
                  : 'Ajouter une observation'),
            ),
          );
        }
        if (i == 1 && (_observations.isEmpty || _observationsFailed)) {
          return Text(
            _observationsFailed
                ? 'Observations temporairement indisponibles.'
                : 'Aucune observation enregistrée.',
            style: const TextStyle(color: Colors.white),
          );
        }
        final o = _observations[i - 1 - (_observationsFailed ? 1 : 0)];
        final result = o['result']?.toString() ?? '';
        final code = o['exerciceCode']?.toString() ??
            o['themeTitle']?.toString() ??
            (o['contextType'] == 'piscine'
                ? 'Remarque piscine'
                : 'Observation');
        final desc = s == null
            ? ''
            : _lookupDesc(s, o['exerciceCode']?.toString() ?? '');
        final note = o['note']?.toString() ?? '';
        final observerName = o['canonicalObserverName']?.toString() ?? '';
        final date = _obsDate(o);
        final color = result == 'acquis'
            ? Colors.greenAccent
            : result == 'a_revoir'
                ? Colors.redAccent
                : Colors.amberAccent;
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.donkerblauw.withValues(alpha: 0.62),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.25),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      _resultLabel(result),
                      style: TextStyle(
                        color: color,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          code,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if (desc.isNotEmpty)
                          Text(
                            desc,
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.75),
                              fontSize: 12,
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (date != null)
                    Text(
                      _shortDate(date),
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.6),
                        fontSize: 11,
                      ),
                    ),
                ],
              ),
              if (note.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  note,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.85),
                    fontSize: 13,
                  ),
                ),
              ],
              if (observerName.isNotEmpty) ...[
                const SizedBox(height: 5),
                Text(
                  'Par $observerName${poolDate(o['createdAt']) == null ? '' : ' · écrit le ${_sessionDate(poolDate(o['createdAt']))}'}',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.58),
                    fontSize: 11,
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  String _resultLabel(String r) {
    switch (r) {
      case 'acquis':
        return 'Acquis';
      case 'a_revoir':
        return 'À revoir';
      case 'en_progres':
        return 'En progrès';
      default:
        return 'Noté';
    }
  }

  String _shortDate(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

  // ---- Section « carte de verre » ------------------------------------------
  Widget _section(String title, List<Widget> children, {String? emptyText}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.donkerblauw.withValues(alpha: 0.62),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 15,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          if (children.isEmpty && emptyText != null)
            Text(
              emptyText,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.65),
                fontSize: 13,
              ),
            )
          else
            ...children,
        ],
      ),
    );
  }
}

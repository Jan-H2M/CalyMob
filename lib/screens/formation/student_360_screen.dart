import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../models/formation_snapshot_doc.dart';
import '../../models/member_profile.dart';
import '../../models/mil_experience_overview.dart';
import '../../models/pool_formation_snapshot_doc.dart';
import '../../providers/auth_provider.dart';
import '../../services/formation_snapshot_reader.dart';
import '../../services/member_observation_service.dart';
import '../../services/mil_experience_service.dart';
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
/// (photo, trajet, % brevet, % formation, stats) + 4 onglets :
/// Exercices · Expérience (MIL) · Objectifs (lecture seule, D7) · Observations.
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

  @override
  void initState() {
    super.initState();
    if (widget.previewMode) {
      if (widget.scope == FormationTrackingScope.piscineOnly) {
        _poolSnapshot = widget.previewPoolSnapshot;
      } else {
        _snapshot = widget.previewSnapshot;
        _milOverview = widget.previewMilOverview ??
            (widget.previewSnapshot == null
                ? null
                : MilExperienceOverview.fromSnapshot(
                    widget.previewSnapshot!,
                  ));
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

  Future<void> _loadFull() async {
    final snapshot =
        await _reader!.getSnapshot(widget.clubId, widget.member.id);
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
      length: widget.scope == FormationTrackingScope.piscineOnly ? 2 : 4,
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
                        ? _buildEmpty()
                        : _buildPiscineContent(_poolSnapshot!)
                    : _snapshot == null
                        ? _buildEmpty()
                        : _buildContent(_snapshot!),
          ),
        ),
      ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          "Aucune donnée de formation pour ce membre pour l'instant.\n"
          'La fiche se remplira dès la première activité.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.white.withValues(alpha: 0.85)),
        ),
      ),
    );
  }

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
              Tab(text: 'Exercices'),
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
              _buildMilTab(s),
              _buildGoalsTab(s),
              _buildObservationsTab(s),
            ],
          ),
        ),
        _buildCta(),
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
              _buildPiscineProgressTab(s),
              _buildObservationsTab(null),
            ],
          ),
        ),
        _buildCta(),
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
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _avatar(m, 64),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (trajet.isNotEmpty)
                  Text(
                    trajet,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                const SizedBox(height: 8),
                _progressBar('Exercices', s.exercisePct, AppColors.lichtblauw),
                if (liveMil != null || s.hasMil) ...[
                  const SizedBox(height: 6),
                  _progressBar(
                    'Expériences comptabilisées',
                    liveMil?.modulePct ?? s.milPct,
                    Colors.amberAccent,
                  ),
                ],
                const SizedBox(height: 8),
                Wrap(
                  spacing: 12,
                  runSpacing: 4,
                  children: [
                    _stat('Plongées', '${s.diveStats.total}'),
                    _stat('Mer', '${s.diveStats.mer}'),
                    _stat(
                      'Prof. max',
                      s.diveStats.maxDepthMeters == null
                          ? '—'
                          : '${s.diveStats.maxDepthMeters!.toStringAsFixed(0)} m',
                    ),
                    if (s.attentionCount > 0)
                      _stat('⚠ Attention', '${s.attentionCount}'),
                    if (s.pendingCount > 0)
                      _stat('⏳ En attente', '${s.pendingCount}'),
                  ],
                ),
              ],
            ),
          ),
        ],
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

  Widget _progressBar(String label, int pct, Color color) {
    final p = (pct.clamp(0, 100)) / 100.0;
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
              '$pct %',
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
            value: p,
            minHeight: 7,
            backgroundColor: Colors.white.withValues(alpha: 0.18),
            valueColor: AlwaysStoppedAnimation<Color>(color),
          ),
        ),
      ],
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

  Widget _stat(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 15,
            fontWeight: FontWeight.w800,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.7),
            fontSize: 11,
          ),
        ),
      ],
    );
  }

  Widget _buildCta() {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: BorderSide(color: Colors.white.withValues(alpha: 0.72)),
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                onPressed: _addPoolRemark,
                icon: const Icon(Icons.add_comment_outlined),
                label: const Text('Ajouter une remarque piscine'),
              ),
            ),
            if (widget.scope == FormationTrackingScope.full) ...[
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.lichtblauw,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  // La préparation ouvre le planning depuis une sortie précise :
                  // on renvoie le membre au flux appelant (câblage complet = WP-12).
                  onPressed: () => Navigator.of(
                    context,
                  ).pop({'action': 'plan', 'memberId': widget.member.id}),
                  icon: const Icon(Icons.event_note),
                  label: const Text('Préparer la prochaine séance'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _addPoolRemark() async {
    final noteController = TextEditingController();
    final note = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Remarque piscine'),
        content: TextField(
          controller: noteController,
          autofocus: true,
          minLines: 3,
          maxLines: 5,
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
              final value = noteController.text.trim();
              if (value.isNotEmpty) Navigator.of(dialogContext).pop(value);
            },
            child: const Text('Enregistrer'),
          ),
        ],
      ),
    );
    noteController.dispose();
    if (note == null || note.isEmpty || !mounted) return;

    final auth = context.read<AuthProvider>();
    final observerId = auth.currentUser?.uid ?? '';
    if (observerId.isEmpty) return;
    try {
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
      final observations = await _loadObservations();
      if (!mounted) return;
      setState(() => _observations = observations);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Remarque piscine enregistrée')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('La remarque n’a pas pu être enregistrée.'),
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
  Widget _buildPiscineProgressTab(PoolFormationSnapshotDoc s) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      children: [
        _section('Progression piscine', [
          _poolCountRow(
            'Validés',
            s.validated,
            Icons.check_circle_outline,
            Colors.greenAccent,
          ),
          _poolCountRow(
            'En attente',
            s.pending,
            Icons.hourglass_top_rounded,
            Colors.amberAccent,
          ),
          _poolCountRow(
            'Restants',
            s.remaining,
            Icons.radio_button_unchecked,
            Colors.white70,
          ),
        ]),
      ],
    );
  }

  Widget _poolCountRow(
    String label,
    int count,
    IconData icon,
    Color color,
  ) {
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
        _modalityProgressSummary(s),
        _section(
          '✓ Validés (${s.validated.length})',
          s.validated
              .map((e) => _exRow(e.code, e.description, Colors.greenAccent))
              .toList(),
          emptyText: 'Aucun exercice validé.',
        ),
        _section(
          '⏳ En attente (${s.pending.length + s.pendingClaims.length})',
          [
            ...s.pending.map(
              (e) => _exRow(e.code, e.description, Colors.amberAccent),
            ),
            ...s.pendingClaims.map(
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
          '○ Restants (${s.remaining.length})',
          s.remaining.map((e) {
            final pc = s.perCode[e.code];
            final badge = (pc != null && pc.attempts > 0)
                ? '×${pc.attempts} pratiqué'
                : null;
            return _exRow(e.code, e.description, Colors.white54, badge: badge);
          }).toList(),
          emptyText: 'Tous les exercices de l\'objectif sont couverts.',
        ),
      ],
    );
  }

  Widget _modalityProgressSummary(FormationSnapshotDoc snapshot) {
    final progress = snapshot.modalityProgress;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.donkerblauw.withValues(alpha: 0.72),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Progression par volet',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 9),
          ...FormationModality.values.map((modality) {
            final value = progress[modality]!;
            final total = value.total;
            return Padding(
              padding: const EdgeInsets.only(bottom: 7),
              child: Row(
                children: [
                  SizedBox(
                    width: 68,
                    child: Text(
                      modality.label,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(5),
                      child: LinearProgressIndicator(
                        value: total == 0 ? 0 : value.validated / total,
                        minHeight: 7,
                        backgroundColor: Colors.white.withValues(alpha: 0.16),
                        valueColor: const AlwaysStoppedAnimation<Color>(
                          AppColors.lichtblauw,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    width: 70,
                    child: Text(
                      total == 0
                          ? '—'
                          : '${value.validated}/$total'
                              '${value.pending > 0 ? ' · ${value.pending}⏳' : ''}',
                      textAlign: TextAlign.end,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.86),
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
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
        ),
        const SizedBox(height: 14),
        _section('Profondeurs', [
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
    if (_observations.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'Aucune observation enregistrée.',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.85)),
          ),
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      itemCount: _observations.length,
      itemBuilder: (context, i) {
        final o = _observations[i];
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
                  'Par $observerName',
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

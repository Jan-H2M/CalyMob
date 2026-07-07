import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../config/app_colors.dart';
import '../../models/formation_snapshot_doc.dart';
import '../../models/member_profile.dart';
import '../../services/formation_snapshot_reader.dart';
import '../../widgets/ocean_background.dart';

/// WP-10 — Fiche élève 360°.
///
/// Lecteur PUR du snapshot matérialisé (WP-09) + observations. En-tête
/// (photo, trajet, % brevet, % formation, stats) + 4 onglets :
/// Exercices · Expérience (MIL) · Objectifs (lecture seule, D7) · Observations.
class Student360Screen extends StatefulWidget {
  final String clubId;
  final MemberProfile member;

  const Student360Screen({
    super.key,
    required this.clubId,
    required this.member,
  });

  @override
  State<Student360Screen> createState() => _Student360ScreenState();
}

class _Student360ScreenState extends State<Student360Screen> {
  final FormationSnapshotReader _reader = FormationSnapshotReader();

  bool _loading = true;
  FormationSnapshotDoc? _snapshot;
  List<Map<String, dynamic>> _observations = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final snapshot = await _reader.getSnapshot(widget.clubId, widget.member.id);
    final observations = await _loadObservations();
    if (!mounted) return;
    setState(() {
      _snapshot = snapshot;
      _observations = observations;
      _loading = false;
    });
  }

  Future<List<Map<String, dynamic>>> _loadObservations() async {
    try {
      final snap = await FirebaseFirestore.instance
          .collection('clubs')
          .doc(widget.clubId)
          .collection('member_observations')
          .where('memberId', isEqualTo: widget.member.id)
          .get();
      final list = snap.docs.map((d) => {'id': d.id, ...d.data()}).toList();
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

  String get _fullName =>
      '${widget.member.prenom} ${widget.member.nom}'.trim();

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          iconTheme: const IconThemeData(color: Colors.white),
          title: Text(
            _fullName.isEmpty ? 'Fiche élève' : _fullName,
            style: const TextStyle(
                color: Colors.white, fontWeight: FontWeight.bold),
          ),
        ),
        body: OceanBackground(
          child: SafeArea(
            child: _loading
                ? const Center(
                    child: CircularProgressIndicator(color: Colors.white))
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
        Container(
          color: Colors.white.withValues(alpha: 0.08),
          child: const TabBar(
            isScrollable: true,
            labelColor: Colors.white,
            unselectedLabelColor: Colors.white70,
            indicatorColor: Colors.white,
            tabs: [
              Tab(text: 'Exercices'),
              Tab(text: 'Expérience'),
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
              _buildObservationsTab(),
            ],
          ),
        ),
        _buildCta(),
      ],
    );
  }

  Widget _buildHeader(FormationSnapshotDoc s) {
    final m = widget.member;
    final trajet = s.targetLevel != null && s.targetLevel!.isNotEmpty
        ? '${s.currentCode.isEmpty ? '—' : s.currentCode} → ${s.targetLevel}'
        : (s.currentCode.isEmpty ? '' : s.currentCode);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
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
                  Text(trajet,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                _progressBar('Exercices', s.exercisePct, AppColors.lichtblauw),
                if (s.hasMil) ...[
                  const SizedBox(height: 6),
                  _progressBar('Expérience MIL', s.milPct, Colors.amberAccent),
                ],
                const SizedBox(height: 8),
                Wrap(
                  spacing: 12,
                  runSpacing: 4,
                  children: [
                    _stat('Plongées', '${s.diveStats.total}'),
                    _stat('Mer', '${s.diveStats.mer}'),
                    _stat('Prof. max',
                        s.diveStats.maxDepthMeters == null
                            ? '—'
                            : '${s.diveStats.maxDepthMeters!.toStringAsFixed(0)} m'),
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
      child: Text(initials,
          style: TextStyle(
              color: Colors.white,
              fontSize: size * 0.35,
              fontWeight: FontWeight.bold)),
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
            Text(label,
                style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.85), fontSize: 12)),
            Text('$pct %',
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w700)),
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

  Widget _stat(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value,
            style: const TextStyle(
                color: Colors.white,
                fontSize: 15,
                fontWeight: FontWeight.w800)),
        Text(label,
            style: TextStyle(
                color: Colors.white.withValues(alpha: 0.7), fontSize: 11)),
      ],
    );
  }

  Widget _buildCta() {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
        child: SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.lichtblauw,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 13),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14)),
            ),
            // La préparation ouvre le planning depuis une sortie précise :
            // on renvoie le membre au flux appelant (câblage complet = WP-12).
            onPressed: () =>
                Navigator.of(context).pop({'action': 'plan', 'memberId': widget.member.id}),
            icon: const Icon(Icons.event_note),
            label: const Text('Préparer la prochaine séance'),
          ),
        ),
      ),
    );
  }

  // ---- Onglet Exercices ----------------------------------------------------
  Widget _buildExercisesTab(FormationSnapshotDoc s) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      children: [
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
            ...s.pending.map((e) => _exRow(e.code, e.description, Colors.amberAccent)),
            ...s.pendingClaims.map((c) =>
                _exRow(c.code, c.label.isNotEmpty ? c.label : c.status, Colors.amberAccent)),
          ],
          emptyText: 'Rien en attente.',
        ),
        _section(
          '○ Restants (${s.remaining.length})',
          s.remaining.map((e) {
            final pc = s.perCode[e.code];
            final badge = (pc != null && pc.attempts > 0) ? '×${pc.attempts} pratiqué' : null;
            return _exRow(e.code, e.description, Colors.white54, badge: badge);
          }).toList(),
          emptyText: 'Tous les exercices de l\'objectif sont couverts.',
        ),
      ],
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
                Text(code,
                    style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w700)),
                if (subtitle.isNotEmpty)
                  Text(subtitle,
                      style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.75),
                          fontSize: 12)),
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
              child: Text(badge,
                  style: const TextStyle(color: Colors.white, fontSize: 11)),
            ),
        ],
      ),
    );
  }

  // ---- Onglet Expérience (MIL) --------------------------------------------
  Widget _buildMilTab(FormationSnapshotDoc s) {
    if (!s.hasMil || s.milPerRequirement.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            "Pas de tableau d'expériences MIL pour ce niveau.",
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white.withValues(alpha: 0.85)),
          ),
        ),
      );
    }
    final zones = s.diveStats.zones;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      children: [
        _section(
          'Expériences exigées (module ${s.milPct} %)',
          s.milPerRequirement.entries.map((e) {
            final label = milExperienceLabelFr[e.key] ?? e.key;
            return _milRow(label, e.value);
          }).toList(),
        ),
        _section(
          'Profondeurs',
          [
            _kv('0–10 m', '${zones['0_10'] ?? 0}'),
            _kv('10–20 m', '${zones['10_20'] ?? 0}'),
            _kv('20–30 m', '${zones['20_30'] ?? 0}'),
            _kv('30 m et +', '${zones['30_plus'] ?? 0}'),
          ],
        ),
      ],
    );
  }

  Widget _milRow(String label, SnapshotMilRequirement r) {
    if (r.dataMissing) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
                child: Text(label,
                    style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.85)))),
            const Text('Données manquantes',
                style: TextStyle(color: Colors.white54, fontSize: 12)),
          ],
        ),
      );
    }
    final done = r.have >= r.need;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(child: Text(label, style: const TextStyle(color: Colors.white))),
              Text('${r.have}/${r.need}',
                  style: TextStyle(
                      color: done ? Colors.greenAccent : Colors.white,
                      fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 3),
          ClipRRect(
            borderRadius: BorderRadius.circular(5),
            child: LinearProgressIndicator(
              value: r.ratio,
              minHeight: 5,
              backgroundColor: Colors.white.withValues(alpha: 0.15),
              valueColor: AlwaysStoppedAnimation<Color>(
                  done ? Colors.greenAccent : Colors.amberAccent),
            ),
          ),
        ],
      ),
    );
  }

  Widget _kv(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(k, style: TextStyle(color: Colors.white.withValues(alpha: 0.85))),
          Text(v,
              style: const TextStyle(
                  color: Colors.white, fontWeight: FontWeight.w700)),
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
          s.goalCodes.map((c) => _exRow(c, s.perCode[c]?.lastResult ?? '', Colors.tealAccent)).toList(),
          emptyText: 'Aucun exercice ciblé.',
        ),
        if (s.goalNote.isNotEmpty)
          _section('Note', [
            Text(s.goalNote,
                style: TextStyle(color: Colors.white.withValues(alpha: 0.9))),
          ]),
      ],
    );
  }

  // ---- Onglet Observations -------------------------------------------------
  Widget _buildObservationsTab() {
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
        final code = o['exerciceCode']?.toString() ?? o['themeTitle']?.toString() ?? '';
        final note = o['note']?.toString() ?? '';
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
            color: Colors.white.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.25),
                        borderRadius: BorderRadius.circular(20)),
                    child: Text(_resultLabel(result),
                        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700)),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(code,
                        style: const TextStyle(
                            color: Colors.white, fontWeight: FontWeight.w700)),
                  ),
                  if (date != null)
                    Text(_shortDate(date),
                        style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.6), fontSize: 11)),
                ],
              ),
              if (note.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(note,
                    style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.85), fontSize: 13)),
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
        color: Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          if (children.isEmpty && emptyText != null)
            Text(emptyText,
                style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.65), fontSize: 13))
          else
            ...children,
        ],
      ),
    );
  }
}

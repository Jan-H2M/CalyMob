/// Piscine — group roster validation (Carnet de Formation).
///
/// The encadrant validates his whole group in one pass: per student, présent/
/// absent + a coarse verdict (acquis / en progrès / à revoir) + an optional
/// per-student comment. One "Enregistrer" saves the group.
///
/// Same shared model as the rest of the carnet: the student declares the facts
/// (présence + group) in his check-in; this screen lets the encadrant add the
/// verdict on top. The verdict is stored on each student's pool logbook entry
/// (see CARNET_SCENARIOS_CATALOGUE.md). Wiring onto Firestore is a separate,
/// cross-app-coordinated step; this screen is UI-first and data-injected.
///
/// `previewMode` (scenario gallery) shows the payload instead of persisting.

import 'dart:convert';

import 'package:flutter/material.dart';

import '../../config/app_colors.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

/// Coarse per-student verdict for a pool session. `none` = not judged yet.
enum GroupVerdict { none, acquis, enProgres, aRevoir }

extension GroupVerdictX on GroupVerdict {
  String? get code {
    switch (this) {
      case GroupVerdict.acquis:
        return 'acquis';
      case GroupVerdict.enProgres:
        return 'en_progres';
      case GroupVerdict.aRevoir:
        return 'a_revoir';
      case GroupVerdict.none:
        return null;
    }
  }
}

class PoolRosterStudent {
  final String memberId;
  final String name;
  final String? photoUrl;
  bool present;
  GroupVerdict verdict;
  String comment;

  PoolRosterStudent({
    required this.memberId,
    required this.name,
    this.photoUrl,
    this.present = true,
    this.verdict = GroupVerdict.none,
    this.comment = '',
  });

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty) return '?';
    if (parts.length == 1) {
      return parts.first.characters.take(2).toString().toUpperCase();
    }
    return (parts.first.characters.first + parts.last.characters.first)
        .toUpperCase();
  }
}

class PoolGroupRosterScreen extends StatefulWidget {
  final String groupTitle; // e.g. "2★ · répétition brevet 2★"
  final List<PoolRosterStudent> students;
  final bool previewMode;

  const PoolGroupRosterScreen({
    super.key,
    required this.groupTitle,
    required this.students,
    this.previewMode = false,
  });

  @override
  State<PoolGroupRosterScreen> createState() => _PoolGroupRosterScreenState();
}

class _PoolGroupRosterScreenState extends State<PoolGroupRosterScreen> {
  bool _submitting = false;

  static const _verdictColors = <GroupVerdict, Color>{
    GroupVerdict.acquis: Color(0xFF16A34A),
    GroupVerdict.enProgres: Color(0xFFF59E0B),
    GroupVerdict.aRevoir: Color(0xFFE5484D),
  };
  static const _verdictLabels = <GroupVerdict, String>{
    GroupVerdict.acquis: 'A',
    GroupVerdict.enProgres: 'P',
    GroupVerdict.aRevoir: 'R',
  };

  bool get _canSubmit => !_submitting;

  Map<String, dynamic> _buildPayload() {
    return {
      'group': widget.groupTitle,
      'students': [
        for (final s in widget.students)
          {
            'member_id': s.memberId,
            'present': s.present,
            if (s.present && s.verdict != GroupVerdict.none)
              'verdict': s.verdict.code,
            if (s.comment.trim().isNotEmpty) 'comment': s.comment.trim(),
          },
      ],
    };
  }

  Future<void> _submit() async {
    if (!_canSubmit) return;
    final payload = _buildPayload();
    if (widget.previewMode) {
      await _showPreviewResult(payload);
      if (mounted) Navigator.pop(context);
      return;
    }
    // Real persistence (verdict onto student_logbook_entries) is wired in a
    // separate, cross-app-coordinated step. Reached only in preview for now.
    setState(() => _submitting = true);
    try {
      // TODO(carnet): write verdict + comment onto each student's pool entry.
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _showPreviewResult(Map<String, dynamic> data) async {
    const encoder = JsonEncoder.withIndent('  ');
    String pretty;
    try {
      pretty = encoder.convert(data);
    } catch (_) {
      pretty = data.toString();
    }
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Aperçu — validation groupe'),
        content: SingleChildScrollView(
          child: Text(
            pretty,
            style: const TextStyle(fontFamily: 'monospace', fontSize: 12.5),
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

  Future<void> _editComment(PoolRosterStudent s) async {
    final controller = TextEditingController(text: s.comment);
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(s.name),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Commentaire (visible par les encadrants)',
              style: TextStyle(fontSize: 12.5),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: controller,
              autofocus: true,
              minLines: 3,
              maxLines: 5,
              decoration: const InputDecoration(
                hintText: 'Ex. bon palier, à retravailler le lestage…',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Enregistrer'),
          ),
        ],
      ),
    );
    if (result != null) setState(() => s.comment = result);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _header(context),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                  children: [
                    _contextCard(),
                    const SizedBox(height: 10),
                    _legend(),
                    const SizedBox(height: 12),
                    _Card(child: _studentsList()),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _canSubmit ? _submit : null,
              icon: _submitting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.donkerblauw,
                      ),
                    )
                  : const Icon(Icons.send),
              label: Text(
                _submitting ? 'Envoi…' : 'Enregistrer le groupe',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.lichtblauw,
                foregroundColor: AppColors.donkerblauw,
                padding: const EdgeInsets.symmetric(vertical: 15),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _header(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 16, 6),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          const Text(
            'MON GROUPE',
            style: TextStyle(
              color: Colors.white70,
              fontSize: 11.5,
              letterSpacing: 1.4,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _contextCard() {
    return _Card(
      child: Row(
        children: [
          const Icon(Icons.groups_outlined, color: Colors.white, size: 32),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.groupTitle,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Coche présent, donne un verdict en un geste.',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.78),
                    fontSize: 12.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _studentsList() {
    final rows = <Widget>[];
    for (var i = 0; i < widget.students.length; i++) {
      if (i > 0) {
        rows.add(Divider(color: Colors.white.withValues(alpha: 0.10), height: 1));
      }
      rows.add(_studentRow(widget.students[i]));
    }
    return Column(children: rows);
  }

  Widget _studentRow(PoolRosterStudent s) {
    final dim = s.present ? 1.0 : 0.4;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          _presentToggle(s),
          const SizedBox(width: 8),
          Opacity(opacity: dim, child: _avatar(s)),
          const SizedBox(width: 8),
          Expanded(
            child: Opacity(
              opacity: dim,
              child: Text(
                s.name,
                style: const TextStyle(color: Colors.white, fontSize: 13.5),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
          Opacity(
            opacity: dim,
            child: Row(
              children: [
                for (final v in const [
                  GroupVerdict.acquis,
                  GroupVerdict.enProgres,
                  GroupVerdict.aRevoir,
                ])
                  Padding(
                    padding: const EdgeInsets.only(left: 4),
                    child: _verdictButton(s, v),
                  ),
              ],
            ),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            icon: Icon(
              s.comment.isNotEmpty ? Icons.chat_bubble : Icons.add_comment_outlined,
              color: s.comment.isNotEmpty
                  ? AppColors.lichtblauw
                  : Colors.white.withValues(alpha: 0.6),
              size: 20,
            ),
            onPressed: () => _editComment(s),
          ),
        ],
      ),
    );
  }

  Widget _presentToggle(PoolRosterStudent s) {
    return InkWell(
      borderRadius: BorderRadius.circular(6),
      onTap: () => setState(() {
        s.present = !s.present;
        if (!s.present) s.verdict = GroupVerdict.none;
      }),
      child: Container(
        width: 24,
        height: 24,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: s.present ? AppColors.lichtblauw : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: s.present
                ? AppColors.lichtblauw
                : Colors.white.withValues(alpha: 0.4),
          ),
        ),
        child: s.present
            ? const Icon(Icons.check, color: AppColors.donkerblauw, size: 16)
            : null,
      ),
    );
  }

  Widget _avatar(PoolRosterStudent s) {
    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white.withValues(alpha: 0.18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.45)),
        image: (s.photoUrl != null && s.photoUrl!.isNotEmpty)
            ? DecorationImage(
                image: NetworkImage(s.photoUrl!), fit: BoxFit.cover)
            : null,
      ),
      alignment: Alignment.center,
      child: (s.photoUrl == null || s.photoUrl!.isEmpty)
          ? Text(
              s.initials,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
              ),
            )
          : null,
    );
  }

  Widget _verdictButton(PoolRosterStudent s, GroupVerdict v) {
    final active = s.verdict == v;
    final color = _verdictColors[v]!;
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: s.present
          ? () => setState(
                () => s.verdict = active ? GroupVerdict.none : v,
              )
          : null,
      child: Container(
        width: 28,
        height: 28,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: active ? color : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: active ? color : Colors.white.withValues(alpha: 0.35),
          ),
        ),
        child: Text(
          _verdictLabels[v]!,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }

  Widget _legend() {
    Widget chip(GroupVerdict v, String text) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 14,
              height: 14,
              decoration: BoxDecoration(
                color: _verdictColors[v],
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            const SizedBox(width: 5),
            Text(
              text,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.8),
                fontSize: 11.5,
              ),
            ),
          ],
        );
    return Wrap(
      spacing: 14,
      runSpacing: 6,
      children: [
        chip(GroupVerdict.acquis, 'acquis'),
        chip(GroupVerdict.enProgres, 'en progrès'),
        chip(GroupVerdict.aRevoir, 'à revoir'),
      ],
    );
  }
}

class _Card extends StatelessWidget {
  final Widget child;
  const _Card({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
      ),
      child: child,
    );
  }
}

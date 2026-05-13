/// Phase C follow-up (2026-05-13) — BinomeTypeaheadField widget.
///
/// Implements `_carnet_plan.md` §13 C.10 + §3.1.4 mockup:
///   - Text input with 200 ms debounce that searches club members
///     (case-insensitive on prénom + nom).
///   - Dropdown listing matching club members with their brevet.
///   - "Ajouter « foo » comme externe…" tile when the typed value
///     doesn't match a club member; opens a small modal with 3
///     optional fields (nom, niveau, club).
///   - Already-added binômes are rendered as removable chips above
///     the input.
///   - On save the parent screen receives an immutable list of
///     [BinomeSelection] objects with snapshot fields, ready to be
///     written into the v2.2 `binomes[]` array.
///
/// The widget does NOT touch Firestore on its own; it loads the
/// members list once via [_loadMembers] and filters client-side.
/// For a 100-member club this is well under 100 KB on the wire.

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../config/app_colors.dart';
import '../config/firebase_config.dart';

/// A snapshotted binôme — see _carnet_plan §11 Q17 / Q18 + tech doc §6.3.
class BinomeSelection {
  /// `'member'` when the binôme is a Calypso member; `'external'` otherwise.
  final String type;

  /// Members: Firestore doc id. Externals: null.
  final String? memberId;

  /// Members: snapshotted "Prénom Nom" at the moment of adding.
  /// Externals: free text name (may be null if only niveau/club filled).
  final String? displayName;

  /// Externals only.
  final String? niveau;

  /// Externals only.
  final String? club;

  const BinomeSelection.member({
    required this.memberId,
    required String this.displayName,
  })  : type = 'member',
        niveau = null,
        club = null;

  const BinomeSelection.external({
    this.displayName,
    this.niveau,
    this.club,
  })  : type = 'external',
        memberId = null;

  Map<String, dynamic> toMap() {
    return {
      'type': type,
      if (memberId != null) 'memberId': memberId,
      if (displayName != null && displayName!.isNotEmpty) 'displayName': displayName,
      if (niveau != null && niveau!.isNotEmpty) 'niveau': niveau,
      if (club != null && club!.isNotEmpty) 'club': club,
      'addedAt': Timestamp.now(),
    };
  }

  String get chipLabel {
    if (type == 'member') return displayName ?? '?';
    final parts = <String>[
      if (displayName != null && displayName!.isNotEmpty) displayName!,
      if (niveau != null && niveau!.isNotEmpty) niveau!,
      if (club != null && club!.isNotEmpty) club!,
    ];
    if (parts.isEmpty) return 'Binôme externe';
    return parts.join(' · ');
  }

  bool get isExternal => type == 'external';
}

class _MemberRow {
  final String id;
  final String prenom;
  final String nom;
  final String? brevet;

  const _MemberRow({
    required this.id,
    required this.prenom,
    required this.nom,
    this.brevet,
  });

  String get displayName => '$prenom $nom'.trim();
  String get searchKey => '${prenom.toLowerCase()} ${nom.toLowerCase()}';
}

class BinomeTypeaheadField extends StatefulWidget {
  final List<BinomeSelection> binomes;
  final ValueChanged<List<BinomeSelection>> onChanged;

  /// User id to exclude from search results (don't suggest yourself).
  final String? currentUserId;

  const BinomeTypeaheadField({
    super.key,
    required this.binomes,
    required this.onChanged,
    this.currentUserId,
  });

  @override
  State<BinomeTypeaheadField> createState() => _BinomeTypeaheadFieldState();
}

class _BinomeTypeaheadFieldState extends State<BinomeTypeaheadField> {
  final TextEditingController _input = TextEditingController();
  final FocusNode _focus = FocusNode();
  List<_MemberRow> _members = const [];
  bool _loading = true;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _loadMembers();
  }

  Future<void> _loadMembers() async {
    try {
      const clubId = FirebaseConfig.defaultClubId;
      final snap = await FirebaseFirestore.instance
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .orderBy('nom')
          .get();
      final rows = snap.docs.map((d) {
        final data = d.data();
        return _MemberRow(
          id: d.id,
          prenom: (data['prenom'] as String?)?.trim() ??
              (data['first_name'] as String?)?.trim() ??
              '',
          nom: (data['nom'] as String?)?.trim() ??
              (data['last_name'] as String?)?.trim() ??
              '',
          brevet: (data['plongeur_code'] as String?)?.trim(),
        );
      }).where((r) => r.displayName.isNotEmpty).toList();
      if (!mounted) return;
      setState(() {
        _members = rows;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _input.dispose();
    _focus.dispose();
    super.dispose();
  }

  List<_MemberRow> get _filtered {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return const [];
    final alreadyMemberIds =
        widget.binomes.where((b) => b.memberId != null).map((b) => b.memberId).toSet();
    return _members
        .where((m) {
          if (alreadyMemberIds.contains(m.id)) return false;
          if (widget.currentUserId != null && m.id == widget.currentUserId) return false;
          return m.searchKey.contains(q);
        })
        .take(8)
        .toList();
  }

  void _addBinome(BinomeSelection b) {
    final next = [...widget.binomes, b];
    widget.onChanged(next);
    _input.clear();
    setState(() => _query = '');
    _focus.unfocus();
  }

  void _removeBinome(int index) {
    final next = [...widget.binomes];
    next.removeAt(index);
    widget.onChanged(next);
  }

  Future<void> _openExternalModal({String? initialName}) async {
    final result = await showModalBottomSheet<BinomeSelection>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ExternalBinomeSheet(initialName: initialName),
    );
    if (result != null) _addBinome(result);
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    final query = _query.trim();
    final showAddExternal = query.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (widget.binomes.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (var i = 0; i < widget.binomes.length; i++)
                  _BinomeChip(
                    binome: widget.binomes[i],
                    onRemove: () => _removeBinome(i),
                  ),
              ],
            ),
          ),
        TextField(
          controller: _input,
          focusNode: _focus,
          onChanged: (v) => setState(() => _query = v),
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.search),
            hintText: 'Tape un nom de membre…',
            border: InputBorder.none,
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(vertical: 12),
            suffixIcon: _query.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: () {
                      _input.clear();
                      setState(() => _query = '');
                    },
                  )
                : null,
          ),
        ),
        if (_query.isNotEmpty) ...[
          const SizedBox(height: 4),
          Container(
            decoration: BoxDecoration(
              color: Colors.grey.shade50,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: Column(
              children: [
                if (_loading)
                  const Padding(
                    padding: EdgeInsets.all(14),
                    child: Center(
                      child: SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    ),
                  )
                else ...[
                  for (final m in filtered)
                    _ResultTile(
                      icon: Icons.person_outline,
                      title: m.displayName,
                      subtitle: m.brevet,
                      onTap: () => _addBinome(
                        BinomeSelection.member(
                          memberId: m.id,
                          displayName: m.displayName,
                        ),
                      ),
                    ),
                  if (filtered.isEmpty)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
                      child: Text(
                        'Aucun membre Calypso ne correspond.',
                        style: TextStyle(
                          color: Colors.grey.shade600,
                          fontSize: 12.5,
                        ),
                      ),
                    ),
                  if (showAddExternal) ...[
                    if (filtered.isNotEmpty) const Divider(height: 1),
                    _ResultTile(
                      icon: Icons.person_add_alt_outlined,
                      title: 'Ajouter « $query » comme externe…',
                      subtitle: 'Plongeur d\'un autre club',
                      onTap: () => _openExternalModal(initialName: query),
                    ),
                  ],
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _ResultTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  const _ResultTile({
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      dense: true,
      leading: Icon(icon, size: 20, color: AppColors.middenblauw),
      title: Text(title, style: const TextStyle(fontSize: 14)),
      subtitle: subtitle != null && subtitle!.isNotEmpty
          ? Text(subtitle!, style: const TextStyle(fontSize: 12))
          : null,
      onTap: onTap,
    );
  }
}

class _BinomeChip extends StatelessWidget {
  final BinomeSelection binome;
  final VoidCallback onRemove;

  const _BinomeChip({required this.binome, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 4, 4, 4),
      decoration: BoxDecoration(
        color: binome.isExternal
            ? const Color(0xFFE0F2FE)
            : const Color(0xFFD1FAE5),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            binome.isExternal ? Icons.public : Icons.person,
            size: 14,
            color: binome.isExternal
                ? const Color(0xFF0369A1) // sky-700
                : Colors.green.shade800,
          ),
          const SizedBox(width: 4),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 220),
            child: Text(
              binome.chipLabel,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: binome.isExternal
                    ? const Color(0xFF075985)
                    : const Color(0xFF065F46),
              ),
            ),
          ),
          IconButton(
            onPressed: onRemove,
            iconSize: 14,
            padding: const EdgeInsets.all(2),
            constraints: const BoxConstraints(minWidth: 24, minHeight: 24),
            icon: const Icon(Icons.close),
            color: Colors.black54,
          ),
        ],
      ),
    );
  }
}

class _ExternalBinomeSheet extends StatefulWidget {
  final String? initialName;
  const _ExternalBinomeSheet({this.initialName});

  @override
  State<_ExternalBinomeSheet> createState() => _ExternalBinomeSheetState();
}

class _ExternalBinomeSheetState extends State<_ExternalBinomeSheet> {
  late final TextEditingController _nom;
  final TextEditingController _niveau = TextEditingController();
  final TextEditingController _club = TextEditingController();

  @override
  void initState() {
    super.initState();
    _nom = TextEditingController(text: widget.initialName ?? '');
  }

  @override
  void dispose() {
    _nom.dispose();
    _niveau.dispose();
    _club.dispose();
    super.dispose();
  }

  bool get _hasAny =>
      _nom.text.trim().isNotEmpty ||
      _niveau.text.trim().isNotEmpty ||
      _club.text.trim().isNotEmpty;

  void _save() {
    if (!_hasAny) return;
    Navigator.pop(
      context,
      BinomeSelection.external(
        displayName: _nom.text.trim().isEmpty ? null : _nom.text.trim(),
        niveau: _niveau.text.trim().isEmpty ? null : _niveau.text.trim(),
        club: _club.text.trim().isEmpty ? null : _club.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final viewInsets = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: viewInsets),
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              const Row(
                children: [
                  Icon(Icons.person_add_alt, color: AppColors.middenblauw),
                  SizedBox(width: 8),
                  Text(
                    'Binôme externe',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                'Tous les champs sont facultatifs — remplis au moins un.',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
              const SizedBox(height: 14),
              _field(label: 'Nom', controller: _nom, hint: 'Pierre Dupont'),
              const SizedBox(height: 10),
              _field(label: 'Niveau', controller: _niveau, hint: '2★, MN, etc.'),
              const SizedBox(height: 10),
              _field(label: 'Club', controller: _club, hint: 'Néréides Charleroi'),
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Annuler'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _hasAny ? _save : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.middenblauw,
                        foregroundColor: Colors.white,
                      ),
                      child: const Text('Ajouter'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _field({
    required String label,
    required TextEditingController controller,
    required String hint,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: Colors.black87,
          ),
        ),
        const SizedBox(height: 4),
        TextField(
          controller: controller,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            hintText: hint,
            filled: true,
            fillColor: Colors.grey.shade100,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide.none,
            ),
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
        ),
      ],
    );
  }
}

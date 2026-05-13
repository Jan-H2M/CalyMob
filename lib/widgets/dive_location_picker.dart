/// Phase C follow-up (2026-05-13) — DiveLocationPicker widget.
///
/// Tap-to-open bottom-sheet picker that loads `clubs/{clubId}/dive_locations`
/// once, filters client-side as the user types, and returns the chosen
/// location to the caller. Used by the logbook entry screen so the diver
/// can pick a real site (Vodelée, Strijenham, ...) instead of free-typing.
///
/// Free-typing fallback is still supported: an "Utiliser tel quel" tile is
/// shown at the bottom of the results list when the user has typed text
/// that doesn't match any existing location.
///
/// Returns a [DiveLocationSelection] object:
///   - `id`        — Firestore doc id, or null when free-typed
///   - `name`      — display name
///   - `country`   — ISO country code (e.g. "BE", "NL")
///   - `isSea`     — true when water_type == 'sea' (used to auto-set
///                   counters.mer on the logbook entry)

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../config/app_colors.dart';
import '../config/firebase_config.dart';

class DiveLocationSelection {
  final String? id;
  final String name;
  final String? country;
  final bool isSea;

  const DiveLocationSelection({
    this.id,
    required this.name,
    this.country,
    this.isSea = false,
  });
}

class DiveLocationPickerField extends StatelessWidget {
  final DiveLocationSelection? value;
  final ValueChanged<DiveLocationSelection> onSelected;
  final bool readOnly;
  final String hint;

  const DiveLocationPickerField({
    super.key,
    required this.value,
    required this.onSelected,
    this.readOnly = false,
    this.hint = 'Choisis un lieu…',
  });

  @override
  Widget build(BuildContext context) {
    final hasValue = value != null && value!.name.isNotEmpty;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: readOnly
            ? null
            : () async {
                final result = await showModalBottomSheet<DiveLocationSelection>(
                  context: context,
                  isScrollControlled: true,
                  backgroundColor: Colors.transparent,
                  builder: (_) => const _DiveLocationPickerSheet(),
                );
                if (result != null) onSelected(result);
              },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          child: Row(
            children: [
              Icon(
                hasValue && value!.isSea
                    ? Icons.waves
                    : Icons.location_on_outlined,
                color: hasValue ? AppColors.middenblauw : Colors.grey,
                size: 22,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: hasValue
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            value!.name,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: Colors.black87,
                            ),
                          ),
                          if (value!.country != null && value!.country!.isNotEmpty)
                            Text(
                              '${value!.country}'
                              '${value!.isSea ? ' · mer' : ''}',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.black.withValues(alpha: 0.55),
                              ),
                            ),
                        ],
                      )
                    : Text(
                        hint,
                        style: TextStyle(
                          color: Colors.black.withValues(alpha: 0.45),
                          fontSize: 15,
                        ),
                      ),
              ),
              if (!readOnly)
                Icon(
                  Icons.unfold_more,
                  color: Colors.black.withValues(alpha: 0.4),
                  size: 20,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DiveLocationPickerSheet extends StatefulWidget {
  const _DiveLocationPickerSheet();

  @override
  State<_DiveLocationPickerSheet> createState() =>
      _DiveLocationPickerSheetState();
}

class _DiveLocationPickerSheetState extends State<_DiveLocationPickerSheet> {
  final TextEditingController _query = TextEditingController();
  List<_LocationRow> _all = const [];
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      const clubId = FirebaseConfig.defaultClubId;
      final snap = await FirebaseFirestore.instance
          .collection('clubs')
          .doc(clubId)
          .collection('dive_locations')
          .orderBy('name')
          .get();
      final rows = snap.docs.map((d) {
        final data = d.data();
        final waterType = (data['water_type'] as String?)?.toLowerCase();
        return _LocationRow(
          id: d.id,
          name: (data['name'] as String?)?.trim() ?? '—',
          country: (data['country'] as String?)?.trim(),
          isSea: waterType == 'sea' || waterType == 'mer',
        );
      }).toList();
      if (!mounted) return;
      setState(() {
        _all = rows;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final q = _query.text.trim().toLowerCase();
    final filtered = q.isEmpty
        ? _all
        : _all.where((r) {
            final hay = '${r.name} ${r.country ?? ''}'.toLowerCase();
            return hay.contains(q);
          }).toList();

    final maxHeight = MediaQuery.of(context).size.height * 0.85;
    final viewInsets = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: viewInsets),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                child: Row(
                  children: [
                    const Icon(Icons.location_on, color: AppColors.middenblauw),
                    const SizedBox(width: 8),
                    const Text(
                      'Choisir un lieu',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close, color: Colors.black54),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                child: TextField(
                  controller: _query,
                  autofocus: true,
                  onChanged: (_) => setState(() {}),
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.search),
                    hintText: 'Vodelée, Strijenham, La Gombe…',
                    filled: true,
                    fillColor: Colors.grey.shade100,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
              Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : _error.isNotEmpty
                        ? Padding(
                            padding: const EdgeInsets.all(20),
                            child: Text(
                              'Erreur de chargement\n$_error',
                              style: TextStyle(color: Colors.red.shade700),
                              textAlign: TextAlign.center,
                            ),
                          )
                        : _resultsList(filtered, q),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _resultsList(List<_LocationRow> rows, String q) {
    final children = <Widget>[];
    for (final r in rows) {
      children.add(_tile(
        title: r.name,
        subtitle: [
          if (r.country != null && r.country!.isNotEmpty) r.country,
          if (r.isSea) 'mer',
        ].whereType<String>().join(' · '),
        leading: Icon(
          r.isSea ? Icons.waves : Icons.terrain,
          color: r.isSea ? Colors.cyan.shade700 : Colors.green.shade700,
        ),
        onTap: () {
          Navigator.pop(
            context,
            DiveLocationSelection(
              id: r.id,
              name: r.name,
              country: r.country,
              isSea: r.isSea,
            ),
          );
        },
      ));
    }

    // Free-typed fallback when query has text but doesn't match any row.
    if (q.isNotEmpty &&
        !rows.any((r) => r.name.toLowerCase() == q)) {
      children.add(const Divider(height: 1));
      children.add(_tile(
        title: 'Utiliser « ${_query.text.trim()} » tel quel',
        subtitle: 'Lieu libre — pas dans la base',
        leading: const Icon(Icons.edit_location_alt_outlined, color: Colors.grey),
        onTap: () {
          Navigator.pop(
            context,
            DiveLocationSelection(name: _query.text.trim()),
          );
        },
      ));
    }

    if (children.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            q.isEmpty
                ? 'Pas encore de lieux enregistrés.'
                : 'Aucun lieu ne correspond à « ${_query.text.trim()} ».',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey.shade600),
          ),
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.only(bottom: 24),
      itemCount: children.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (_, i) => children[i],
    );
  }

  Widget _tile({
    required String title,
    required String subtitle,
    required Widget leading,
    required VoidCallback onTap,
  }) {
    return ListTile(
      leading: SizedBox(width: 28, height: 28, child: Center(child: leading)),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: subtitle.isEmpty ? null : Text(subtitle),
      onTap: onTap,
    );
  }
}

class _LocationRow {
  final String id;
  final String name;
  final String? country;
  final bool isSea;

  const _LocationRow({
    required this.id,
    required this.name,
    this.country,
    this.isSea = false,
  });
}

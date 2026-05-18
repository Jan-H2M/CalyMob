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
import 'package:provider/provider.dart';
import '../config/app_colors.dart';
import '../config/firebase_config.dart';
import '../providers/auth_provider.dart';

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
                final result =
                    await showModalBottomSheet<DiveLocationSelection>(
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
                          if (value!.country != null &&
                              value!.country!.isNotEmpty)
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
      final userId = context.read<AuthProvider>().currentUser?.uid;
      final db = FirebaseFirestore.instance;
      final centralSnap = await db
          .collection('clubs')
          .doc(clubId)
          .collection('dive_locations')
          .orderBy('name')
          .get();
      QuerySnapshot<Map<String, dynamic>>? carnetSnap;
      if (userId != null) {
        carnetSnap = await db
            .collection('clubs')
            .doc(clubId)
            .collection('student_logbook_entries')
            .where('member_id', isEqualTo: userId)
            .limit(1000)
            .get();
      }
      final rowsByName = <String, _LocationRow>{};
      void addRow(_LocationRow row) {
        final key = _normalizeLocationSearch(row.name);
        if (key.isEmpty) return;
        final existing = rowsByName[key];
        rowsByName[key] = existing == null
            ? row
            : _LocationRow(
                id: existing.id ?? row.id,
                name: existing.name,
                country: existing.country ?? row.country,
                isSea: existing.isSea || row.isSea,
              );
      }

      for (final d in centralSnap.docs) {
        final data = d.data();
        final waterType = (data['water_type'] as String?)?.toLowerCase();
        addRow(_LocationRow(
          id: d.id,
          name: (data['name'] as String?)?.trim() ?? '—',
          country: (data['country'] as String?)?.trim(),
          isSea: waterType == 'sea' || waterType == 'mer',
        ));
      }
      for (final d in carnetSnap?.docs ?? const []) {
        final data = d.data();
        final name =
            ((data['location_name'] ?? data['lieu']) as String? ?? '').trim();
        final counters = data['counters'];
        addRow(_LocationRow(
          name: name,
          country: (data['country'] as String?)?.trim(),
          isSea: counters is Map && counters['mer'] == true,
        ));
      }
      final rows = rowsByName.values.toList()
        ..sort((a, b) => a.name.compareTo(b.name));
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
    final q = _normalizeLocationSearch(_query.text);
    final filtered = _filteredLocations(q);

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
                    hintStyle: TextStyle(
                      color: Colors.grey.shade400,
                      fontStyle: FontStyle.italic,
                    ),
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

  List<_LocationRow> _filteredLocations(String q) {
    if (q.isEmpty) return _all;
    final scored = <({_LocationRow row, int score})>[];
    for (final row in _all) {
      final score = _locationSearchScore(q, row);
      if (score < 999) scored.add((row: row, score: score));
    }
    scored.sort((a, b) {
      final scoreCmp = a.score.compareTo(b.score);
      if (scoreCmp != 0) return scoreCmp;
      return a.row.name.compareTo(b.row.name);
    });
    return scored.map((s) => s.row).toList();
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
    if (q.isNotEmpty && !rows.any((r) => r.name.toLowerCase() == q)) {
      children.add(const Divider(height: 1));
      children.add(_tile(
        title: 'Utiliser « ${_query.text.trim()} » tel quel',
        subtitle: 'Lieu libre — pas dans la base',
        leading:
            const Icon(Icons.edit_location_alt_outlined, color: Colors.grey),
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
  final String? id;
  final String name;
  final String? country;
  final bool isSea;

  const _LocationRow({
    this.id,
    required this.name,
    this.country,
    this.isSea = false,
  });
}

String _normalizeLocationSearch(String value) {
  return value
      .toLowerCase()
      .replaceAll(RegExp(r'[àáâä]'), 'a')
      .replaceAll(RegExp(r'[èéêë]'), 'e')
      .replaceAll(RegExp(r'[ìíîï]'), 'i')
      .replaceAll(RegExp(r'[òóôö]'), 'o')
      .replaceAll(RegExp(r'[ùúûü]'), 'u')
      .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
      .trim()
      .replaceAll(RegExp(r'\s+'), ' ');
}

int _locationSearchScore(String query, _LocationRow row) {
  final name = _normalizeLocationSearch(row.name);
  final country = _normalizeLocationSearch(row.country ?? '');
  if (name == query || country == query) return 0;
  final words = [
    ...name.split(' '),
    if (country.isNotEmpty) ...country.split(' '),
  ].where((w) => w.isNotEmpty).toList();
  if (words.any((w) => w == query)) return 1;
  if (words.any((w) => w.startsWith(query))) return 2;
  if (query.length >= 4 && name.contains(query)) return 5;
  return 999;
}

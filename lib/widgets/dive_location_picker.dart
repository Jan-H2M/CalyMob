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

import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_colors.dart';
import '../config/firebase_config.dart';
import '../providers/auth_provider.dart';
import '../utils/country_codes.dart';
import 'country_picker_field.dart';

class DiveLocationSelection {
  final String? id;
  final String name;
  final String? country;
  final bool isSea;
  final String? zone;
  final double? latitude;
  final double? longitude;

  const DiveLocationSelection({
    this.id,
    required this.name,
    this.country,
    this.isSea = false,
    this.zone,
    this.latitude,
    this.longitude,
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
                          if (value!.isSea)
                            Text(
                              'mer',
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
  List<_LocationRow> _referenceResults = const [];
  bool _loading = true;
  bool _referenceLoading = false;
  String _error = '';
  String _referenceError = '';
  Timer? _referenceDebounce;
  int _referenceRequestId = 0;
  final TextEditingController _manualName = TextEditingController();
  final TextEditingController _manualLatitude = TextEditingController();
  final TextEditingController _manualLongitude = TextEditingController();
  bool _manualMode = false;
  String? _manualCountry;
  String? _manualWaterType;
  String _manualError = '';

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
                zone: existing.zone ?? row.zone,
                waterType: existing.waterType ?? row.waterType,
              );
      }

      for (final d in centralSnap.docs) {
        final data = d.data();
        if (data['merged_into_location_id'] != null) continue;
        final waterType = (data['water_type'] as String?)?.toLowerCase();
        addRow(_LocationRow(
          id: d.id,
          name: (data['name'] as String?)?.trim() ?? '—',
          country: normalizeCountryCode(data['country'] as String?),
          isSea: waterType == 'sea' || waterType == 'mer',
          zone: ((data['zone'] ?? data['region']) as String?)?.trim(),
          waterType: waterType,
        ));
      }
      for (final d in carnetSnap?.docs ?? const []) {
        final data = d.data();
        final name =
            ((data['location_name'] ?? data['lieu']) as String? ?? '').trim();
        final counters = data['counters'];
        addRow(_LocationRow(
          name: name,
          country: normalizeCountryCode(data['country'] as String?),
          isSea: counters is Map && counters['mer'] == true,
          waterType: counters is Map && counters['mer'] == true ? 'sea' : null,
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
    _referenceDebounce?.cancel();
    _query.dispose();
    _manualName.dispose();
    _manualLatitude.dispose();
    _manualLongitude.dispose();
    super.dispose();
  }

  void _openManualEntry() {
    _referenceDebounce?.cancel();
    setState(() {
      _manualMode = true;
      _manualName.text = _query.text.trim();
      _manualError = '';
    });
  }

  void _closeManualEntry() {
    setState(() {
      _manualMode = false;
      _manualError = '';
    });
  }

  void _submitManualEntry() {
    final name = _manualName.text.trim();
    final latitude = double.tryParse(_manualLatitude.text.replaceAll(',', '.'));
    final longitude =
        double.tryParse(_manualLongitude.text.replaceAll(',', '.'));
    if (name.isEmpty || _manualCountry == null || _manualWaterType == null) {
      setState(() {
        _manualError = 'Complète le nom, le pays et le type d’eau.';
      });
      return;
    }
    if ((latitude == null) != (longitude == null) ||
        (latitude != null && (latitude < -90 || latitude > 90)) ||
        (longitude != null && (longitude < -180 || longitude > 180))) {
      setState(() {
        _manualError =
            'Saisis les deux coordonnées GPS valides ou laisse-les vides.';
      });
      return;
    }
    Navigator.pop(
      context,
      DiveLocationSelection(
        name: name,
        country: _manualCountry,
        isSea: _manualWaterType == 'sea',
        latitude: latitude,
        longitude: longitude,
      ),
    );
  }

  void _onQueryChanged(String value) {
    _referenceDebounce?.cancel();
    final query = _normalizeLocationSearch(value);
    final requestId = ++_referenceRequestId;
    if (query.length < 3) {
      setState(() {
        _referenceResults = const [];
        _referenceLoading = false;
        _referenceError = '';
      });
      return;
    }
    setState(() {
      _referenceLoading = true;
      _referenceError = '';
    });
    _referenceDebounce = Timer(const Duration(milliseconds: 350), () {
      _loadReferenceResults(value.trim(), requestId);
    });
  }

  Future<void> _loadReferenceResults(String query, int requestId) async {
    try {
      final callable = FirebaseFunctions.instanceFor(region: 'europe-west1')
          .httpsCallable('listReferenceDiveSites');
      final response = await callable.call(<String, dynamic>{
        'clubId': FirebaseConfig.defaultClubId,
        'query': query,
        'limit': 100,
      });
      final data = Map<String, dynamic>.from(response.data as Map);
      final items = (data['items'] as List? ?? const [])
          .whereType<Map>()
          .map((raw) => Map<String, dynamic>.from(raw))
          .map((item) {
            final waterType = (item['waterType'] as String?)?.toLowerCase();
            return _LocationRow(
              name: (item['displayName'] as String? ?? '').trim(),
              country:
                  _countryCodeFromReference(item['countryIso3'] as String?),
              isSea: waterType == 'sea' || waterType == 'mer',
              waterType: waterType,
              latitude: (item['latitude'] as num?)?.toDouble(),
              longitude: (item['longitude'] as num?)?.toDouble(),
              source: _LocationSource.reference,
            );
          })
          .where((row) => row.name.isNotEmpty)
          .toList();
      if (!mounted || requestId != _referenceRequestId) return;
      setState(() {
        _referenceResults = items;
        _referenceLoading = false;
        _referenceError = '';
      });
    } on FirebaseFunctionsException {
      if (!mounted || requestId != _referenceRequestId) return;
      setState(() {
        _referenceResults = const [];
        _referenceLoading = false;
        _referenceError = 'La recherche de référence est indisponible.';
      });
    } catch (_) {
      if (!mounted || requestId != _referenceRequestId) return;
      setState(() {
        _referenceResults = const [];
        _referenceLoading = false;
        _referenceError = 'La recherche de référence est indisponible.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final q = _normalizeLocationSearch(_query.text);
    final filtered = _combinedLocations(q);

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
                    if (_manualMode)
                      IconButton(
                        tooltip: 'Retour à la recherche',
                        visualDensity: VisualDensity.compact,
                        onPressed: _closeManualEntry,
                        icon: const Icon(Icons.arrow_back),
                      )
                    else
                      const Icon(Icons.location_on,
                          color: AppColors.middenblauw),
                    const SizedBox(width: 8),
                    Text(
                      _manualMode ? 'Saisir un lieu' : 'Choisir un lieu',
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const Spacer(),
                    if (!_manualMode)
                      TextButton.icon(
                        onPressed: _openManualEntry,
                        icon: const Icon(Icons.edit_location_alt_outlined,
                            size: 18),
                        label: const Text('Saisie manuelle'),
                      ),
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close, color: Colors.black54),
                    ),
                  ],
                ),
              ),
              if (_manualMode)
                Expanded(child: _manualEntryForm())
              else ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                  child: TextField(
                    controller: _query,
                    autofocus: true,
                    onChanged: _onQueryChanged,
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
                if (q.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                    child: Row(
                      children: [
                        Text(
                          '${filtered.length} lieu${filtered.length == 1 ? '' : 'x'} trouvé${filtered.length == 1 ? '' : 's'}',
                          style: TextStyle(
                            color: Colors.grey.shade600,
                            fontSize: 12,
                          ),
                        ),
                        if (_referenceLoading) ...[
                          const SizedBox(width: 8),
                          const SizedBox(
                            width: 12,
                            height: 12,
                            child: CircularProgressIndicator(strokeWidth: 1.5),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Recherche étendue…',
                            style: TextStyle(
                              color: Colors.grey.shade600,
                              fontSize: 12,
                            ),
                          ),
                        ] else if (_referenceError.isNotEmpty) ...[
                          const SizedBox(width: 8),
                          Flexible(
                            child: Text(
                              _referenceError,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: Colors.orange.shade800,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ],
                      ],
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

  List<_LocationRow> _combinedLocations(String q) {
    final central = _filteredLocations(q);
    if (q.length < 3 || _referenceResults.isEmpty) return central;

    final byName = <String, _LocationRow>{};
    for (final row in central) {
      byName[_normalizeLocationSearch(row.name)] = row;
    }
    for (final row in _referenceResults) {
      byName.putIfAbsent(_normalizeLocationSearch(row.name), () => row);
    }
    final rows = byName.values.toList();
    rows.sort((left, right) {
      final scoreComparison = _locationSearchScore(q, left)
          .compareTo(_locationSearchScore(q, right));
      if (scoreComparison != 0) return scoreComparison;
      return left.name.toLowerCase().compareTo(right.name.toLowerCase());
    });
    return rows;
  }

  Widget _resultsList(List<_LocationRow> rows, String q) {
    final children = <Widget>[];
    for (final r in rows) {
      children.add(_tile(
        title: r.name,
        subtitle: [
          if (r.country != null && r.country!.isNotEmpty)
            countryDisplayNameForContext(context, r.country, includeCode: true),
          if (r.isSea) 'mer',
        ].whereType<String>().join(' · '),
        leading: _locationIcon(r),
        trailing: Text(
          r.source == _LocationSource.reference ? 'Référence' : 'Catalogue',
          style: TextStyle(
            color: r.source == _LocationSource.reference
                ? Colors.grey.shade600
                : AppColors.middenblauw,
            fontSize: 12,
          ),
        ),
        onTap: () {
          Navigator.pop(
            context,
            DiveLocationSelection(
              id: r.id,
              name: r.name,
              country: r.country,
              isSea: r.isSea,
              zone: r.zone,
              latitude: r.latitude,
              longitude: r.longitude,
            ),
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
                : 'Aucun lieu ne correspond à « ${_query.text.trim()} ».\nUtilise la saisie manuelle ci-dessus.',
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

  Widget _manualEntryForm() {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _manualName,
            autofocus: true,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Nom du site *',
              prefixIcon: Icon(Icons.location_on_outlined),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          Container(
            decoration: BoxDecoration(
              border: Border.all(color: Colors.grey.shade400),
              borderRadius: BorderRadius.circular(4),
            ),
            child: CountryPickerField(
              value: _manualCountry,
              emptyLabel: 'Choisir un pays *',
              onChanged: (code) => setState(() {
                _manualCountry = normalizeCountryCode(code);
                _manualError = '';
              }),
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _manualWaterType,
            decoration: const InputDecoration(
              labelText: 'Type d’eau *',
              prefixIcon: Icon(Icons.waves_outlined),
              border: OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: 'sea', child: Text('Mer')),
              DropdownMenuItem(value: 'fresh', child: Text('Eau douce / lac')),
              DropdownMenuItem(value: 'pool', child: Text('Piscine')),
              DropdownMenuItem(
                  value: 'unknown', child: Text('Autre / inconnu')),
            ],
            onChanged: (value) => setState(() {
              _manualWaterType = value;
              _manualError = '';
            }),
          ),
          const SizedBox(height: 18),
          Text(
            'Coordonnées GPS (optionnel)',
            style: TextStyle(
              color: Colors.grey.shade700,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _manualLatitude,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                    labelText: 'Latitude',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _manualLongitude,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                    labelText: 'Longitude',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
            ],
          ),
          if (_manualError.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              _manualError,
              style: TextStyle(color: Colors.red.shade700),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _submitManualEntry,
            icon: const Icon(Icons.check),
            label: const Text('Utiliser ce lieu'),
          ),
        ],
      ),
    );
  }

  Widget _tile({
    required String title,
    required String subtitle,
    required Widget leading,
    required VoidCallback onTap,
    Widget? trailing,
  }) {
    return ListTile(
      leading: SizedBox(width: 28, height: 28, child: Center(child: leading)),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: subtitle.isEmpty ? null : Text(subtitle),
      trailing: trailing,
      onTap: onTap,
    );
  }

  Widget _locationIcon(_LocationRow row) {
    if (row.isSea) {
      return Icon(Icons.waves, color: Colors.cyan.shade700);
    }
    if (row.waterType == 'fresh' || row.waterType == 'lake') {
      return Icon(Icons.terrain, color: Colors.green.shade700);
    }
    return Icon(
      Icons.location_on_outlined,
      color: row.source == _LocationSource.reference
          ? Colors.deepPurple.shade400
          : AppColors.middenblauw,
    );
  }
}

enum _LocationSource { calypso, reference }

class _LocationRow {
  final String? id;
  final String name;
  final String? country;
  final bool isSea;
  final String? zone;
  final String? waterType;
  final double? latitude;
  final double? longitude;
  final _LocationSource source;

  const _LocationRow({
    this.id,
    required this.name,
    this.country,
    this.isSea = false,
    this.zone,
    this.waterType,
    this.latitude,
    this.longitude,
    this.source = _LocationSource.calypso,
  });
}

String? _countryCodeFromReference(String? iso3) {
  const codes = <String, String>{
    'BEL': 'BE',
    'DEU': 'DE',
    'EGY': 'EG',
    'ESP': 'ES',
    'FRA': 'FR',
    'GBR': 'GB',
    'GRC': 'GR',
    'HRV': 'HR',
    'ITA': 'IT',
    'MLT': 'MT',
    'NLD': 'NL',
    'PRT': 'PT',
    'TUR': 'TR',
    'USA': 'US',
  };
  final value = iso3?.trim().toUpperCase();
  if (value == null || value.isEmpty) return null;
  return codes[value] ?? normalizeCountryCode(value);
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
  final countryNames = ['fr', 'nl', 'en']
      .map((languageCode) => _normalizeLocationSearch(countryDisplayName(
            row.country,
            languageCode: languageCode,
          )))
      .where((name) => name.isNotEmpty)
      .toList();
  if (name == query || country == query || countryNames.contains(query)) {
    return 0;
  }
  final words = [
    ...name.split(' '),
    if (country.isNotEmpty) ...country.split(' '),
    for (final countryName in countryNames) ...countryName.split(' '),
  ].where((w) => w.isNotEmpty).toList();
  if (words.any((w) => w == query)) return 1;
  if (words.any((w) => w.startsWith(query))) return 2;
  if (query.length >= 4 && name.contains(query)) return 5;
  return 999;
}

/// Carnet de Formation — Logbook entry screen.
///
/// Two modes :
///   - `auto`   : opened from a `logbook_completion` formation_task — pre-fills
///                date, location, palanquée and counter defaults from the
///                operation context.
///   - `manual` : opened directly from the Mon Carnet FAB — blank form, the
///                student fills everything.
///
/// Phase C follow-up (2026-05-13):
///   - LIEU now uses DiveLocationPickerField (bottom sheet, searchable).
///   - BINÔMES uses BinomeTypeaheadField (search club members + add externe).
///   - New DATE & HEURES section: explicit date picker + heure d'immersion /
///     heure de sortie pickers. Duration is auto-derived from the two times
///     (overridable by the manual durée field).
///   - Bottom save button no longer uses the default scaffold surface — it
///     floats inside the gradient via a Stack so the OceanGradientBackground
///     stays visible.
///   - Removed the "Pas de Jour…" hint per Jan's feedback.

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/formation_task.dart';
import '../../models/student_logbook_entry.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/formation_task_service.dart';
import '../../services/student_logbook_service.dart';
import '../../widgets/binome_typeahead_field.dart';
import '../../widgets/combi_picker_field.dart';
import '../../widgets/dive_location_picker.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../../widgets/tank_picker_field.dart';

enum LogbookEntryMode { auto, manual, edit }

class LogbookEntryScreen extends StatefulWidget {
  final LogbookEntryMode mode;
  final FormationTask? task; // required when mode == auto
  final bool enableDictation;

  /// Entry id when mode == edit.
  final String? entryId;

  /// Raw Firestore map when mode == edit — used to prefill every field.
  final Map<String, dynamic>? initialData;

  const LogbookEntryScreen.auto({super.key, required this.task})
      : mode = LogbookEntryMode.auto,
        enableDictation = false,
        entryId = null,
        initialData = null;

  const LogbookEntryScreen.manual({
    super.key,
    this.enableDictation = true,
  })  : task = null,
        entryId = null,
        initialData = null,
        mode = LogbookEntryMode.manual;

  const LogbookEntryScreen.edit({
    super.key,
    required String this.entryId,
    required Map<String, dynamic> this.initialData,
    this.enableDictation = true,
  })  : task = null,
        mode = LogbookEntryMode.edit;

  @override
  State<LogbookEntryScreen> createState() => _LogbookEntryScreenState();
}

class LogbookEntrySaveResult {
  final String entryId;
  final DateTime date;
  final String locationName;
  final bool updated;

  const LogbookEntrySaveResult({
    required this.entryId,
    required this.date,
    required this.locationName,
    required this.updated,
  });
}

class _LogbookEntryScreenState extends State<LogbookEntryScreen> {
  final StudentLogbookService _service = StudentLogbookService();
  final FormationTaskService _taskService = FormationTaskService();

  DateTime _date = DateTime.now();
  TimeOfDay? _entryTime;
  TimeOfDay? _exitTime;
  DiveLocationSelection? _locationSelection;
  final TextEditingController _depth = TextEditingController();
  final TextEditingController _duration = TextEditingController();
  final TextEditingController _notes = TextEditingController();
  final TextEditingController _lestage = TextEditingController();
  final TextEditingController _dictation = TextEditingController();
  final stt.SpeechToText _speech = stt.SpeechToText();
  List<BinomeSelection> _binomes = const [];
  List<_DictationMember> _dictationMembers = const [];
  List<_DictationLocation> _dictationLocations = const [];
  LogbookCounters _counters = const LogbookCounters();
  CombiSelection? _combi;
  TankSelection? _tank;
  String _dictationListenBase = '';
  bool _submitting = false;
  bool _dictationOpen = true;
  bool _speechAvailable = false;
  bool _listening = false;
  bool _manualFormVisible = false;
  bool _saved = false;

  // Pool-edit editable fields. Pre-filled from the entry, written back on
  // save through the pool-specific update path. Theme and validator stay
  // read-only context (changing them would invalidate the existing
  // monitor_observation task fan-out).
  String? _poolLevel;
  int? _poolGroupNumber;

  /// True when the form is editing an existing pool entry (source=piscine).
  /// Pool entries strip equipment / binôme / counters / depth / duration /
  /// times — only the date, location and notes carry meaning. The date and
  /// location are source-locked by the Cloud Function that wrote them.
  bool get _isPoolEdit =>
      widget.mode == LogbookEntryMode.edit &&
      (widget.initialData?['source'] as String?) == 'piscine';

  bool get _isDictationPrefill =>
      widget.mode == LogbookEntryMode.manual &&
      widget.enableDictation &&
      !_manualFormVisible;

  /// Triple-binding anchor: tracks which two of (entry / exit / duration) the
  /// user touched most recently. The third one is derived from the other two.
  /// Keys: 'entry', 'exit', 'duration'.
  final List<String> _timingAnchor = <String>[];
  bool _suppressDurationListener = false;

  @override
  void initState() {
    super.initState();
    _duration.addListener(_onDurationChanged);
    _dictation.addListener(() => setState(() {}));
    _loadDictationCatalogs();
    if (widget.mode == LogbookEntryMode.auto && widget.task != null) {
      _prefillFromTask();
    } else if (widget.mode == LogbookEntryMode.edit &&
        widget.initialData != null) {
      _prefillFromMap(widget.initialData!);
    }
  }

  void _prefillFromMap(Map<String, dynamic> map) {
    final date = (map['date'] as Timestamp?)?.toDate();
    if (date != null) _date = date;

    final entryTs = map['entry_time'];
    final exitTs = map['exit_time'];
    if (entryTs is Timestamp) {
      final d = entryTs.toDate();
      _entryTime = TimeOfDay(hour: d.hour, minute: d.minute);
      _timingAnchor.add('entry');
    } else {
      final s = map['entry_time_str'] as String?;
      if (s != null && s.contains(':')) {
        final parts = s.split(':');
        _entryTime = TimeOfDay(
          hour: int.tryParse(parts[0]) ?? 0,
          minute: int.tryParse(parts[1]) ?? 0,
        );
        _timingAnchor.add('entry');
      }
    }
    if (exitTs is Timestamp) {
      final d = exitTs.toDate();
      _exitTime = TimeOfDay(hour: d.hour, minute: d.minute);
      _timingAnchor.add('exit');
    } else {
      final s = map['exit_time_str'] as String?;
      if (s != null && s.contains(':')) {
        final parts = s.split(':');
        _exitTime = TimeOfDay(
          hour: int.tryParse(parts[0]) ?? 0,
          minute: int.tryParse(parts[1]) ?? 0,
        );
        _timingAnchor.add('exit');
      }
    }

    // Limit anchor to 2 most recent (consistent with the runtime rule).
    while (_timingAnchor.length > 2) {
      _timingAnchor.removeAt(0);
    }

    _locationSelection = DiveLocationSelection(
      id: map['location_id'] as String?,
      name: (map['location_name'] as String?) ?? '',
      country: map['country'] as String?,
      isSea: (map['counters'] as Map?)?['mer'] == true,
    );

    // Pool group context — only meaningful when source == piscine.
    _poolLevel = map['group_level'] as String?;
    final gn = map['group_number'];
    _poolGroupNumber = gn is num ? gn.toInt() : null;

    final depth = (map['depth_max_meters'] as num?)?.toDouble();
    if (depth != null) _depth.text = _fmtNum(depth);
    final duration = (map['duration_minutes'] as num?)?.toInt();
    if (duration != null && duration > 0) {
      _setDurationSilent(duration.toString());
      // If we already have 2 anchors set, keep them. Otherwise treat
      // duration as an anchor too so the triple-binding makes sense.
      if (!_timingAnchor.contains('duration') && _timingAnchor.length < 2) {
        _timingAnchor.add('duration');
      }
    }

    final counters = (map['counters'] as Map?)?.cast<String, dynamic>() ?? {};
    _counters = LogbookCounters(
      exo: counters['exo'] == true ? true : null,
      nitrox: counters['nitrox'] == true ? true : null,
      deco: counters['deco'] == true ? true : null,
      dp: counters['dp'] == true ? true : null,
      sf: counters['sf'] == true ? true : null,
      nuit: counters['nuit'] == true ? true : null,
      mer: counters['mer'] == true ? true : null,
    );

    final combiMap = map['combi'];
    if (combiMap is Map) {
      _combi = CombiSelection(
        sourceCombiId: combiMap['source_combi_id'] as String?,
        type: (combiMap['type'] as String?) ?? 'humide',
        thicknessMm: (combiMap['thickness_mm'] as num?)?.toInt(),
        brand: combiMap['brand'] as String?,
        label: combiMap['label'] as String?,
      );
    } else {
      // Legacy field — only the type was stored
      final legacyType = map['combi_type'] as String?;
      if (legacyType == 'humide' || legacyType == 'etanche') {
        _combi = CombiSelection(type: legacyType!);
      }
    }
    final tankMap = map['tank'];
    if (tankMap is Map) {
      _tank = TankSelection(
        sourceTankId: tankMap['source_tank_id'] as String?,
        volumeL: (tankMap['volume_l'] as num?)?.toDouble() ?? 0,
        pressureBar: (tankMap['pressure_bar'] as num?)?.toDouble() ?? 0,
        label: tankMap['label'] as String?,
      );
    }
    final lestage = (map['lestage_kg'] as num?)?.toDouble();
    if (lestage != null && lestage > 0) _lestage.text = _fmtNum(lestage);

    _binomes = _parseBinomesFromMap(map);
    _notes.text = (map['notes'] as String?) ?? '';
  }

  Future<void> _loadDictationCatalogs() async {
    try {
      const clubId = FirebaseConfig.defaultClubId;
      final db = FirebaseFirestore.instance;
      final snaps = await Future.wait([
        db.collection('clubs').doc(clubId).collection('members').get(),
        db
            .collection('clubs')
            .doc(clubId)
            .collection('dive_locations')
            .limit(500)
            .get(),
      ]);
      final memberSnap = snaps[0];
      final locationSnap = snaps[1];
      final members = memberSnap.docs
          .map((doc) {
            final data = doc.data();
            final prenom =
                ((data['prenom'] ?? data['firstName']) as String? ?? '').trim();
            final nom =
                ((data['nom'] ?? data['lastName']) as String? ?? '').trim();
            final display = ('$prenom $nom').trim().isNotEmpty
                ? '$prenom $nom'.trim()
                : doc.id;
            return _DictationMember(
              id: doc.id,
              prenom: prenom,
              nom: nom,
              displayName: display,
              level: ((data['plongeur_niveau'] ??
                          data['niveau_plongee'] ??
                          data['plongeur_code']) as String? ??
                      '')
                  .trim(),
            );
          })
          .where((m) => m.displayName.trim().isNotEmpty)
          .toList();
      final locations = locationSnap.docs
          .map((doc) {
            final data = doc.data();
            final name =
                ((data['name'] ?? data['nom']) as String? ?? '').trim();
            final waterType =
                ((data['water_type'] ?? data['type']) as String? ?? '')
                    .toLowerCase()
                    .trim();
            return _DictationLocation(
              id: doc.id,
              name: name,
              country: data['country'] as String?,
              isSea: waterType == 'sea' || waterType == 'mer',
            );
          })
          .where((l) => l.name.trim().isNotEmpty)
          .toList();
      if (!mounted) return;
      setState(() {
        _dictationMembers = members;
        _dictationLocations = locations;
      });
    } catch (e) {
      debugPrint('[LogbookEntry] dictation catalog load failed: $e');
    }
  }

  String _fmtNum(double n) {
    final asInt = n.toInt();
    if (asInt.toDouble() == n) return asInt.toString();
    return n.toStringAsFixed(1);
  }

  List<BinomeSelection> _parseBinomesFromMap(Map<String, dynamic> map) {
    final raw = map['binomes'];
    if (raw is List) {
      final out = <BinomeSelection>[];
      for (final b in raw) {
        if (b is! Map) continue;
        final type = (b['type'] as String?) ?? 'member';
        if (type == 'member') {
          final id = (b['member_id'] ?? b['memberId']) as String?;
          final name = (b['display_name'] ?? b['displayName']) as String?;
          if (id != null && name != null) {
            out.add(BinomeSelection.member(memberId: id, displayName: name));
          }
        } else {
          out.add(BinomeSelection.external(
            displayName: (b['display_name'] ?? b['displayName']) as String?,
            niveau: b['niveau'] as String?,
            club: b['club'] as String?,
          ));
        }
      }
      return out;
    }
    // Legacy `buddies` fallback
    final buddies = map['buddies'] as List? ?? const [];
    final out = <BinomeSelection>[];
    for (final b in buddies) {
      if (b is Map) {
        final memberId = b['member_id'] as String?;
        final name = (b['name'] as String?) ?? '';
        if (memberId != null && name.isNotEmpty) {
          out.add(
              BinomeSelection.member(memberId: memberId, displayName: name));
        } else if (name.isNotEmpty) {
          out.add(BinomeSelection.external(displayName: name));
        }
      } else if (b is String && b.isNotEmpty) {
        out.add(BinomeSelection.external(displayName: b));
      }
    }
    return out;
  }

  // ---- Triple-binding (entry / exit / duration) ---------------------------
  //
  // The user can fill any two of the three fields and the third is derived
  // automatically. We keep a max-length-2 anchor list: the most recently
  // touched fields are the "anchors", and the third field is recomputed
  // every time an anchor moves.

  void _touchTiming(String key) {
    _timingAnchor.remove(key);
    _timingAnchor.add(key);
    if (_timingAnchor.length > 2) _timingAnchor.removeAt(0);
    _resolveTimingTriple();
  }

  int? _parseDuration() {
    final v = int.tryParse(_duration.text.trim());
    if (v == null || v <= 0) return null;
    return v;
  }

  int _timeToMinutes(TimeOfDay t) => t.hour * 60 + t.minute;
  TimeOfDay _minutesToTime(int m) {
    var x = m % (24 * 60);
    if (x < 0) x += 24 * 60;
    return TimeOfDay(hour: x ~/ 60, minute: x % 60);
  }

  void _resolveTimingTriple() {
    if (_timingAnchor.length < 2) return;
    final hasEntry = _timingAnchor.contains('entry') && _entryTime != null;
    final hasExit = _timingAnchor.contains('exit') && _exitTime != null;
    final hasDuration =
        _timingAnchor.contains('duration') && _parseDuration() != null;

    // Derive duration from entry + exit
    if (hasEntry && hasExit && !_timingAnchor.contains('duration')) {
      final entryMin = _timeToMinutes(_entryTime!);
      var exitMin = _timeToMinutes(_exitTime!);
      if (exitMin < entryMin) exitMin += 24 * 60;
      final minutes = exitMin - entryMin;
      _setDurationSilent(minutes > 0 ? minutes.toString() : '');
      return;
    }
    // Derive exit from entry + duration
    if (hasEntry && hasDuration && !_timingAnchor.contains('exit')) {
      final entryMin = _timeToMinutes(_entryTime!);
      final exitMin = entryMin + _parseDuration()!;
      setState(() => _exitTime = _minutesToTime(exitMin));
      return;
    }
    // Derive entry from exit + duration
    if (hasExit && hasDuration && !_timingAnchor.contains('entry')) {
      final exitMin = _timeToMinutes(_exitTime!);
      final entryMin = exitMin - _parseDuration()!;
      setState(() => _entryTime = _minutesToTime(entryMin));
      return;
    }
  }

  void _onDurationChanged() {
    if (_suppressDurationListener) return;
    _touchTiming('duration');
  }

  void _setDurationSilent(String value) {
    _suppressDurationListener = true;
    _duration.text = value;
    _duration.selection = TextSelection.fromPosition(
      TextPosition(offset: _duration.text.length),
    );
    _suppressDurationListener = false;
  }

  Future<void> _prefillFromTask() async {
    final ctx = widget.task!.context;
    final userId = context.read<AuthProvider>().currentUser?.uid;
    if (ctx.operationTitle != null) {
      setState(() {
        _locationSelection = DiveLocationSelection(
          id: ctx.locationId,
          name: ctx.operationTitle!,
        );
      });
    }

    const clubId = FirebaseConfig.defaultClubId;
    if (ctx.operationId != null) {
      try {
        final op = await FirebaseFirestore.instance
            .collection('clubs')
            .doc(clubId)
            .collection('operations')
            .doc(ctx.operationId!)
            .get();
        if (op.exists) {
          final data = op.data()!;
          final dateField = data['date_debut'] ?? data['date'];
          if (dateField is Timestamp) {
            setState(() => _date = dateField.toDate());
          }
          final title =
              (data['titre'] as String?) ?? (data['title'] as String?);
          if (title != null) {
            setState(() {
              _locationSelection = DiveLocationSelection(
                id: _locationSelection?.id ?? ctx.locationId,
                name: title,
                country: _locationSelection?.country,
                isSea: _locationSelection?.isSea ?? false,
              );
            });
          }
        }
      } catch (_) {/* graceful */}
    }

    if (ctx.locationId != null) {
      try {
        final loc = await FirebaseFirestore.instance
            .collection('clubs')
            .doc(clubId)
            .collection('dive_locations')
            .doc(ctx.locationId!)
            .get();
        if (loc.exists) {
          final data = loc.data() ?? {};
          final waterType = (data['water_type'] as String?)?.toLowerCase();
          final isSea = waterType == 'sea' || waterType == 'mer';
          setState(() {
            _locationSelection = DiveLocationSelection(
              id: ctx.locationId,
              name: _locationSelection?.name ?? (data['name'] as String? ?? ''),
              country: (data['country'] as String?),
              isSea: isSea,
            );
            if (isSea) _counters = _counters.copyWith(mer: true);
          });
        }
      } catch (_) {/* graceful */}
    }

    if (ctx.palanqueeId != null) {
      try {
        final pal = await FirebaseFirestore.instance
            .collection('clubs')
            .doc(clubId)
            .collection('palanquees')
            .doc(ctx.palanqueeId!)
            .get();
        if (pal.exists) {
          final plannedRole =
              pal.data()?['planned_role'] as Map<String, dynamic>?;
          if (plannedRole != null && userId != null) {
            final myRole = plannedRole[userId] as String?;
            if (myRole == 'dp') {
              setState(() => _counters = _counters.copyWith(dp: true));
            }
            if (myRole == 'sf') {
              setState(() => _counters = _counters.copyWith(sf: true));
            }
          }
        }
      } catch (_) {/* graceful */}
    }
  }

  @override
  void dispose() {
    _depth.dispose();
    _duration.dispose();
    _notes.dispose();
    _lestage.dispose();
    _speech.stop();
    _dictation.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final userId = context.read<AuthProvider>().currentUser?.uid;
    return PopScope(
      canPop: !_hasUnsavedChanges,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        _confirmDiscardAndPop();
      },
      child: Scaffold(
        extendBody: true,
        body: OceanGradientBackground(
          creatures: CreatureSet.jellyfishAndBubbles,
          child: SafeArea(
            bottom: false,
            child: Stack(
              children: [
                ListView(
                  padding: EdgeInsets.fromLTRB(
                    16,
                    0,
                    16,
                    _isDictationPrefill ? 24 : 140,
                  ),
                  children: _isPoolEdit
                      ? _poolEditChildren()
                      : _diveEditChildren(userId),
                ),
                if (!_isDictationPrefill)
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: _bottomBar(),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _diveEditChildren(String? userId) {
    if (_isDictationPrefill) {
      return [
        _header(),
        _dictationProfileCard(),
      ];
    }

    return [
      _header(),
      if (widget.mode == LogbookEntryMode.auto) _autoBanner(),
      if (widget.mode == LogbookEntryMode.edit && widget.enableDictation) ...[
        _dictationProfileCard(),
        const SizedBox(height: 12),
      ],
      const SizedBox(height: 12),
      _sectionTitle('DATE & HEURES'),
      _dateTimeCard(),
      const SizedBox(height: 12),
      _sectionTitle('LIEU'),
      _whiteCard(
        padding: EdgeInsets.zero,
        child: DiveLocationPickerField(
          value: _locationSelection,
          readOnly: widget.mode == LogbookEntryMode.auto,
          onSelected: (selection) => setState(() {
            _locationSelection = selection;
            if (selection.isSea) {
              _counters = _counters.copyWith(mer: true);
            }
          }),
        ),
      ),
      const SizedBox(height: 12),
      _sectionTitle('PROFONDEUR · DURÉE'),
      Row(
        children: [
          Expanded(
            child: _whiteCard(
              child: TextField(
                controller: _depth,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  hintText: 'Profondeur (m)',
                  hintStyle: TextStyle(
                    color: Colors.grey.shade400,
                    fontStyle: FontStyle.italic,
                  ),
                  border: InputBorder.none,
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _whiteCard(
              child: TextField(
                controller: _duration,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  hintText: 'Durée (min)',
                  hintStyle: TextStyle(
                    color: Colors.grey.shade400,
                    fontStyle: FontStyle.italic,
                  ),
                  border: InputBorder.none,
                ),
              ),
            ),
          ),
        ],
      ),
      const SizedBox(height: 12),
      _sectionTitle('COMPTEUR — TAPE TOUT CE QUI COMPTE'),
      _whiteCard(child: _counterChips()),
      const SizedBox(height: 12),
      _sectionTitle('ÉQUIPEMENT'),
      _whiteCard(child: _equipmentSection(userId)),
      const SizedBox(height: 12),
      _sectionTitle('BINÔMES'),
      _whiteCard(
        child: BinomeTypeaheadField(
          binomes: _binomes,
          currentUserId: userId,
          onChanged: (next) => setState(() => _binomes = next),
        ),
      ),
      const SizedBox(height: 12),
      _sectionTitle('NOTES (optionnel)'),
      _whiteCard(
        child: TextField(
          controller: _notes,
          maxLines: 3,
          decoration: InputDecoration(
            hintText: 'Belle visibilité, fond à 22 m…',
            hintStyle: TextStyle(
              color: Colors.grey.shade400,
              fontStyle: FontStyle.italic,
            ),
            border: InputBorder.none,
          ),
        ),
      ),
    ];
  }

  /// Pool edit form — date / location are source-locked context, group is
  /// editable (to correct a check-in mistake), theme and monitor stay
  /// read-only context, notes are free-text.
  List<Widget> _poolEditChildren() {
    final data = widget.initialData ?? const {};
    final locationName = (data['location_name'] as String?) ??
        (data['lieu'] as String?) ??
        'Watermael-Boitsfort';
    final themeSnapshot = (data['theme_snapshot'] as String?)?.trim();

    return [
      _header(),
      const SizedBox(height: 12),
      _sectionTitle('DATE'),
      _whiteCard(
        child: Row(
          children: [
            const Icon(Icons.calendar_today_outlined,
                color: AppColors.middenblauw, size: 18),
            const SizedBox(width: 10),
            Text(
              _formatDate(_date),
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      _sectionTitle('LIEU'),
      _whiteCard(
        child: Row(
          children: [
            const Icon(Icons.place_outlined,
                color: AppColors.middenblauw, size: 18),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                locationName,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      _sectionTitle('GROUPE'),
      _whiteCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  flex: 5,
                  child: _PoolLevelDropdown(
                    value: _poolLevel,
                    onChanged: (v) => setState(() => _poolLevel = v),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 4,
                  child: _PoolGroupNumberStepper(
                    value: _poolGroupNumber,
                    onChanged: (v) => setState(() => _poolGroupNumber = v),
                  ),
                ),
              ],
            ),
            if (themeSnapshot != null && themeSnapshot.isNotEmpty) ...[
              const SizedBox(height: 10),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey.shade300),
                ),
                child: Row(
                  children: [
                    Icon(Icons.bookmark_outline,
                        size: 16, color: Colors.grey.shade700),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        themeSnapshot,
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.grey.shade800,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ),
                    Text(
                      'thème',
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.grey.shade500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
      // Read-only context — straight from the pool session at close-time.
      // Not editable here because changing these on the entry would not
      // re-route the monitor_observation task that already fanned out.
      ..._poolPeopleSections(data),
      const SizedBox(height: 12),
      _sectionTitle('NOTES'),
      _whiteCard(
        child: TextField(
          controller: _notes,
          maxLines: 4,
          decoration: InputDecoration(
            hintText: 'Tes impressions, ce que tu as appris…',
            hintStyle: TextStyle(
              color: Colors.grey.shade400,
              fontStyle: FontStyle.italic,
            ),
            border: InputBorder.none,
          ),
        ),
      ),
    ];
  }

  /// Read-only "MONITEUR" + "CO-ÉQUIPIERS" sections for the pool edit form.
  /// Both are sourced from the snapshot the Cloud Function wrote at session
  /// close — names are resolved lazily for member IDs when no snapshot
  /// displayName is available.
  List<Widget> _poolPeopleSections(Map<String, dynamic> data) {
    final validatorId = data['validator_id'] as String?;
    final moniteurIds =
        (data['moniteur_ids'] as List?)?.cast<String>() ?? const [];
    final monitorIds = <String>{
      if (validatorId != null && validatorId.isNotEmpty) validatorId,
      ...moniteurIds,
    }.toList();

    final rawMembers = data['pool_group_members'] as List? ?? const [];
    final members = <Map<String, dynamic>>[];
    for (final m in rawMembers) {
      if (m is Map) members.add(Map<String, dynamic>.from(m));
    }

    final widgets = <Widget>[];
    if (monitorIds.isNotEmpty) {
      widgets.add(const SizedBox(height: 12));
      widgets.add(_sectionTitle('MONITEUR'));
      widgets.add(_whiteCard(
        child: _PoolMemberNameList(memberIds: monitorIds),
      ));
    }
    if (members.isNotEmpty) {
      widgets.add(const SizedBox(height: 12));
      widgets.add(_sectionTitle('CO-ÉQUIPIERS'));
      widgets.add(_whiteCard(
        child: Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final m in members)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.grey.shade300),
                ),
                child: Text(
                  (m['displayName'] as String?) ??
                      (m['name'] as String?) ??
                      (m['member_id'] as String?) ??
                      '?',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
          ],
        ),
      ));
    }
    return widgets;
  }

  Widget _header() {
    final isEdit = widget.mode == LogbookEntryMode.edit;
    final isAuto = widget.mode == LogbookEntryMode.auto;
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 12, 0, 12),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white, size: 26),
            onPressed: _confirmDiscardAndPop,
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _isPoolEdit
                      ? 'Modifier la séance piscine'
                      : isEdit
                          ? 'Modifier la plongée'
                          : isAuto
                              ? 'Carnet — sortie Calypso'
                              : 'Nouvelle plongée',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  _isPoolEdit
                      ? 'tes notes uniquement'
                      : isEdit
                          ? 'corrige ou complète'
                          : isAuto
                              ? 'pré-rempli — complète et enregistre'
                              : 'manuelle · ailleurs',
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
          if (isEdit)
            IconButton(
              icon: const Icon(Icons.delete_outline, color: Colors.white),
              tooltip: 'Supprimer',
              onPressed: _submitting ? null : _delete,
            ),
        ],
      ),
    );
  }

  Widget _autoBanner() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'SOURCE : SORTIE CALYPSO',
            style: TextStyle(
              color: AppColors.middenblauw,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.1,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            _locationSelection?.name.isNotEmpty == true
                ? _locationSelection!.name
                : '—',
            style: const TextStyle(
              color: AppColors.donkerblauw,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          Text(
            _formatDate(_date),
            style: TextStyle(
              color: AppColors.donkerblauw.withValues(alpha: 0.7),
              fontSize: 12.5,
            ),
          ),
        ],
      ),
    );
  }

  Widget _dictationProfileCard() {
    final parsed = _parseDictatedDive(_dictation.text);
    final rows = _dictationProfileRows(parsed);

    return _whiteCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.mic_none,
                  color: AppColors.middenblauw, size: 20),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'SAISIE PAR DICTÉE',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1,
                    color: AppColors.donkerblauw,
                  ),
                ),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                tooltip: _dictationOpen ? 'Replier' : 'Déplier',
                onPressed: () =>
                    setState(() => _dictationOpen = !_dictationOpen),
                icon: Icon(
                  _dictationOpen ? Icons.expand_less : Icons.expand_more,
                  color: AppColors.middenblauw,
                ),
              ),
            ],
          ),
          if (_dictationOpen) ...[
            const SizedBox(height: 8),
            _dictationActions(),
            const SizedBox(height: 10),
            _dictationProfileGrid(rows),
            const SizedBox(height: 10),
            TextField(
              controller: _dictation,
              minLines: 3,
              maxLines: 6,
              textInputAction: TextInputAction.newline,
              decoration: InputDecoration(
                hintText: 'Dicte champ par champ, par exemple:\n'
                    'Date: 10 octobre 2025. Lieu: Rochefontaine. '
                    'Immersion: 14 h 30. Profondeur: 31 mètres. Durée: 44 minutes. '
                    'Binôme: Jan de Nul. Bouteille: 12 litres. Lestage: 9 kilos. '
                    'Notes: gardons et un grand brochet.',
                hintStyle: TextStyle(
                  color: Colors.grey.shade400,
                  fontStyle: FontStyle.italic,
                ),
                filled: true,
                fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.middenblauw),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _dictationActions() {
    final hasText = _dictation.text.trim().isNotEmpty;

    ButtonStyle compactOutlinedStyle() {
      return OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
      );
    }

    Widget actionBox({
      required double width,
      required Widget child,
    }) {
      return SizedBox(width: width, height: 46, child: child);
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final narrow = constraints.maxWidth < 470;
        final smallWidth = narrow
            ? (constraints.maxWidth - 16) / 3
            : (constraints.maxWidth - 24) / 4;
        final mainWidth = narrow ? constraints.maxWidth : smallWidth * 1.5;

        final smallActions = <Widget>[
          actionBox(
            width: smallWidth,
            child: ElevatedButton.icon(
              onPressed: _toggleDictationRecording,
              icon: Icon(_listening ? Icons.stop : Icons.mic, size: 18),
              label: Text(
                _listening ? 'Arrêter' : 'Dicter',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                softWrap: false,
              ),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                backgroundColor:
                    _listening ? Colors.red : AppColors.donkerblauw,
                foregroundColor: Colors.white,
                textStyle:
                    const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
              ),
            ),
          ),
          actionBox(
            width: smallWidth,
            child: OutlinedButton.icon(
              onPressed: hasText ? () => setState(() {}) : null,
              icon: const Icon(Icons.manage_search, size: 18),
              label: const Text(
                'Analyser',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                softWrap: false,
              ),
              style: compactOutlinedStyle(),
            ),
          ),
          actionBox(
            width: smallWidth,
            child: OutlinedButton.icon(
              onPressed: hasText
                  ? () => setState(() {
                        _dictationListenBase = '';
                        _dictation.clear();
                      })
                  : null,
              icon: const Icon(Icons.clear, size: 18),
              label: const Text(
                'Tout effacer',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                softWrap: false,
              ),
              style: compactOutlinedStyle(),
            ),
          ),
        ];

        final fillButton = actionBox(
          width: mainWidth,
          child: ElevatedButton.icon(
            onPressed: hasText ? _applyDictation : null,
            icon: const Icon(Icons.auto_fix_high, size: 18),
            label: const Text(
              'Remplir les champs',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              softWrap: false,
            ),
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              backgroundColor: AppColors.middenblauw,
              foregroundColor: Colors.white,
              textStyle:
                  const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
            ),
          ),
        );

        if (narrow) {
          return Column(
            children: [
              Row(
                children: [
                  smallActions[0],
                  const SizedBox(width: 8),
                  smallActions[1],
                  const SizedBox(width: 8),
                  smallActions[2],
                ],
              ),
              const SizedBox(height: 8),
              fillButton,
            ],
          );
        }

        return Wrap(
          spacing: 8,
          runSpacing: 8,
          alignment: WrapAlignment.spaceBetween,
          children: [...smallActions, fillButton],
        );
      },
    );
  }

  List<_DictationField> _dictationProfileRows(_DictatedDiveDraft parsed) {
    final locationValue = _locationSelection?.name.trim().isNotEmpty == true
        ? _locationSelection!.name
        : parsed.locationSelection?.name ?? parsed.locationName;
    final buddyValue = _binomes.isNotEmpty
        ? _binomes.map((b) => b.chipLabel).join(', ')
        : parsed.binomes.map((b) => b.chipLabel).join(', ');
    final notesValue = parsed.fauna.isNotEmpty
        ? 'Faune: ${parsed.fauna.join(', ')}'
        : parsed.notesParts.isNotEmpty
            ? parsed.notesParts.join(' ')
            : _notes.text.trim();
    final dateValue = parsed.date == null ? null : _formatDate(parsed.date!);
    final entryTimeValue = _entryTime != null
        ? _formatTime(_entryTime!)
        : parsed.entryTime == null
            ? null
            : _formatTime(parsed.entryTime!);
    final derivedExitTime =
        parsed.entryTime != null && parsed.durationMinutes != null
            ? _minutesToTime(
                _timeToMinutes(parsed.entryTime!) + parsed.durationMinutes!,
              )
            : null;
    final exitTimeValue = _exitTime != null
        ? _formatTime(_exitTime!)
        : parsed.exitTime != null
            ? _formatTime(parsed.exitTime!)
            : derivedExitTime == null
                ? null
                : _formatTime(derivedExitTime);

    return [
      _DictationField(
        label: 'Date',
        required: true,
        value: dateValue,
        hint: 'Ex: 10 octobre 2025',
      ),
      _DictationField(
        label: 'Immersion',
        value: entryTimeValue,
        hint: 'Ex: 14:30',
      ),
      _DictationField(
        label: 'Sortie',
        value: exitTimeValue,
        hint: 'Ex: 15:14',
      ),
      _DictationField(
        label: 'Lieu',
        required: true,
        value: locationValue,
        hint: 'Ex: Lanzarote - Puerto del Carmen',
        wide: true,
      ),
      _DictationField(
        label: 'Profondeur',
        required: true,
        value: _depth.text.trim().isNotEmpty
            ? '${_depth.text.trim()} m'
            : parsed.depthMeters == null
                ? null
                : '${_fmtNum(parsed.depthMeters!)} m',
        hint: 'Ex: 25 m',
      ),
      _DictationField(
        label: 'Durée',
        required: true,
        value: _duration.text.trim().isNotEmpty
            ? '${_duration.text.trim()} min'
            : parsed.durationMinutes == null
                ? null
                : '${parsed.durationMinutes} min',
        hint: 'Ex: 47 min',
      ),
      _DictationField(
        label: 'Binôme',
        required: true,
        value: buddyValue.isEmpty ? null : buddyValue,
        hint: 'Ex: Sébastien ALONSO',
        wide: true,
      ),
      _DictationField(
        label: 'Bouteille',
        value: _tank?.summary ??
            (parsed.tankVolumeL == null
                ? null
                : '${_fmtNum(parsed.tankVolumeL!)} L'),
      ),
      _DictationField(
        label: 'Lestage',
        value: _lestage.text.trim().isNotEmpty
            ? '${_lestage.text.trim()} kg'
            : parsed.lestageKg == null
                ? null
                : '${_fmtNum(parsed.lestageKg!)} kg',
      ),
      _DictationField(
        label: 'Formation',
        value:
            _counters.exo == true || parsed.counters.exo == true ? 'Oui' : null,
      ),
      _DictationField(
        label: 'Nitrox',
        value: _counters.nitrox == true || parsed.counters.nitrox == true
            ? 'Oui'
            : null,
      ),
      _DictationField(
        label: 'Déco',
        value: _counters.deco == true || parsed.counters.deco == true
            ? 'Oui'
            : null,
      ),
      _DictationField(
        label: 'DP',
        value:
            _counters.dp == true || parsed.counters.dp == true ? 'Oui' : null,
      ),
      _DictationField(
        label: 'SF',
        value:
            _counters.sf == true || parsed.counters.sf == true ? 'Oui' : null,
      ),
      _DictationField(
        label: 'Nuit',
        value: _counters.nuit == true || parsed.counters.nuit == true
            ? 'Oui'
            : null,
      ),
      _DictationField(
        label: 'Mer',
        value:
            _counters.mer == true || parsed.counters.mer == true ? 'Oui' : null,
      ),
      _DictationField(
        label: 'Notes',
        value: notesValue.isEmpty ? null : notesValue,
        wide: true,
      ),
    ];
  }

  Widget _dictationProfileGrid(List<_DictationField> rows) {
    const gap = 6.0;
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth < 360 ? 2 : 3;
        final itemWidth =
            (constraints.maxWidth - (gap * (columns - 1))) / columns;

        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [
            for (final row in rows)
              SizedBox(
                width: row.wide ? constraints.maxWidth : itemWidth,
                child: _dictationProfileRow(row),
              ),
          ],
        );
      },
    );
  }

  Widget _dictationProfileRow(_DictationField field) {
    final done = field.value != null && field.value!.trim().isNotEmpty;
    final MaterialColor color = done
        ? Colors.green
        : field.required
            ? Colors.red
            : Colors.grey;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            done
                ? Icons.check_circle
                : field.required
                    ? Icons.error_outline
                    : Icons.radio_button_unchecked,
            size: 17,
            color: color.shade700,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  field.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w900,
                    color: color.shade800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  done ? field.value! : (field.hint ?? 'à compléter'),
                  maxLines: field.wide ? 3 : 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: done ? FontWeight.w700 : FontWeight.w500,
                    color: done ? color.shade900 : Colors.grey.shade600,
                    fontStyle: done ? FontStyle.normal : FontStyle.italic,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _toggleDictationRecording() async {
    if (_listening) {
      await _speech.stop();
      if (mounted) setState(() => _listening = false);
      return;
    }

    final available = _speechAvailable ||
        await _speech.initialize(
          onStatus: (status) {
            if (!mounted) return;
            if (status == 'done' || status == 'notListening') {
              setState(() => _listening = false);
            }
          },
          onError: (error) {
            if (!mounted) return;
            setState(() => _listening = false);
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Micro impossible: ${error.errorMsg}')),
            );
          },
        );

    if (!available) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Reconnaissance vocale non disponible.')),
      );
      return;
    }

    setState(() {
      _speechAvailable = true;
      _listening = true;
      _dictationOpen = true;
      _dictationListenBase = _dictation.text.trim();
    });

    await _speech.listen(
      localeId: 'fr_FR',
      listenOptions: stt.SpeechListenOptions(
        listenMode: stt.ListenMode.dictation,
        partialResults: true,
      ),
      onResult: (result) {
        if (!mounted) return;
        setState(() {
          final recognized = result.recognizedWords.trim();
          _dictation.text = [
            if (_dictationListenBase.isNotEmpty) _dictationListenBase,
            if (recognized.isNotEmpty) recognized,
          ].join(' ');
          _dictation.selection = TextSelection.fromPosition(
            TextPosition(offset: _dictation.text.length),
          );
        });
      },
    );
  }

  void _applyDictation() {
    final draft = _parseDictatedDive(_dictation.text);
    final timingTouches = <String>[];
    setState(() {
      if (draft.date != null) _date = draft.date!;
      if (draft.entryTime != null) {
        _entryTime = draft.entryTime;
        timingTouches.add('entry');
      }
      if (draft.exitTime != null) {
        _exitTime = draft.exitTime;
        timingTouches.add('exit');
      }
      final location = draft.locationSelection ??
          (draft.locationName == null || draft.locationName!.isEmpty
              ? null
              : DiveLocationSelection(
                  name: draft.locationName!,
                  isSea: _looksLikeSeaLocation(draft.locationName!),
                ));
      if (location != null) {
        _locationSelection = location;
        if (_locationSelection!.isSea) {
          _counters = _counters.copyWith(mer: true);
        }
      }
      if (draft.depthMeters != null) _depth.text = _fmtNum(draft.depthMeters!);
      if (draft.durationMinutes != null) {
        _setDurationSilent(draft.durationMinutes.toString());
        timingTouches.add('duration');
      }
      if (draft.tankVolumeL != null) {
        _tank = TankSelection(
          volumeL: draft.tankVolumeL!,
          pressureBar: 200,
          label: '${_fmtNum(draft.tankVolumeL!)} L',
        );
      }
      if (draft.lestageKg != null) _lestage.text = _fmtNum(draft.lestageKg!);
      _counters = _mergeCounters(_counters, draft.counters);
      if (draft.binomes.isNotEmpty) {
        final existing = _binomes
            .map((b) => _normalizeDictation(b.displayName ?? b.chipLabel))
            .toSet();
        final additions = <BinomeSelection>[];
        for (final binome in draft.binomes) {
          if (existing.add(
              _normalizeDictation(binome.displayName ?? binome.chipLabel))) {
            additions.add(binome);
          }
        }
        _binomes = [..._binomes, ...additions];
      }
      final notes = <String>[
        if (_notes.text.trim().isNotEmpty) _notes.text.trim(),
        if (draft.fauna.isNotEmpty)
          'Faune observée: ${draft.fauna.join(', ')}.',
        ...draft.notesParts,
      ];
      _notes.text = _dedupeSentences(notes).join('\n');
      if (_isDictationPrefill) {
        _manualFormVisible = true;
      } else {
        _dictationOpen = false;
      }
    });
    for (final key in timingTouches) {
      _touchTiming(key);
    }
  }

  Widget _dateTimeCard() {
    return _whiteCard(
      child: Column(
        children: [
          Row(
            children: [
              const Icon(Icons.calendar_today_outlined,
                  color: AppColors.middenblauw, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: InkWell(
                  onTap: _pickDate,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'DATE',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: Colors.grey.shade600,
                            letterSpacing: 1,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _formatDate(_date),
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: Colors.black87,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Icon(Icons.unfold_more, color: Colors.grey.shade400),
            ],
          ),
          const Divider(height: 16),
          Row(
            children: [
              Expanded(
                child: _timeChip(
                  label: "HEURE D'IMMERSION",
                  value: _entryTime,
                  onPick: (t) {
                    setState(() => _entryTime = t);
                    _touchTiming('entry');
                  },
                ),
              ),
              const SizedBox(width: 8),
              Container(
                width: 18,
                height: 1,
                color: Colors.grey.shade400,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _timeChip(
                  label: 'HEURE DE SORTIE',
                  value: _exitTime,
                  onPick: (t) {
                    setState(() => _exitTime = t);
                    _touchTiming('exit');
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _timeChip({
    required String label,
    required TimeOfDay? value,
    required ValueChanged<TimeOfDay> onPick,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: () async {
        final picked = await showTimePicker(
          context: context,
          initialTime: value ?? const TimeOfDay(hour: 14, minute: 0),
        );
        if (picked != null) onPick(picked);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: value != null
              ? AppColors.middenblauw.withValues(alpha: 0.10)
              : Colors.grey.shade50,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: value != null
                ? AppColors.middenblauw.withValues(alpha: 0.4)
                : Colors.grey.shade300,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 9.5,
                fontWeight: FontWeight.bold,
                letterSpacing: 0.8,
                color: Colors.grey.shade700,
              ),
            ),
            const SizedBox(height: 2),
            Row(
              children: [
                Icon(
                  Icons.access_time,
                  size: 16,
                  color: value != null
                      ? AppColors.middenblauw
                      : Colors.grey.shade400,
                ),
                const SizedBox(width: 4),
                Text(
                  value != null ? _formatTime(value) : '—:—',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: value != null
                        ? AppColors.donkerblauw
                        : Colors.grey.shade400,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Widget _counterChips() {
    // Tooltip text shows on hover (web) and on long-press (mobile).
    // Keeps the chip label short while making the jargon discoverable.
    const items = <Map<String, String>>[
      {
        'key': 'exo',
        'label': 'Form.',
        'tip':
            "Plongée d'exercice / formation (oefening LIFRAS, examen, opleiding).",
      },
      {
        'key': 'nitrox',
        'label': 'Nitrox',
        'tip': 'Mélange nitrox (≥ 22 % O₂) au lieu d\'air.',
      },
      {
        'key': 'deco',
        'label': 'Déco',
        'tip': 'Plongée avec paliers de décompression obligatoires.',
      },
      {
        'key': 'dp',
        'label': 'DP',
        'tip': 'Tu étais directeur de palanquée.',
      },
      {
        'key': 'sf',
        'label': 'SF',
        'tip': 'Tu étais serre-file de la palanquée.',
      },
      {
        'key': 'nuit',
        'label': 'Nuit',
        'tip': 'Plongée de nuit (immersion après le coucher du soleil).',
      },
      {
        'key': 'mer',
        'label': 'Mer',
        'tip': 'Plongée en mer / eau salée.',
      },
    ];
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: items.map((item) {
        final on = _counters.isOn(item['key']!);
        final chip = ChoiceChip(
          label: Text(item['label']!),
          selected: on,
          onSelected: (_) {
            setState(() => _counters = _counters.toggle(item['key']!));
          },
          labelStyle: TextStyle(
            color: on ? Colors.white : AppColors.donkerblauw,
            fontWeight: FontWeight.w700,
            fontSize: 12.5,
          ),
          selectedColor: AppColors.middenblauw,
          backgroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: BorderSide(
              color: on ? AppColors.middenblauw : const Color(0xFFE2E8F0),
            ),
          ),
        );
        return Tooltip(
          message: item['tip']!,
          waitDuration: const Duration(milliseconds: 250),
          child: chip,
        );
      }).toList(),
    );
  }

  Widget _equipmentSection(String? userId) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // CombiPickerField renders its own COMBINAISON title row + manage icon.
        if (userId == null)
          Text(
            'Connecte-toi pour gérer tes combinaisons.',
            style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600),
          )
        else
          CombiPickerField(
            userId: userId,
            value: _combi,
            onChanged: (next) => setState(() => _combi = next),
          ),
        const Divider(height: 18),
        // TankPickerField renders its own BOUTEILLE title row + manage icon.
        if (userId == null)
          Text(
            'Connecte-toi pour gérer tes bouteilles.',
            style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600),
          )
        else
          TankPickerField(
            userId: userId,
            value: _tank,
            onChanged: (next) => setState(() => _tank = next),
          ),
        const Divider(height: 18),
        // Lestage
        Text(
          'LESTAGE',
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.bold,
            color: Colors.grey.shade600,
            letterSpacing: 1,
          ),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            const Icon(Icons.fitness_center,
                size: 18, color: AppColors.middenblauw),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: _lestage,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(
                  hintText: 'ex: 6',
                  hintStyle: TextStyle(
                    color: Colors.grey.shade400,
                    fontStyle: FontStyle.italic,
                  ),
                  suffixText: 'kg',
                  border: InputBorder.none,
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(vertical: 4),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _sectionTitle(String s) => Padding(
        padding: const EdgeInsets.only(bottom: 6, left: 2),
        child: Text(
          s,
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.85),
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.2,
          ),
        ),
      );

  Widget _whiteCard({required Widget child, EdgeInsets? padding}) {
    return Container(
      padding:
          padding ?? const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(14),
      ),
      child: child,
    );
  }

  Widget _bottomBar() {
    return IgnorePointer(
      ignoring: false,
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              AppColors.donkerblauw.withValues(alpha: 0),
              AppColors.donkerblauw.withValues(alpha: 0.65),
            ],
          ),
        ),
        padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: ElevatedButton(
              onPressed: _submitting || !_canSubmit ? null : _save,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.middenblauw,
                foregroundColor: Colors.white,
                disabledBackgroundColor:
                    AppColors.middenblauw.withValues(alpha: 0.45),
                disabledForegroundColor: Colors.white70,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                minimumSize: const Size.fromHeight(50),
                elevation: 6,
                shadowColor: AppColors.donkerblauw.withValues(alpha: 0.6),
              ),
              child: _submitting
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2.4,
                      ),
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.save_alt, size: 20),
                        const SizedBox(width: 8),
                        Text(
                          widget.mode == LogbookEntryMode.edit
                              ? 'Enregistrer les modifications'
                              : widget.mode == LogbookEntryMode.auto
                                  ? 'Enregistrer dans mon carnet'
                                  : 'Ajouter au carnet',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }

  bool get _canSubmit {
    return (_locationSelection != null &&
        _locationSelection!.name.trim().isNotEmpty);
  }

  bool get _hasUnsavedChanges {
    if (_saved || _submitting) return false;
    if (widget.mode == LogbookEntryMode.auto) return true;
    if (widget.mode == LogbookEntryMode.edit) {
      return _notes.text.trim() !=
              ((widget.initialData?['notes'] as String?) ?? '').trim() ||
          _depth.text.trim().isNotEmpty ||
          _duration.text.trim().isNotEmpty ||
          _lestage.text.trim().isNotEmpty ||
          _entryTime != null ||
          _exitTime != null ||
          _locationSelection?.name.trim() !=
              ((widget.initialData?['location_name'] as String?) ?? '').trim();
    }
    return _manualFormVisible ||
        _dictation.text.trim().isNotEmpty ||
        _locationSelection?.name.trim().isNotEmpty == true ||
        _depth.text.trim().isNotEmpty ||
        _duration.text.trim().isNotEmpty ||
        _notes.text.trim().isNotEmpty ||
        _lestage.text.trim().isNotEmpty ||
        _entryTime != null ||
        _exitTime != null ||
        _binomes.isNotEmpty ||
        _combi != null ||
        _tank != null ||
        _counters.toMap().isNotEmpty;
  }

  Future<void> _confirmDiscardAndPop() async {
    if (!_hasUnsavedChanges) {
      Navigator.of(context).pop();
      return;
    }
    final discard = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Quitter sans enregistrer ?'),
        content: const Text(
          'Cette plongée contient des informations non enregistrées. '
          'Si tu reviens en arrière maintenant, elles seront perdues.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Continuer la saisie'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Quitter sans enregistrer'),
          ),
        ],
      ),
    );
    if (discard == true && mounted) {
      Navigator.of(context).pop();
    }
  }

  String _formatDate(DateTime d) {
    const months = [
      'jan',
      'fév',
      'mar',
      'avr',
      'mai',
      'juin',
      'juil',
      'août',
      'sept',
      'oct',
      'nov',
      'déc'
    ];
    return '${d.day} ${months[d.month - 1]} ${d.year}';
  }

  String _formatTime(TimeOfDay t) {
    final hh = t.hour.toString().padLeft(2, '0');
    final mm = t.minute.toString().padLeft(2, '0');
    return '$hh:$mm';
  }

  /// Compose a single DateTime by combining [_date] with a TimeOfDay.
  DateTime _composeDateTime(DateTime base, TimeOfDay t) {
    return DateTime(base.year, base.month, base.day, t.hour, t.minute);
  }

  _DictatedDiveDraft _parseDictatedDive(String raw) {
    final text = raw.trim();
    if (text.isEmpty) return const _DictatedDiveDraft();
    final normalized = _normalizeDictation(text);
    final parsedDate = _parseDictatedDate(normalized);
    final parsedEntryTime = _parseDictatedTime(normalized, [
      'immersion',
      'depart',
      'debut',
      'entree',
      'mise a l eau',
      'rentre dans l eau',
      'rentree dans l eau',
      'entre dans l eau',
      'entree dans l eau',
      'a',
      'om',
    ]);
    final parsedExitTime = _parseDictatedTime(normalized, [
      'sortie',
      'fin',
      'surface',
      'remontee',
    ]);

    double? numberAfter(List<String> labels) {
      for (final label in labels) {
        final rx = RegExp(
          '$label\\s*(?:max|maximum|de|d|a|:)?\\s*(\\d+(?:[\\.,]\\d+)?)',
          caseSensitive: false,
        );
        final match = rx.firstMatch(normalized);
        if (match != null) {
          return double.tryParse(match.group(1)!.replaceAll(',', '.'));
        }
      }
      return null;
    }

    final depth = numberAfter(['diepte', 'profondeur', 'depth']);
    final depthFromSpeech = depth ??
        _firstNumberForPatterns(normalized, [
          RegExp(
            r'(?:profondeur|profond|diepte|depth)[^\d]{0,16}(\d+(?:[\.,]\d+)?)\s*(?:m|meter|meters|metre|metres)?',
            caseSensitive: false,
          ),
          RegExp(
            r'(?:a|tot|jusqu a|maximum|max)\s+(\d+(?:[\.,]\d+)?)\s*(?:m|meter|meters|metre|metres)',
            caseSensitive: false,
          ),
          RegExp(
            r'(\d+(?:[\.,]\d+)?)\s*(?:m|meter|meters|metre|metres)\s*(?:diep|profond|profondeur)',
            caseSensitive: false,
          ),
        ]);
    final durationDouble = numberAfter(['duree', 'duration', 'duur']) ??
        _firstNumberForPatterns(normalized, [
          RegExp(
            r'(?:pendant|durant|total|temps)?\s*(\d+(?:[\.,]\d+)?)\s*(?:min|mins|minute|minutes)',
            caseSensitive: false,
          ),
        ]);
    final diveNumberDouble = numberAfter(['duik', 'plongee', 'dive']);

    double? tankVolume;
    final tankRx = RegExp(
      r'(?:fles|bouteille|tank)[^\d]{0,18}(\d+(?:[\.,]\d+)?)\s*(?:l|liter|litre|litres)',
      caseSensitive: false,
    );
    final tankMatch = tankRx.firstMatch(normalized);
    if (tankMatch != null) {
      tankVolume = double.tryParse(tankMatch.group(1)!.replaceAll(',', '.'));
    }

    double? lestage;
    final lestagePatterns = [
      RegExp(
          r'(?:gewicht|lood|lestage)[^\d]{0,18}(\d+(?:[\.,]\d+)?)\s*(?:kg|kilo)',
          caseSensitive: false),
      RegExp(r'(\d+(?:[\.,]\d+)?)\s*(?:kg|kilo)\s*(?:gewicht|lood|lestage)',
          caseSensitive: false),
      RegExp(
          r'(?:j avais|ik had|avec|met)[^\d]{0,18}(\d+(?:[\.,]\d+)?)\s*(?:kg|kilo|kilos)',
          caseSensitive: false),
    ];
    for (final rx in lestagePatterns) {
      final match = rx.firstMatch(normalized);
      if (match != null) {
        lestage = double.tryParse(match.group(1)!.replaceAll(',', '.'));
        break;
      }
    }

    final buddies = <String>[];
    final buddyRx = RegExp(
      r'(?:gedoken met|buddy(?:s)?|binomes?|binomes|binome c est|binome etait|binome was|avec\s+(?!\d)|met\s+(?!\d))\s+(.+?)(?=,?\s+(?:j avais|ik had|een|une|un)?\s*(?:bouteille|fles|tank|lestage|poids|gewicht|plombee|plongee deco)\b|\.|;|$)',
      caseSensitive: false,
    );
    for (final match in buddyRx.allMatches(text)) {
      final chunk = match.group(1)?.trim() ?? '';
      if (chunk.isEmpty) continue;
      for (final part in chunk.split(RegExp(r'\s+(?:en|et|and)\s+|,'))) {
        final name = _cleanDictatedName(part);
        if (name.isNotEmpty) buddies.add(name);
      }
    }

    for (final member in _dictationMembers) {
      final first = _normalizeDictation(member.prenom);
      if (first.length >= 3 && normalized.contains(RegExp('\\b$first\\b'))) {
        buddies.add(member.prenom);
      }
    }

    final fauna = <String>[];
    final seenRx = RegExp(
      r'(?:gezien|vu|seen)\s+(.+?)(?=\.|;|$)',
      caseSensitive: false,
    );
    for (final match in seenRx.allMatches(text)) {
      final chunk = match.group(1)?.trim() ?? '';
      for (final part in chunk.split(RegExp(r'\s+(?:en|et|and)\s+|,'))) {
        final animal = _cleanDictatedFauna(part);
        if (animal.isNotEmpty) fauna.add(animal);
      }
    }

    final locationRaw = _extractDictatedLocation(text);
    final locationSelection = _matchDictatedLocation(locationRaw, normalized);
    final matchedBinomes =
        _uniqueStrings(buddies).map(_matchDictatedBuddy).toList();
    var counters = _countersFromDictation(normalized);
    if (locationSelection?.isSea == true ||
        _looksLikeSeaLocation(locationRaw ?? '')) {
      counters = counters.copyWith(mer: true);
    }
    final notes = <String>[];
    if (diveNumberDouble != null) {
      notes.add('Dictée: plongée n° ${diveNumberDouble.toInt()}.');
    }

    return _DictatedDiveDraft(
      diveNumber: diveNumberDouble?.toInt(),
      date: parsedDate,
      entryTime: parsedEntryTime,
      exitTime: parsedExitTime,
      locationName: locationSelection?.name ?? locationRaw,
      locationSelection: locationSelection,
      depthMeters: depthFromSpeech,
      durationMinutes: durationDouble?.round(),
      buddies: _uniqueStrings(buddies),
      binomes: matchedBinomes,
      tankVolumeL: tankVolume,
      lestageKg: lestage,
      counters: counters,
      fauna: _uniqueStrings(fauna),
      notesParts: notes,
    );
  }

  DateTime? _parseDictatedDate(String normalized) {
    final today = DateTime.now();
    final base = DateTime(today.year, today.month, today.day);
    if (RegExp(r'\b(aujourd hui|vandaag)\b').hasMatch(normalized)) {
      return base;
    }
    if (RegExp(r'\b(hier|gisteren)\b').hasMatch(normalized)) {
      return base.subtract(const Duration(days: 1));
    }
    if (RegExp(r'\b(demain|morgen)\b').hasMatch(normalized)) {
      return base.add(const Duration(days: 1));
    }

    final numeric =
        RegExp(r'\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b')
            .firstMatch(normalized);
    if (numeric != null) {
      final day = int.tryParse(numeric.group(1)!);
      final month = int.tryParse(numeric.group(2)!);
      var year = int.tryParse(numeric.group(3) ?? today.year.toString());
      if (year != null && year < 100) year += 2000;
      if (day != null && month != null && year != null) {
        return _safeDate(year, month, day);
      }
    }

    const months = {
      'janvier': 1,
      'januari': 1,
      'jan': 1,
      'fevrier': 2,
      'februari': 2,
      'fev': 2,
      'feb': 2,
      'mars': 3,
      'maart': 3,
      'mar': 3,
      'avril': 4,
      'april': 4,
      'avr': 4,
      'apr': 4,
      'mai': 5,
      'mei': 5,
      'juin': 6,
      'juni': 6,
      'juillet': 7,
      'juli': 7,
      'aout': 8,
      'augustus': 8,
      'aug': 8,
      'septembre': 9,
      'september': 9,
      'sept': 9,
      'octobre': 10,
      'oktober': 10,
      'oct': 10,
      'okt': 10,
      'novembre': 11,
      'november': 11,
      'nov': 11,
      'decembre': 12,
      'december': 12,
      'dec': 12,
    };
    final monthNames = months.keys.map(RegExp.escape).join('|');
    final named =
        RegExp(r'\b(\d{1,2})\s+(' + monthNames + r')(?:\s+(\d{4}))?\b')
            .firstMatch(normalized);
    if (named != null) {
      final day = int.tryParse(named.group(1)!);
      final month = months[named.group(2)!];
      final year = int.tryParse(named.group(3) ?? today.year.toString());
      if (day != null && month != null && year != null) {
        return _safeDate(year, month, day);
      }
    }
    return null;
  }

  DateTime? _safeDate(int year, int month, int day) {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    final date = DateTime(year, month, day);
    if (date.year != year || date.month != month || date.day != day) {
      return null;
    }
    return date;
  }

  TimeOfDay? _parseDictatedTime(String normalized, List<String> labels) {
    for (final label in labels) {
      final escaped = RegExp.escape(label);
      final patterns = [
        RegExp(
          r'\b' +
              escaped +
              r'\s*(?:a|om|:)?\s*(\d{1,2})\s*(?:h|heure|heures|uur|:)\s*(\d{1,2})?\b',
        ),
        RegExp(
          r'\b' +
              escaped +
              r'\s*(?:a|om|:)?\s*(\d{1,2})\s*(?:h|heure|heures|uur)\b',
        ),
      ];
      for (final rx in patterns) {
        final match = rx.firstMatch(normalized);
        if (match == null) continue;
        final hour = int.tryParse(match.group(1)!);
        final minute = int.tryParse(match.group(2) ?? '0') ?? 0;
        if (hour != null && hour >= 0 && hour <= 23 && minute <= 59) {
          return TimeOfDay(hour: hour, minute: minute);
        }
      }
    }
    return null;
  }

  double? _firstNumberForPatterns(String source, List<RegExp> patterns) {
    for (final rx in patterns) {
      final match = rx.firstMatch(source);
      if (match == null) continue;
      return double.tryParse(match.group(1)!.replaceAll(',', '.'));
    }
    return null;
  }

  LogbookCounters _countersFromDictation(String normalized) {
    return LogbookCounters(
      exo: RegExp(r'\b(formation|exercice|oefening|opleiding|examen)\b')
              .hasMatch(normalized)
          ? true
          : null,
      nitrox:
          RegExp(r'\b(nitrox|ean|eanx)\b').hasMatch(normalized) ? true : null,
      deco: RegExp(r'\b(deco|decompression|palier|paliers)\b')
              .hasMatch(normalized)
          ? true
          : null,
      dp: RegExp(
        r'\b(dp|directeur de palanquee|directrice de palanquee|direction de palanqu\w*|chef de palanquee)\b',
      ).hasMatch(normalized)
          ? true
          : null,
      sf: RegExp(r'\b(sf|serre file|serre-file|servile|serfile)\b')
              .hasMatch(normalized)
          ? true
          : null,
      nuit:
          RegExp(r'\b(nuit|nacht|night)\b').hasMatch(normalized) ? true : null,
      mer: RegExp(r'\b(mer|zee|sea)\b').hasMatch(normalized) ? true : null,
    );
  }

  LogbookCounters _mergeCounters(
    LogbookCounters current,
    LogbookCounters detected,
  ) {
    return current.copyWith(
      exo: detected.exo == true ? true : null,
      nitrox: detected.nitrox == true ? true : null,
      deco: detected.deco == true ? true : null,
      dp: detected.dp == true ? true : null,
      sf: detected.sf == true ? true : null,
      nuit: detected.nuit == true ? true : null,
      mer: detected.mer == true ? true : null,
    );
  }

  String? _extractDictatedLocation(String text) {
    final cleaned = text.replaceAll('\n', ' ').trim();
    if (cleaned.isEmpty) return null;
    final beforeDepth = cleaned
        .split(RegExp(r'\b(?:diepte|profondeur|depth|duree|durée|duur)\b',
            caseSensitive: false))
        .first;
    final withoutDive = beforeDepth
        .replaceFirst(
            RegExp(r'^\s*(?:duik|plong[eé]e|dive)\s*\d+\s*,?\s*',
                caseSensitive: false),
            '')
        .trim();
    final parts = withoutDive
        .split(RegExp(r'[,.]'))
        .map((p) => p.trim())
        .where((p) => p.isNotEmpty)
        .toList();
    if (parts.isEmpty) return null;
    return parts.join(' - ');
  }

  DiveLocationSelection? _matchDictatedLocation(
    String? rawLocation,
    String normalizedFullText,
  ) {
    final alias = _locationAlias(normalizedFullText);
    final source = alias ?? rawLocation;
    if (source == null || source.trim().isEmpty) return null;
    final sourceNorm = _normalizeDictation(source);
    _DictationLocation? best;
    var bestScore = 999;
    for (final location in _dictationLocations) {
      final score = _matchScore(sourceNorm, _normalizeDictation(location.name));
      if (score < bestScore) {
        best = location;
        bestScore = score;
      }
    }
    if (best != null && bestScore <= 3) {
      return DiveLocationSelection(
        id: best.id,
        name: best.name,
        country: best.country,
        isSea: best.isSea,
      );
    }
    return DiveLocationSelection(
      name: source.trim(),
      isSea: _looksLikeSeaLocation(source),
    );
  }

  String? _locationAlias(String normalizedText) {
    if (normalizedText.contains('danza hot') ||
        normalizedText.contains('danza') ||
        normalizedText.contains('lanzarote')) {
      final place = normalizedText.contains('carmen')
          ? 'Lanzarote - Puerto del Carmen'
          : 'Lanzarote';
      return place;
    }
    if (normalizedText.contains('petio de pinto') ||
        normalizedText.contains('pinto del carmen')) {
      return 'Lanzarote - Puerto del Carmen';
    }
    return null;
  }

  BinomeSelection _matchDictatedBuddy(String rawName) {
    final source = _normalizeDictation(rawName);
    _DictationMember? best;
    var bestScore = 999;
    for (final member in _dictationMembers) {
      final variants = [
        member.displayName,
        member.prenom,
        '${member.nom} ${member.prenom}',
      ];
      for (final variant in variants) {
        final score = _matchScore(source, _normalizeDictation(variant));
        if (score < bestScore) {
          best = member;
          bestScore = score;
        }
      }
    }
    if (best != null && bestScore <= 2) {
      return BinomeSelection.member(
        memberId: best.id,
        displayName: best.displayName,
      );
    }
    return BinomeSelection.external(displayName: rawName);
  }

  int _matchScore(String source, String target) {
    if (source.isEmpty || target.isEmpty) return 999;
    if (source == target) return 0;
    if (target.startsWith(source) || source.startsWith(target)) return 1;
    if (target.contains(source) || source.contains(target)) return 2;
    final sourceParts = source.split(' ').where((p) => p.length >= 3).toList();
    final targetParts = target.split(' ').where((p) => p.length >= 3).toList();
    if (sourceParts.any((s) => targetParts.any((t) => s == t))) return 2;
    if (sourceParts
        .any((s) => targetParts.any((t) => _levenshtein(s, t) <= 2))) {
      return 3;
    }
    return 999;
  }

  bool _looksLikeSeaLocation(String name) {
    final n = _normalizeDictation(name);
    return n.contains('lanzarote') ||
        n.contains('madeira') ||
        n.contains('hurghada') ||
        n.contains('porto del carmen') ||
        n.contains('zeeland') ||
        n.contains('mer') ||
        n.contains('sea');
  }

  String _cleanDictatedName(String value) {
    var cleaned = value
        .replaceAll(
            RegExp(r'\b(?:ik heb|j ai|avec|met|een|une|un)\b',
                caseSensitive: false),
            ' ')
        .replaceAll(
            RegExp(
              r'\b(?:bouteille|fles|tank|lestage|poids|gewicht|kg|kilo|kilos).*$',
              caseSensitive: false,
            ),
            ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim()
        .replaceAll(RegExp(r'[.。]+$'), '');
    final correction = RegExp(r'\bnon binome c est\s+(.+)$')
        .firstMatch(_normalizeDictation(cleaned));
    if (correction != null) {
      cleaned = correction.group(1)!.trim();
    }
    if (RegExp(r'\d').hasMatch(cleaned)) return '';
    final parts = cleaned.split(' ').where((p) => p.trim().isNotEmpty).toList();
    if (parts.length > 3) return '';
    return cleaned;
  }

  String _cleanDictatedFauna(String value) {
    final cleaned = value
        .replaceAll(
            RegExp(r'\b(?:een|une|un|des|de|du|la|le|les)\b',
                caseSensitive: false),
            ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim()
        .replaceAll(RegExp(r'[.。]+$'), '');
    final low = _normalizeDictation(cleaned);
    if (low == 'ray pasternak') return 'raie pastenague';
    if (low == 'amiro girand' || low == 'amiro giant') return 'mérou géant';
    return cleaned;
  }

  String _normalizeDictation(String value) {
    return value
        .toLowerCase()
        .replaceAll(RegExp(r'[àáâä]'), 'a')
        .replaceAll(RegExp(r'[èéêë]'), 'e')
        .replaceAll(RegExp(r'[ìíîï]'), 'i')
        .replaceAll(RegExp(r'[òóôö]'), 'o')
        .replaceAll(RegExp(r'[ùúûü]'), 'u')
        .replaceAll(RegExp(r'[ç]'), 'c')
        .replaceAll(RegExp(r"[’']"), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  int _levenshtein(String a, String b) {
    if (a == b) return 0;
    if (a.isEmpty) return b.length;
    if (b.isEmpty) return a.length;
    final prev = List<int>.generate(b.length + 1, (i) => i);
    final curr = List<int>.filled(b.length + 1, 0);
    for (var i = 1; i <= a.length; i += 1) {
      curr[0] = i;
      for (var j = 1; j <= b.length; j += 1) {
        final cost = a.codeUnitAt(i - 1) == b.codeUnitAt(j - 1) ? 0 : 1;
        curr[j] = [
          curr[j - 1] + 1,
          prev[j] + 1,
          prev[j - 1] + cost,
        ].reduce((x, y) => x < y ? x : y);
      }
      for (var j = 0; j <= b.length; j += 1) {
        prev[j] = curr[j];
      }
    }
    return prev[b.length];
  }

  List<String> _uniqueStrings(List<String> values) {
    final seen = <String>{};
    final out = <String>[];
    for (final value in values) {
      final trimmed = value.trim();
      if (trimmed.isEmpty) continue;
      if (seen.add(_normalizeDictation(trimmed))) out.add(trimmed);
    }
    return out;
  }

  List<String> _dedupeSentences(List<String> values) => _uniqueStrings(values);

  Future<void> _save() async {
    if (!_canSubmit) return;
    setState(() => _submitting = true);
    try {
      final auth = context.read<AuthProvider>();
      final memberProvider = context.read<MemberProvider>();
      final userId = auth.currentUser?.uid;
      if (userId == null) throw 'Session non identifiée';

      const clubId = FirebaseConfig.defaultClubId;

      // Pool entries: date / location / theme / validator stay locked
      // (those reflect what the session actually was), but group level +
      // group number are editable so the student can fix a check-in
      // mistake. Notes are free-text as usual.
      if (_isPoolEdit && widget.entryId != null) {
        final poolLocationName = ((widget.initialData?['location_name'] ??
                    widget.initialData?['lieu']) as String? ??
                '')
            .trim();
        await FirebaseFirestore.instance
            .collection('clubs')
            .doc(clubId)
            .collection('student_logbook_entries')
            .doc(widget.entryId)
            .update({
          'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
          'group_level': _poolLevel,
          'group_number': _poolGroupNumber,
          'updated_at': FieldValue.serverTimestamp(),
        });
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text(
              'Séance piscine mise à jour ✓',
              style: TextStyle(color: Colors.white),
            ),
            backgroundColor: Colors.green.shade700,
            behavior: SnackBarBehavior.floating,
          ),
        );
        _saved = true;
        Navigator.of(context).pop(
          LogbookEntrySaveResult(
            entryId: widget.entryId!,
            date: _date,
            locationName: poolLocationName,
            updated: true,
          ),
        );
        return;
      }

      final memberName =
          '${memberProvider.prenom ?? ''} ${memberProvider.nom ?? ''}'.trim();

      // Backwards-compat: also write the legacy buddies[] array, deriving
      // entries from the new binomes[] array.
      final legacyBuddies = _binomes
          .map((b) => LogbookBuddy(
                memberId: b.memberId,
                name: b.displayName ?? b.chipLabel,
                externalOrganization: b.club,
              ))
          .toList();

      final lestage = double.tryParse(_lestage.text.replaceAll(',', '.'));
      final extras = <String, dynamic>{
        'binomes': _binomes.map((b) => b.toMap()).toList(),
        if (_entryTime != null)
          'entry_time':
              Timestamp.fromDate(_composeDateTime(_date, _entryTime!)),
        if (_exitTime != null)
          'exit_time': Timestamp.fromDate(_composeDateTime(_date, _exitTime!)),
        if (_entryTime != null) 'entry_time_str': _formatTime(_entryTime!),
        if (_exitTime != null) 'exit_time_str': _formatTime(_exitTime!),
        if (_combi != null) 'combi': _combi!.toMap(),
        // Keep legacy combi_type for backwards compat with the first
        // iteration (chips-only) — readers may still inspect this field.
        if (_combi != null) 'combi_type': _combi!.type,
        if (_tank != null) 'tank': _tank!.toMap(),
        if (lestage != null && lestage > 0) 'lestage_kg': lestage,
        if (widget.mode != LogbookEntryMode.edit &&
            _parseDictatedDive(_dictation.text).diveNumber != null)
          'dive_number': _parseDictatedDive(_dictation.text).diveNumber,
      };

      final source = widget.mode == LogbookEntryMode.auto
          ? 'calypso_operation'
          : (widget.mode == LogbookEntryMode.edit
              ? (widget.initialData?['source'] as String?) ?? 'manual'
              : 'manual');

      final entry = StudentLogbookEntry(
        id: widget.entryId ?? '',
        memberId: userId,
        memberName: memberName,
        source: source,
        date: _date,
        locationId: _locationSelection?.id,
        locationName: _locationSelection?.name ?? '',
        country: _locationSelection?.country,
        operationId: widget.task?.context.operationId ??
            widget.initialData?['operation_id'] as String?,
        operationTitle: widget.task?.context.operationTitle ??
            widget.initialData?['operation_title'] as String?,
        palanqueeId: widget.task?.context.palanqueeId ??
            widget.initialData?['palanquee_id'] as String?,
        depthMaxMeters: double.tryParse(_depth.text.replaceAll(',', '.')),
        durationMinutes: int.tryParse(_duration.text),
        counters: _counters,
        buddies: legacyBuddies,
        notes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
      );

      String savedEntryId = widget.entryId ?? '';
      if (widget.mode == LogbookEntryMode.edit && widget.entryId != null) {
        await _service.update(
          clubId: clubId,
          entryId: widget.entryId!,
          entry: entry,
          extras: extras,
        );
      } else {
        savedEntryId =
            await _service.create(clubId: clubId, entry: entry, extras: extras);
        if (widget.task != null) {
          await _taskService.markCompleted(clubId, widget.task!.id, userId);
        }
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.mode == LogbookEntryMode.edit
                ? 'Plongée mise à jour ✓'
                : 'Plongée enregistrée ✓'),
          ),
        );
        _saved = true;
        Navigator.of(context).pop(
          LogbookEntrySaveResult(
            entryId: savedEntryId,
            date: _date,
            locationName: _locationSelection?.name ?? '',
            updated: widget.mode == LogbookEntryMode.edit,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur : $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _delete() async {
    if (widget.entryId == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            const Icon(Icons.delete_outline, color: Colors.red),
            const SizedBox(width: 8),
            Text(_isPoolEdit
                ? 'Supprimer cette séance piscine ?'
                : 'Supprimer cette plongée ?'),
          ],
        ),
        content: Text(
          _isPoolEdit
              ? "Cette action est définitive — la séance disparaît "
                  "de ton carnet."
              : "Cette action est définitive — la plongée disparaît "
                  "de ton carnet et des statistiques.",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Supprimer'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _submitting = true);
    try {
      const clubId = FirebaseConfig.defaultClubId;
      await _service.delete(clubId: clubId, entryId: widget.entryId!);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Plongée supprimée.')),
      );
      // Pop twice: once for the edit screen, once for the detail screen.
      Navigator.of(context).pop();
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Échec de la suppression : $e')),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class _DictatedDiveDraft {
  final int? diveNumber;
  final DateTime? date;
  final TimeOfDay? entryTime;
  final TimeOfDay? exitTime;
  final String? locationName;
  final DiveLocationSelection? locationSelection;
  final double? depthMeters;
  final int? durationMinutes;
  final List<String> buddies;
  final List<BinomeSelection> binomes;
  final double? tankVolumeL;
  final double? lestageKg;
  final LogbookCounters counters;
  final List<String> fauna;
  final List<String> notesParts;

  const _DictatedDiveDraft({
    this.diveNumber,
    this.date,
    this.entryTime,
    this.exitTime,
    this.locationName,
    this.locationSelection,
    this.depthMeters,
    this.durationMinutes,
    this.buddies = const [],
    this.binomes = const [],
    this.tankVolumeL,
    this.lestageKg,
    this.counters = const LogbookCounters(),
    this.fauna = const [],
    this.notesParts = const [],
  });
}

class _DictationField {
  final String label;
  final bool required;
  final String? value;
  final String? hint;
  final bool wide;

  const _DictationField({
    required this.label,
    this.required = false,
    this.value,
    this.hint,
    this.wide = false,
  });
}

class _DictationMember {
  final String id;
  final String prenom;
  final String nom;
  final String displayName;
  final String level;

  const _DictationMember({
    required this.id,
    required this.prenom,
    required this.nom,
    required this.displayName,
    required this.level,
  });
}

class _DictationLocation {
  final String id;
  final String name;
  final String? country;
  final bool isSea;

  const _DictationLocation({
    required this.id,
    required this.name,
    this.country,
    required this.isSea,
  });
}

// ===========================================================================
// Pool-edit form widgets — level dropdown + group-number stepper.
// ===========================================================================

class _PoolLevelDropdown extends StatelessWidget {
  final String? value;
  final ValueChanged<String?> onChanged;
  const _PoolLevelDropdown({required this.value, required this.onChanged});

  static const _options = <String>['1*', '2*', '3*', '4*', 'Perfectionnement'];

  @override
  Widget build(BuildContext context) {
    final current = _options.contains(value) ? value : null;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.grey.shade300),
        color: Colors.white,
      ),
      child: DropdownButton<String>(
        value: current,
        isExpanded: true,
        underline: const SizedBox.shrink(),
        hint: Text(
          'Niveau',
          style: TextStyle(
            color: Colors.grey.shade400,
            fontStyle: FontStyle.italic,
          ),
        ),
        items: [
          for (final opt in _options)
            DropdownMenuItem<String>(
              value: opt,
              child: Text('Formation $opt'),
            ),
        ],
        onChanged: onChanged,
      ),
    );
  }
}

/// Resolves a list of member IDs to "Prenom NOM" labels via Firestore.
/// Used for the read-only MONITEUR section in the pool edit form.
class _PoolMemberNameList extends StatelessWidget {
  final List<String> memberIds;
  const _PoolMemberNameList({required this.memberIds});

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<String>>(
      future: _resolve(memberIds),
      builder: (context, snap) {
        final names = snap.data ?? memberIds;
        return Row(
          children: [
            Icon(Icons.person_outline, color: Colors.grey.shade700, size: 18),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                names.join(', '),
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Future<List<String>> _resolve(List<String> ids) async {
    final db = FirebaseFirestore.instance;
    final out = <String>[];
    for (final id in ids) {
      try {
        final s = await db
            .collection('clubs')
            .doc(FirebaseConfig.defaultClubId)
            .collection('members')
            .doc(id)
            .get();
        if (!s.exists) {
          out.add(id);
          continue;
        }
        final v = s.data() ?? {};
        final prenom = (v['prenom'] as String?) ?? '';
        final nom = (v['nom'] as String?) ?? '';
        final display = ('$prenom $nom').trim();
        out.add(display.isEmpty ? id : display);
      } catch (_) {
        out.add(id);
      }
    }
    return out;
  }
}

class _PoolGroupNumberStepper extends StatelessWidget {
  final int? value;
  final ValueChanged<int?> onChanged;
  const _PoolGroupNumberStepper({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final v = value ?? 1;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.grey.shade300),
        color: Colors.white,
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.remove, size: 18),
            visualDensity: VisualDensity.compact,
            onPressed: v > 1 ? () => onChanged(v - 1) : null,
          ),
          Expanded(
            child: Center(
              child: Text(
                'Groupe $v',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.add, size: 18),
            visualDensity: VisualDensity.compact,
            onPressed: v < 12 ? () => onChanged(v + 1) : null,
          ),
        ],
      ),
    );
  }
}

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
import 'package:cloud_functions/cloud_functions.dart';
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

enum _SpeechCaptureMode { free, guided }

class LogbookEntryScreen extends StatefulWidget {
  final LogbookEntryMode mode;
  final FormationTask? task; // required when mode == auto
  final bool enableDictation;
  final Map<String, dynamic>? prefillData;
  final String? sourceOverride;
  final Map<String, dynamic>? createExtras;

  /// Entry id when mode == edit.
  final String? entryId;

  /// Raw Firestore map when mode == edit — used to prefill every field.
  final Map<String, dynamic>? initialData;

  const LogbookEntryScreen.auto({super.key, required this.task})
      : mode = LogbookEntryMode.auto,
        enableDictation = false,
        prefillData = null,
        sourceOverride = null,
        createExtras = null,
        entryId = null,
        initialData = null;

  const LogbookEntryScreen.manual({
    super.key,
    this.enableDictation = true,
    this.prefillData,
    this.sourceOverride,
    this.createExtras,
  })  : task = null,
        entryId = null,
        initialData = null,
        mode = LogbookEntryMode.manual;

  const LogbookEntryScreen.edit({
    super.key,
    required String this.entryId,
    required Map<String, dynamic> this.initialData,
    this.enableDictation = false,
  })  : task = null,
        prefillData = null,
        sourceOverride = null,
        createExtras = null,
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
  final TextEditingController _diveNumber = TextEditingController();
  final TextEditingController _dictation = TextEditingController();
  final stt.SpeechToText _speech = stt.SpeechToText();
  List<BinomeSelection> _binomes = const [];
  List<_DictationMember> _dictationMembers = const [];
  List<_DictationLocation> _dictationLocations = const [];
  LogbookCounters _counters = const LogbookCounters();
  CombiSelection? _combi;
  TankSelection? _tank;
  final Set<String> _manualFieldOverrides = <String>{};
  String _dictationListenBase = '';
  String _speechPendingText = '';
  String? _lastAnalysisMessage;
  String? _aiDictationText;
  _DictatedDiveDraft? _aiDictationDraft;
  _SpeechCaptureMode _speechMode = _SpeechCaptureMode.free;
  int _guidedStepIndex = 0;
  bool _submitting = false;
  bool _analyzingDictation = false;
  bool _dictationOpen = true;
  bool _dictationAppliedToForm = false;
  bool _speechAvailable = false;
  bool _listening = false;
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
      !_dictationAppliedToForm;

  static const List<_GuidedDictationStep> _guidedSteps = [
    _GuidedDictationStep(
      field: 'dive_number',
      label: 'N°',
      prompt: 'Dis le numéro de plongée.',
      example: 'Ex: 413',
    ),
    _GuidedDictationStep(
      field: 'date',
      label: 'Date',
      prompt: 'Dis la date de la plongée.',
      example: 'Ex: 22 février 2016',
    ),
    _GuidedDictationStep(
      field: 'location',
      label: 'Lieu',
      prompt: 'Dis le lieu de plongée.',
      example: 'Ex: Lanzarote Charco del Palo',
    ),
    _GuidedDictationStep(
      field: 'entry_time',
      label: 'Immersion',
      prompt: 'Dis l’heure d’immersion.',
      example: 'Ex: 14 h 30',
    ),
    _GuidedDictationStep(
      field: 'exit_time',
      label: 'Sortie',
      prompt: 'Dis l’heure de sortie.',
      example: 'Ex: 15 h 17',
    ),
    _GuidedDictationStep(
      field: 'depth',
      label: 'Profondeur',
      prompt: 'Dis la profondeur maximale.',
      example: 'Ex: 25 mètres',
    ),
    _GuidedDictationStep(
      field: 'duration',
      label: 'Durée',
      prompt: 'Dis la durée de la plongée.',
      example: 'Ex: 47 minutes',
    ),
    _GuidedDictationStep(
      field: 'buddy',
      label: 'Binôme',
      prompt: 'Dis le ou les binômes.',
      example: 'Ex: avec Sébastien et Marie',
    ),
    _GuidedDictationStep(
      field: 'tank',
      label: 'Bouteille',
      prompt: 'Dis le volume de la bouteille.',
      example: 'Ex: 12 litres',
    ),
    _GuidedDictationStep(
      field: 'lestage',
      label: 'Lestage',
      prompt: 'Dis le lestage.',
      example: 'Ex: 8 kilos',
    ),
    _GuidedDictationStep(
      field: 'exo',
      label: 'Formation',
      prompt: 'Dis oui ou non.',
      example: 'Ex: oui',
    ),
    _GuidedDictationStep(
      field: 'nitrox',
      label: 'Nitrox',
      prompt: 'Dis oui ou non.',
      example: 'Ex: oui',
    ),
    _GuidedDictationStep(
      field: 'deco',
      label: 'Déco',
      prompt: 'Dis oui ou non.',
      example: 'Ex: non',
    ),
    _GuidedDictationStep(
      field: 'dp',
      label: 'DP',
      prompt: 'Dis oui ou non.',
      example: 'Ex: oui',
    ),
    _GuidedDictationStep(
      field: 'sf',
      label: 'SF',
      prompt: 'Dis oui ou non.',
      example: 'Ex: non',
    ),
    _GuidedDictationStep(
      field: 'nuit',
      label: 'Nuit',
      prompt: 'Dis oui ou non.',
      example: 'Ex: non',
    ),
    _GuidedDictationStep(
      field: 'mer',
      label: 'Mer',
      prompt: 'Dis oui ou non.',
      example: 'Ex: oui',
    ),
    _GuidedDictationStep(
      field: 'notes',
      label: 'Notes',
      prompt: 'Dis les notes ou la faune observée.',
      example: 'Ex: vu un mérou, belle visi',
    ),
  ];

  /// Triple-binding anchor: tracks which two of (entry / exit / duration) the
  /// user touched most recently. The third one is derived from the other two.
  /// Keys: 'entry', 'exit', 'duration'.
  final List<String> _timingAnchor = <String>[];
  bool _suppressDurationListener = false;

  @override
  void initState() {
    super.initState();
    _duration.addListener(_onDurationChanged);
    _dictation.addListener(() {
      final currentText = _dictation.text.trim();
      setState(() {
        if (_aiDictationText != currentText) {
          _aiDictationText = null;
          _aiDictationDraft = null;
        }
      });
    });
    _loadDictationCatalogs();
    if (widget.mode == LogbookEntryMode.auto && widget.task != null) {
      _prefillFromTask();
    } else if (widget.mode == LogbookEntryMode.edit &&
        widget.initialData != null) {
      _prefillFromMap(widget.initialData!);
    } else if (widget.prefillData != null) {
      _prefillFromMap(widget.prefillData!);
    } else {
      _prefillNextDiveNumber();
    }
  }

  void _prefillFromMap(Map<String, dynamic> map) {
    final date = (map['date'] as Timestamp?)?.toDate();
    if (date != null) _date = date;
    final diveNumber = map['dive_number'];
    if (diveNumber is num && diveNumber > 0) {
      _diveNumber.text = diveNumber.toInt().toString();
    }

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
      final userId = context.read<AuthProvider>().currentUser?.uid;
      final db = FirebaseFirestore.instance;
      final snaps = await Future.wait([
        db.collection('clubs').doc(clubId).collection('members').get(),
        db
            .collection('clubs')
            .doc(clubId)
            .collection('dive_locations')
            .limit(500)
            .get(),
        if (userId != null)
          db
              .collection('clubs')
              .doc(clubId)
              .collection('student_logbook_entries')
              .where('member_id', isEqualTo: userId)
              .limit(1000)
              .get(),
      ]);
      final memberSnap = snaps[0];
      final locationSnap = snaps[1];
      final carnetSnap = snaps.length > 2 ? snaps[2] : null;
      final members = memberSnap.docs
          .map((doc) {
            final data = doc.data();
            final prenom = ((data['prenom'] ??
                        data['firstName'] ??
                        data['first_name'] ??
                        data['membre_prenom'] ??
                        data['member_first_name']) as String? ??
                    '')
                .trim();
            final nom = ((data['nom'] ??
                        data['lastName'] ??
                        data['last_name'] ??
                        data['membre_nom'] ??
                        data['member_last_name']) as String? ??
                    '')
                .trim();
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
      final locationsByName = <String, _DictationLocation>{};
      void addLocation(_DictationLocation location) {
        final key = _normalizeDictation(location.name);
        if (key.isEmpty) return;
        final existing = locationsByName[key];
        locationsByName[key] = existing == null
            ? location
            : _DictationLocation(
                id: existing.id.isNotEmpty ? existing.id : location.id,
                name: existing.name,
                country: existing.country ?? location.country,
                isSea: existing.isSea || location.isSea,
              );
      }

      for (final doc in locationSnap.docs) {
        final data = doc.data();
        final name = ((data['name'] ?? data['nom']) as String? ?? '').trim();
        final waterType =
            ((data['water_type'] ?? data['type']) as String? ?? '')
                .toLowerCase()
                .trim();
        addLocation(_DictationLocation(
          id: doc.id,
          name: name,
          country: data['country'] as String?,
          isSea: waterType == 'sea' || waterType == 'mer',
        ));
      }
      for (final doc in carnetSnap?.docs ?? const []) {
        final data = doc.data();
        final name =
            ((data['location_name'] ?? data['lieu']) as String? ?? '').trim();
        final counters = data['counters'];
        addLocation(_DictationLocation(
          id: '',
          name: name,
          country: data['country'] as String?,
          isSea: counters is Map && counters['mer'] == true,
        ));
      }
      final locations = locationsByName.values.toList()
        ..sort((a, b) => a.name.compareTo(b.name));
      if (!mounted) return;
      setState(() {
        _dictationMembers = members;
        _dictationLocations = locations;
      });
    } catch (e) {
      debugPrint('[LogbookEntry] dictation catalog load failed: $e');
    }
  }

  Future<void> _prefillNextDiveNumber() async {
    final userId = context.read<AuthProvider>().currentUser?.uid;
    if (userId == null || _diveNumber.text.trim().isNotEmpty) return;
    try {
      const clubId = FirebaseConfig.defaultClubId;
      final snap = await FirebaseFirestore.instance
          .collection('clubs')
          .doc(clubId)
          .collection('student_logbook_entries')
          .where('member_id', isEqualTo: userId)
          .get();
      var highest = 0;
      for (final doc in snap.docs) {
        final n = doc.data()['dive_number'];
        if (n is num && n > highest) highest = n.toInt();
      }
      if (!mounted || _diveNumber.text.trim().isNotEmpty) return;
      setState(() {
        _diveNumber.text = (highest + 1).toString();
        _manualFieldOverrides.add('dive_number');
      });
    } catch (e) {
      debugPrint('[LogbookEntry] next dive number load failed: $e');
    }
  }

  Future<int?> _resolveDiveNumberForSave({
    required String clubId,
    required String userId,
  }) async {
    final typed = int.tryParse(_diveNumber.text.trim());
    if (widget.mode == LogbookEntryMode.edit) {
      return typed != null && typed > 0 ? typed : null;
    }

    try {
      final snap = await FirebaseFirestore.instance
          .collection('clubs')
          .doc(clubId)
          .collection('student_logbook_entries')
          .where('member_id', isEqualTo: userId)
          .get();
      var highest = 0;
      for (final doc in snap.docs) {
        final n = doc.data()['dive_number'];
        if (n is num && n > highest) highest = n.toInt();
      }
      final next = highest + 1;
      if (typed != null && typed > highest) return typed;
      _diveNumber.text = next.toString();
      return next;
    } catch (e) {
      debugPrint('[LogbookEntry] save dive number guard failed: $e');
      return typed != null && typed > 0 ? typed : null;
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

  void _resolveMissingTiming({bool allowOverride = false}) {
    final duration = _parseDuration();
    if (_entryTime == null && _exitTime != null && duration != null) {
      setState(() {
        _entryTime = _minutesToTime(_timeToMinutes(_exitTime!) - duration);
      });
      return;
    }
    if (_exitTime == null && _entryTime != null && duration != null) {
      setState(() {
        _exitTime = _minutesToTime(_timeToMinutes(_entryTime!) + duration);
      });
      return;
    }
    if (allowOverride ||
        (_duration.text.trim().isEmpty &&
            _entryTime != null &&
            _exitTime != null)) {
      final entryMin = _timeToMinutes(_entryTime!);
      var exitMin = _timeToMinutes(_exitTime!);
      if (exitMin < entryMin) exitMin += 24 * 60;
      final minutes = exitMin - entryMin;
      if (minutes > 0) _setDurationSilent(minutes.toString());
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
    _diveNumber.dispose();
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
    final text = _dictation.text.trim();
    final parsed = _aiDictationText == text && _aiDictationDraft != null
        ? _aiDictationDraft!
        : _parseDictatedDive(_dictation.text);
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
            TextField(
              controller: _dictation,
              minLines: 2,
              maxLines: 4,
              textInputAction: TextInputAction.newline,
              decoration: InputDecoration(
                hintText: 'Optionnel: dictée libre complète, par exemple:\n'
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
            const SizedBox(height: 8),
            _dictationActions(),
            if (_lastAnalysisMessage != null) ...[
              const SizedBox(height: 10),
              _dictationStatusBanner(_lastAnalysisMessage!),
            ],
            const SizedBox(height: 10),
            _dictationProfileGrid(rows),
          ],
        ],
      ),
    );
  }

  Widget _dictationStatusBanner(String text) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.green.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.green.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          const Icon(Icons.check_circle_outline, color: Colors.green, size: 17),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: Colors.green.shade900,
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
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
              onPressed: () => _toggleSpeechCapture(_SpeechCaptureMode.free),
              icon: Icon(_listening ? Icons.stop : Icons.mic, size: 18),
              label: Text(
                _listening && _speechMode == _SpeechCaptureMode.free
                    ? 'Arrêter'
                    : 'Libre',
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
              onPressed:
                  hasText && !_analyzingDictation ? _analyzeDictation : null,
              icon: Icon(
                _analyzingDictation ? Icons.hourglass_top : Icons.manage_search,
                size: 18,
              ),
              label: Text(
                _analyzingDictation ? 'IA...' : 'Analyser',
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
                        _aiDictationText = null;
                        _aiDictationDraft = null;
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

        final canActFromDictation =
            (hasText || _canSubmit) && !_submitting && !_analyzingDictation;
        final fillButton = actionBox(
          width: mainWidth,
          child: ElevatedButton.icon(
            onPressed: canActFromDictation ? _applyDictationAndOpenForm : null,
            icon: const Icon(Icons.edit_note, size: 18),
            label: const Text(
              'Corriger',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              softWrap: false,
            ),
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              backgroundColor: Colors.green,
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
    final dateValue = _manualFieldOverrides.contains('date')
        ? _formatDate(_date)
        : parsed.date == null
            ? null
            : _formatDate(parsed.date!);
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
    final diveNumberValue = _diveNumber.text.trim().isNotEmpty
        ? 'N°${_diveNumber.text.trim()}'
        : parsed.diveNumber == null
            ? null
            : 'N°${parsed.diveNumber}';

    return [
      _DictationField(
        field: 'dive_number',
        label: 'N°',
        value: diveNumberValue,
        hint: 'Ex: 413',
      ),
      _DictationField(
        field: 'date',
        label: 'Date',
        required: true,
        value: dateValue,
        hint: 'Ex: 10 octobre 2025',
      ),
      _DictationField(
        field: 'entry_time',
        label: 'Immersion',
        value: entryTimeValue,
        hint: 'Ex: 14:30',
      ),
      _DictationField(
        field: 'exit_time',
        label: 'Sortie',
        value: exitTimeValue,
        hint: 'Ex: 15:14',
      ),
      _DictationField(
        field: 'location',
        label: 'Lieu',
        required: true,
        value: locationValue,
        hint: 'Ex: Lanzarote - Puerto del Carmen',
        wide: true,
      ),
      _DictationField(
        field: 'depth',
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
        field: 'duration',
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
        field: 'buddy',
        label: 'Binôme',
        required: true,
        value: buddyValue.isEmpty ? null : buddyValue,
        hint: 'Ex: Sébastien ALONSO',
        wide: true,
      ),
      _DictationField(
        field: 'tank',
        label: 'Bouteille',
        value: _tank?.summary ??
            (parsed.tankVolumeL == null
                ? null
                : '${_fmtNum(parsed.tankVolumeL!)} L'),
      ),
      _DictationField(
        field: 'lestage',
        label: 'Lestage',
        value: _lestage.text.trim().isNotEmpty
            ? '${_lestage.text.trim()} kg'
            : parsed.lestageKg == null
                ? null
                : '${_fmtNum(parsed.lestageKg!)} kg',
      ),
      _DictationField(
        field: 'exo',
        label: 'Formation',
        value:
            _counters.exo == true || parsed.counters.exo == true ? 'Oui' : null,
      ),
      _DictationField(
        field: 'nitrox',
        label: 'Nitrox',
        value: _counters.nitrox == true || parsed.counters.nitrox == true
            ? 'Oui'
            : null,
      ),
      _DictationField(
        field: 'deco',
        label: 'Déco',
        value: _counters.deco == true || parsed.counters.deco == true
            ? 'Oui'
            : null,
      ),
      _DictationField(
        field: 'dp',
        label: 'DP',
        value:
            _counters.dp == true || parsed.counters.dp == true ? 'Oui' : null,
      ),
      _DictationField(
        field: 'sf',
        label: 'SF',
        value:
            _counters.sf == true || parsed.counters.sf == true ? 'Oui' : null,
      ),
      _DictationField(
        field: 'nuit',
        label: 'Nuit',
        value: _counters.nuit == true || parsed.counters.nuit == true
            ? 'Oui'
            : null,
      ),
      _DictationField(
        field: 'mer',
        label: 'Mer',
        value:
            _counters.mer == true || parsed.counters.mer == true ? 'Oui' : null,
      ),
      _DictationField(
        field: 'notes',
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
    final active = _listening &&
        _speechMode == _SpeechCaptureMode.guided &&
        _guidedSteps[_guidedStepIndex].field == field.field;
    final MaterialColor color = done
        ? active
            ? Colors.blue
            : Colors.green
        : field.required
            ? active
                ? Colors.blue
                : Colors.red
            : Colors.grey;
    final displayValue = active && _speechPendingText.trim().isNotEmpty
        ? _speechPendingText.trim()
        : done
            ? field.value!
            : (field.hint ?? 'à compléter');

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => _openFieldInput(field),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: color.withValues(alpha: active ? 0.16 : 0.10),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: color.withValues(alpha: active ? 0.85 : 0.45),
              width: active ? 1.5 : 1,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                active
                    ? Icons.mic
                    : done
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
                      active && _speechPendingText.trim().isEmpty
                          ? 'Écoute...'
                          : displayValue,
                      maxLines: field.wide ? 3 : 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight:
                            done || active ? FontWeight.w700 : FontWeight.w500,
                        color: done || active
                            ? color.shade900
                            : Colors.grey.shade600,
                        fontStyle: done || active
                            ? FontStyle.normal
                            : FontStyle.italic,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              Icon(Icons.edit_outlined, size: 16, color: color.shade600),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openFieldInput(_DictationField field) async {
    if (field.field == 'date') {
      final picked = await showDatePicker(
        context: context,
        initialDate: _date,
        firstDate: DateTime(1950),
        lastDate: DateTime.now().add(const Duration(days: 365 * 2)),
      );
      if (!mounted || picked == null) return;
      setState(() {
        _date = DateTime(picked.year, picked.month, picked.day);
        _manualFieldOverrides.add('date');
        _lastAnalysisMessage = 'Date mise à jour.';
      });
      return;
    }

    if (field.field == 'entry_time' || field.field == 'exit_time') {
      final isEntry = field.field == 'entry_time';
      final picked = await showTimePicker(
        context: context,
        initialTime: isEntry
            ? (_entryTime ?? const TimeOfDay(hour: 14, minute: 30))
            : (_exitTime ?? const TimeOfDay(hour: 15, minute: 15)),
      );
      if (!mounted || picked == null) return;
      setState(() {
        if (isEntry) {
          _entryTime = picked;
        } else {
          _exitTime = picked;
        }
      });
      _touchTiming(isEntry ? 'entry' : 'exit');
      if (!mounted) return;
      setState(() {
        _manualFieldOverrides.add(field.field);
        _lastAnalysisMessage = '${field.label} mis à jour.';
      });
      return;
    }

    final controller = TextEditingController(text: field.value ?? '');
    final result = await showModalBottomSheet<_FieldInputResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (sheetContext, setSheetState) {
            final suggestions = _fieldSuggestions(field.field, controller.text);
            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 16,
                bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 16,
              ),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.18),
                      blurRadius: 24,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.edit_outlined,
                            color: AppColors.middenblauw),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            field.label,
                            style: const TextStyle(
                              color: AppColors.donkerblauw,
                              fontSize: 18,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: () => Navigator.pop(sheetContext),
                          icon: const Icon(Icons.close),
                          tooltip: 'Fermer',
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: controller,
                      autofocus: true,
                      minLines: field.wide || field.field == 'notes' ? 2 : 1,
                      maxLines: field.field == 'notes' ? 5 : 3,
                      textInputAction: TextInputAction.done,
                      onChanged: (_) => setSheetState(() {}),
                      onSubmitted: (_) => Navigator.pop(
                        sheetContext,
                        _FieldInputResult.text(controller.text),
                      ),
                      decoration: InputDecoration(
                        hintText:
                            field.hint ?? _dictationExampleFor(field.field),
                        filled: true,
                        fillColor: Colors.grey.shade50,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                    if (suggestions.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final suggestion in suggestions)
                            ActionChip(
                              label: Text(suggestion),
                              avatar: Icon(
                                field.field == 'buddy'
                                    ? Icons.person_outline
                                    : Icons.place_outlined,
                                size: 16,
                              ),
                              onPressed: () => setSheetState(() {
                                controller.text = _applySuggestionTextToField(
                                  field.field,
                                  controller.text,
                                  suggestion,
                                );
                                controller.selection =
                                    TextSelection.fromPosition(
                                  TextPosition(offset: controller.text.length),
                                );
                              }),
                            ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () => Navigator.pop(
                              sheetContext,
                              const _FieldInputResult.dictate(),
                            ),
                            icon: const Icon(Icons.mic),
                            label: const Text('Dicter'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: FilledButton.icon(
                            onPressed: () => Navigator.pop(
                              sheetContext,
                              _FieldInputResult.text(controller.text),
                            ),
                            icon: const Icon(Icons.check),
                            label: const Text('Appliquer'),
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.middenblauw,
                              foregroundColor: Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
    if (!mounted || result == null) return;
    if (result.dictate) {
      await _startFieldDictation(field.field);
      return;
    }
    final changed = _applyDictationField(field.field, result.text);
    setState(() {
      if (changed) _manualFieldOverrides.add(field.field);
      _lastAnalysisMessage = changed
          ? '${field.label} mis à jour.'
          : 'Je n’ai pas reconnu ${field.label.toLowerCase()}.';
    });
  }

  List<String> _fieldSuggestions(String field, String rawQuery) {
    final query = _normalizeDictation(
      field == 'buddy' ? _lastListInputPart(rawQuery) : rawQuery,
    );
    final scored = <({String name, int score})>[];
    if (field == 'buddy') {
      for (final member in _dictationMembers) {
        final name = member.displayName.trim();
        if (name.isEmpty) continue;
        final score = query.isEmpty
            ? 10
            : _personSuggestionScore(query, _normalizeDictation(name));
        if (score < 999) scored.add((name: name, score: score));
      }
      scored.sort((a, b) {
        final scoreCmp = a.score.compareTo(b.score);
        if (scoreCmp != 0) return scoreCmp;
        return a.name.compareTo(b.name);
      });
      return _uniqueStrings(scored.map((s) => s.name).toList())
          .take(6)
          .toList();
    }
    if (field != 'location') return const [];
    for (final location in _dictationLocations) {
      final name = location.name.trim();
      if (name.isEmpty) continue;
      final normalizedName = _normalizeDictation(name);
      final score =
          query.isEmpty ? 10 : _locationSuggestionScore(query, normalizedName);
      if (score < 999) {
        scored.add((name: name, score: score));
      }
    }
    scored.sort((a, b) {
      final scoreCmp = a.score.compareTo(b.score);
      if (scoreCmp != 0) return scoreCmp;
      return a.name.compareTo(b.name);
    });
    return _uniqueStrings(scored.map((s) => s.name).toList()).take(6).toList();
  }

  String _applySuggestionTextToField(
    String field,
    String current,
    String suggestion,
  ) {
    if (field != 'buddy') return suggestion;
    final comma = current.lastIndexOf(',');
    final semicolon = current.lastIndexOf(';');
    final lastSeparator = comma > semicolon ? comma : semicolon;
    if (lastSeparator < 0) return suggestion;
    final prefix = current.substring(0, lastSeparator).trim();
    if (prefix.isEmpty) return suggestion;
    return '$prefix; $suggestion';
  }

  String _lastListInputPart(String value) {
    final parts = value.split(RegExp(r'[,;]'));
    return parts.isEmpty ? value : parts.last.trim();
  }

  int _locationSuggestionScore(String query, String target) {
    if (query.isEmpty || target.isEmpty) return query.isEmpty ? 10 : 999;
    if (target == query) return 0;
    final words = target.split(' ').where((w) => w.isNotEmpty).toList();
    if (words.any((w) => w == query)) return 1;
    if (words.any((w) => w.startsWith(query))) return 2;
    if (query.length >= 4 && target.contains(query)) return 5;
    return 999;
  }

  int _personSuggestionScore(String query, String target) {
    if (query.isEmpty || target.isEmpty) return query.isEmpty ? 10 : 999;
    if (query == target) return 0;
    final queryParts = query.split(' ').where((w) => w.isNotEmpty).toList();
    final targetParts = target.split(' ').where((w) => w.isNotEmpty).toList();
    if (queryParts.isEmpty || targetParts.isEmpty) return 999;
    var score = targetParts.length;
    for (final part in queryParts) {
      if (targetParts.any((t) => t == part)) {
        score += 0;
      } else if (targetParts.any((t) => t.startsWith(part))) {
        score += 2;
      } else {
        return 999;
      }
    }
    return score;
  }

  Future<void> _startFieldDictation(String field) async {
    final index = _guidedSteps.indexWhere((step) => step.field == field);
    if (index < 0) {
      final changed = _applyDictationField(field, 'oui');
      setState(() {
        _lastAnalysisMessage = changed
            ? '${_dictationLabelFor(field)} mis à jour.'
            : '${_dictationLabelFor(field)} non modifié.';
      });
      return;
    }

    if (_listening &&
        _speechMode == _SpeechCaptureMode.guided &&
        _guidedSteps[_guidedStepIndex].field == field) {
      await _toggleSpeechCapture(_SpeechCaptureMode.guided);
      return;
    }

    if (_listening) {
      await _speech.stop();
      if (mounted) {
        setState(() {
          _listening = false;
          _speechPendingText = '';
        });
      }
    }

    setState(() {
      _guidedStepIndex = index;
      _lastAnalysisMessage =
          'Dicte ${_guidedSteps[index].label.toLowerCase()}.';
    });
    await _toggleSpeechCapture(_SpeechCaptureMode.guided);
  }

  Future<void> _toggleSpeechCapture(_SpeechCaptureMode mode) async {
    if (_listening) {
      await _speech.stop();
      _finalizeSpeechCapture();
      return;
    }

    final available = _speechAvailable ||
        await _speech.initialize(
          onStatus: (status) {
            if (!mounted) return;
            if (status == 'done' || status == 'notListening') {
              _finalizeSpeechCapture();
            }
          },
          onError: (error) {
            if (!mounted) return;
            setState(() {
              _listening = false;
              _speechPendingText = '';
            });
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
      _speechMode = mode;
      _speechPendingText = '';
      _dictationOpen = true;
      _dictationListenBase =
          mode == _SpeechCaptureMode.free ? _dictation.text.trim() : '';
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
          _speechPendingText = recognized;
          if (mode == _SpeechCaptureMode.free) {
            _dictation.text = [
              if (_dictationListenBase.isNotEmpty) _dictationListenBase,
              if (recognized.isNotEmpty) recognized,
            ].join(' ');
            _dictation.selection = TextSelection.fromPosition(
              TextPosition(offset: _dictation.text.length),
            );
          }
        });
        if (result.finalResult) {
          _finalizeSpeechCapture();
        }
      },
    );
  }

  void _finalizeSpeechCapture() {
    if (!mounted) return;
    final mode = _speechMode;
    final text = _speechPendingText.trim();
    setState(() {
      _listening = false;
      _speechPendingText = '';
    });
    if (text.isEmpty || mode == _SpeechCaptureMode.free) return;
    _applyGuidedText(text);
  }

  Future<void> _analyzeDictation() async {
    final draft = await _dictationDraftForCurrentText(preferAi: true) ??
        _parseDictatedDive(_dictation.text);
    final detected = _dictationProfileRows(draft)
        .where((f) => f.value != null && f.value!.trim().isNotEmpty)
        .length;
    final requiredMissing = _dictationProfileRows(draft)
        .where(
            (f) => f.required && (f.value == null || f.value!.trim().isEmpty))
        .length;
    setState(() {
      _lastAnalysisMessage = requiredMissing == 0
          ? '$detected champs détectés. Prêt à remplir.'
          : '$detected champs détectés, $requiredMissing à compléter.';
    });
  }

  Future<void> _applyDictationAndOpenForm() async {
    if (_dictation.text.trim().isNotEmpty) {
      final draft = await _dictationDraftForCurrentText(preferAi: true) ??
          _parseDictatedDive(_dictation.text);
      _applyDictationDraft(draft);
    }
    if (!_canSubmit) {
      final draft = _aiDictationDraft ?? _parseDictatedDive(_dictation.text);
      final requiredMissing = _dictationProfileRows(draft)
          .where(
              (f) => f.required && (f.value == null || f.value!.trim().isEmpty))
          .length;
      setState(() {
        _lastAnalysisMessage = requiredMissing == 0
            ? 'Complète encore le lieu avant d’enregistrer.'
            : '$requiredMissing champ obligatoire à compléter.';
      });
      return;
    }
    setState(() {
      _dictationAppliedToForm = true;
      _lastAnalysisMessage = null;
    });
  }

  Future<_DictatedDiveDraft?> _dictationDraftForCurrentText({
    required bool preferAi,
  }) async {
    final text = _dictation.text.trim();
    if (text.isEmpty || !preferAi) return null;
    if (_aiDictationText == text && _aiDictationDraft != null) {
      return _aiDictationDraft;
    }

    final userId = context.read<AuthProvider>().currentUser?.uid;
    if (userId == null) return null;

    setState(() {
      _analyzingDictation = true;
      _lastAnalysisMessage = 'Analyse IA en cours...';
    });
    try {
      final result = await FirebaseFunctions.instanceFor(region: 'europe-west1')
          .httpsCallable('analyzeLogbookDictation')
          .call({
        'clubId': FirebaseConfig.defaultClubId,
        'text': text,
        'defaultYear': DateTime.now().year,
        'currentDiveNumber': int.tryParse(_diveNumber.text.trim()),
        'lockedFields': _manualFieldOverrides.toList(),
      });
      final draft = _draftFromAiResult(result.data);
      if (!mounted) return draft;
      setState(() {
        _aiDictationText = text;
        _aiDictationDraft = draft;
        _lastAnalysisMessage = 'Analyse IA terminée.';
      });
      return draft;
    } on FirebaseFunctionsException catch (e) {
      debugPrint('[LogbookEntry] AI dictation failed: ${e.code} ${e.message}');
      if (mounted) {
        setState(() {
          _lastAnalysisMessage =
              'Analyse IA indisponible, analyse locale utilisée.';
        });
      }
      return null;
    } catch (e) {
      debugPrint('[LogbookEntry] AI dictation failed: $e');
      if (mounted) {
        setState(() {
          _lastAnalysisMessage =
              'Analyse IA indisponible, analyse locale utilisée.';
        });
      }
      return null;
    } finally {
      if (mounted) setState(() => _analyzingDictation = false);
    }
  }

  _DictatedDiveDraft _draftFromAiResult(dynamic raw) {
    final root = Map<String, dynamic>.from(raw as Map);
    final fields = Map<String, dynamic>.from((root['fields'] as Map?) ?? {});
    final locationMap = fields['location'] is Map
        ? Map<String, dynamic>.from(fields['location'] as Map)
        : null;
    final countersMap =
        Map<String, dynamic>.from((fields['counters'] as Map?) ?? {});

    return _DictatedDiveDraft(
      diveNumber: _aiInt(fields['diveNumber']),
      date: _aiDate(fields['date']),
      entryTime: _aiTime(fields['entryTime']),
      exitTime: _aiTime(fields['exitTime']),
      locationName: locationMap?['name'] as String?,
      locationSelection: locationMap == null
          ? null
          : DiveLocationSelection(
              id: locationMap['id'] as String?,
              name: (locationMap['name'] as String?) ?? '',
              country: locationMap['country'] as String?,
              isSea: locationMap['isSea'] == true,
            ),
      depthMeters: _aiDouble(fields['depthMeters']),
      durationMinutes: _aiInt(fields['durationMinutes']),
      binomes: _aiBinomes(fields['buddies']),
      tankVolumeL: _aiDouble(fields['tankVolumeL']),
      lestageKg: _aiDouble(fields['lestageKg']),
      counters: LogbookCounters(
        exo: _aiBool(countersMap['exo']),
        nitrox: _aiBool(countersMap['nitrox']),
        deco: _aiBool(countersMap['deco']),
        dp: _aiBool(countersMap['dp']),
        sf: _aiBool(countersMap['sf']),
        nuit: _aiBool(countersMap['nuit']),
        mer: _aiBool(countersMap['mer']),
      ),
      fauna: _aiStringList(fields['fauna']),
      notesParts: _aiStringList(fields['notesParts']),
    );
  }

  int? _aiInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.round();
    if (value is String) return int.tryParse(value.trim());
    return null;
  }

  double? _aiDouble(dynamic value) {
    if (value is num) return value.toDouble();
    if (value is String) return double.tryParse(value.replaceAll(',', '.'));
    return null;
  }

  bool? _aiBool(dynamic value) => value is bool ? value : null;

  DateTime? _aiDate(dynamic value) {
    if (value is! String || value.trim().isEmpty) return null;
    final parsed = DateTime.tryParse(value.trim());
    if (parsed == null) return null;
    return DateTime(parsed.year, parsed.month, parsed.day);
  }

  TimeOfDay? _aiTime(dynamic value) {
    if (value is! String || value.trim().isEmpty) return null;
    final match = RegExp(r'^(\d{1,2}):(\d{2})$').firstMatch(value.trim());
    if (match == null) return null;
    final hour = int.tryParse(match.group(1)!);
    final minute = int.tryParse(match.group(2)!);
    if (hour == null || minute == null) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return TimeOfDay(hour: hour, minute: minute);
  }

  List<String> _aiStringList(dynamic value) {
    if (value is! List) return const [];
    return value
        .whereType<String>()
        .map((v) => v.trim())
        .where((v) => v.isNotEmpty)
        .toList();
  }

  List<BinomeSelection> _aiBinomes(dynamic value) {
    if (value is! List) return const [];
    final out = <BinomeSelection>[];
    for (final raw in value) {
      if (raw is! Map) continue;
      final map = Map<String, dynamic>.from(raw);
      final name = (map['displayName'] as String? ?? '').trim();
      if (name.isEmpty) continue;
      final memberId = (map['memberId'] as String?)?.trim();
      if (memberId != null && memberId.isNotEmpty) {
        out.add(BinomeSelection.member(memberId: memberId, displayName: name));
      } else {
        out.add(BinomeSelection.external(displayName: name));
      }
    }
    return out;
  }

  void _applyDictationDraft(_DictatedDiveDraft draft) {
    final timingTouches = <String>[];
    setState(() {
      if (_canApplyDictationField('dive_number') && draft.diveNumber != null) {
        _diveNumber.text = draft.diveNumber.toString();
      }
      if (_canApplyDictationField('date') && draft.date != null) {
        _date = draft.date!;
      }
      if (_canApplyDictationField('entry_time') && draft.entryTime != null) {
        _entryTime = draft.entryTime;
        timingTouches.add('entry');
      }
      if (_canApplyDictationField('exit_time') && draft.exitTime != null) {
        _exitTime = draft.exitTime;
        timingTouches.add('exit');
      }
      if (_canApplyDictationField('location')) {
        final location = draft.locationSelection ??
            (draft.locationName == null || draft.locationName!.isEmpty
                ? null
                : DiveLocationSelection(
                    name: draft.locationName!,
                    isSea: _looksLikeSeaLocation(draft.locationName!),
                  ));
        if (location != null) {
          _locationSelection = location;
          if (_locationSelection!.isSea && _canApplyDictationField('mer')) {
            _counters = _counters.copyWith(mer: true);
          }
        }
      }
      if (_canApplyDictationField('depth') && draft.depthMeters != null) {
        _depth.text = _fmtNum(draft.depthMeters!);
      }
      if (_canApplyDictationField('duration') &&
          draft.durationMinutes != null) {
        _setDurationSilent(draft.durationMinutes.toString());
        timingTouches.add('duration');
      }
      if (_canApplyDictationField('tank') && draft.tankVolumeL != null) {
        _tank = TankSelection(
          volumeL: draft.tankVolumeL!,
          pressureBar: 200,
          label: '${_fmtNum(draft.tankVolumeL!)} L',
        );
      }
      if (_canApplyDictationField('lestage') && draft.lestageKg != null) {
        _lestage.text = _fmtNum(draft.lestageKg!);
      }
      _counters = _mergeCounters(
        _counters,
        _withoutManualCounterOverrides(draft.counters),
      );
      if (_canApplyDictationField('buddy') && draft.binomes.isNotEmpty) {
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
      if (_canApplyDictationField('notes')) {
        final notes = <String>[
          if (_notes.text.trim().isNotEmpty) _notes.text.trim(),
          if (draft.fauna.isNotEmpty)
            'Faune observée: ${draft.fauna.join(', ')}.',
          ...draft.notesParts,
        ];
        _notes.text = _dedupeSentences(notes).join('\n');
      }
      _dictationOpen = true;
    });
    for (final key in timingTouches) {
      _touchTiming(key);
    }
    _resolveMissingTiming();
  }

  void _applyGuidedText(String text) {
    final step = _guidedSteps[_guidedStepIndex];
    final changed = _applyDictationField(step.field, text);
    setState(() {
      if (changed) _manualFieldOverrides.add(step.field);
      _lastAnalysisMessage = changed
          ? '${step.label} mis à jour.'
          : 'Je n’ai pas reconnu ${step.label.toLowerCase()}.';
      if (changed) {
        _guidedStepIndex = (_guidedStepIndex + 1) % _guidedSteps.length;
      }
    });
  }

  bool _canApplyDictationField(String field) =>
      !_manualFieldOverrides.contains(field);

  LogbookCounters _withoutManualCounterOverrides(LogbookCounters counters) {
    return LogbookCounters(
      exo: _canApplyDictationField('exo') ? counters.exo : null,
      nitrox: _canApplyDictationField('nitrox') ? counters.nitrox : null,
      deco: _canApplyDictationField('deco') ? counters.deco : null,
      dp: _canApplyDictationField('dp') ? counters.dp : null,
      sf: _canApplyDictationField('sf') ? counters.sf : null,
      nuit: _canApplyDictationField('nuit') ? counters.nuit : null,
      mer: _canApplyDictationField('mer') ? counters.mer : null,
    );
  }

  bool _applyDictationField(String field, String value) {
    final raw = value.trim();
    if (raw.isEmpty) return false;
    final normalized = _normalizeDictation(raw);

    switch (field) {
      case 'dive_number':
        final n = _numberFromSpeech(raw);
        if (n == null || n <= 0) return false;
        setState(() => _diveNumber.text = n.round().toString());
        return true;
      case 'date':
        final date = _parseDictatedDate(normalized);
        if (date == null) return false;
        setState(() => _date = date);
        return true;
      case 'location':
        final location = _matchDictatedLocation(raw, normalized);
        if (location == null) return false;
        setState(() {
          _locationSelection = location;
          if (location.isSea) _counters = _counters.copyWith(mer: true);
        });
        return true;
      case 'entry_time':
        final time = _timeFromSpeech(raw);
        if (time == null) return false;
        setState(() => _entryTime = time);
        _touchTiming('entry');
        return true;
      case 'exit_time':
        final time = _timeFromSpeech(raw);
        if (time == null) return false;
        setState(() => _exitTime = time);
        _touchTiming('exit');
        return true;
      case 'depth':
        final n = _numberFromSpeech(raw);
        if (n == null) return false;
        setState(() => _depth.text = _fmtNum(n));
        return true;
      case 'duration':
        final n = _numberFromSpeech(raw);
        if (n == null) return false;
        setState(() => _setDurationSilent(n.round().toString()));
        _touchTiming('duration');
        return true;
      case 'buddy':
        final names = raw
            .split(RegExp(r'\s+(?:en|et|and|avec|met)\s+|[,;]'))
            .map(_cleanDictatedName)
            .where((name) => name.isNotEmpty)
            .toList();
        if (names.isEmpty) return false;
        final existing = _binomes
            .map((b) => _normalizeDictation(b.displayName ?? b.chipLabel))
            .toSet();
        final additions = <BinomeSelection>[];
        for (final name in names) {
          final binome = _matchDictatedBuddy(name);
          if (existing.add(
              _normalizeDictation(binome.displayName ?? binome.chipLabel))) {
            additions.add(binome);
          }
        }
        if (additions.isEmpty) return false;
        setState(() => _binomes = [..._binomes, ...additions]);
        return true;
      case 'notes':
        setState(() {
          final next = [if (_notes.text.trim().isNotEmpty) _notes.text, raw];
          _notes.text = _dedupeSentences(next).join('\n');
        });
        return true;
      case 'tank':
        final n = _numberFromSpeech(raw);
        if (n == null) return false;
        setState(() {
          _tank = TankSelection(
            volumeL: n,
            pressureBar: 200,
            label: '${_fmtNum(n)} L',
          );
        });
        return true;
      case 'lestage':
        final n = _numberFromSpeech(raw);
        if (n == null) return false;
        setState(() => _lestage.text = _fmtNum(n));
        return true;
      case 'exo':
      case 'nitrox':
      case 'deco':
      case 'dp':
      case 'sf':
      case 'nuit':
      case 'mer':
        final enabled = !_isNegativeDictation(raw);
        setState(() => _counters = _setCounter(_counters, field, enabled));
        return true;
    }
    return false;
  }

  bool _isNegativeDictation(String raw) {
    final normalized = _normalizeDictation(raw);
    return RegExp(r'\b(non|nee|nein|no|pas|geen|zonder|sans)\b')
        .hasMatch(normalized);
  }

  LogbookCounters _setCounter(
    LogbookCounters counters,
    String field,
    bool value,
  ) {
    switch (field) {
      case 'exo':
        return counters.copyWith(exo: value);
      case 'nitrox':
        return counters.copyWith(nitrox: value);
      case 'deco':
        return counters.copyWith(deco: value);
      case 'dp':
        return counters.copyWith(dp: value);
      case 'sf':
        return counters.copyWith(sf: value);
      case 'nuit':
        return counters.copyWith(nuit: value);
      case 'mer':
        return counters.copyWith(mer: value);
      default:
        return counters;
    }
  }

  double? _numberFromSpeech(String raw) {
    final normalized = _normalizeDictation(raw);
    return _firstNumberForPatterns(normalized, [
      RegExp(r'\b(\d+(?:[\.,]\d+)?)\b'),
    ]);
  }

  TimeOfDay? _timeFromSpeech(String raw) {
    final normalized = _normalizeDictation(raw);
    final match = RegExp(
      r'\b(\d{1,2})\s*(?:h|heure|heures|uur|:)\s*(\d{1,2})?\b',
    ).firstMatch(normalized);
    if (match == null) return null;
    final hour = int.tryParse(match.group(1)!);
    final minute = int.tryParse(match.group(2) ?? '0') ?? 0;
    if (hour == null || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }
    return TimeOfDay(hour: hour, minute: minute);
  }

  String _dictationLabelFor(String field) {
    switch (field) {
      case 'date':
        return 'Date';
      case 'dive_number':
        return 'N°';
      case 'location':
        return 'Lieu';
      case 'entry_time':
        return 'Immersion';
      case 'exit_time':
        return 'Sortie';
      case 'depth':
        return 'Profondeur';
      case 'duration':
        return 'Durée';
      case 'buddy':
        return 'Binôme';
      case 'tank':
        return 'Bouteille';
      case 'lestage':
        return 'Lestage';
      case 'exo':
        return 'Formation';
      case 'nitrox':
        return 'Nitrox';
      case 'deco':
        return 'Déco';
      case 'dp':
        return 'DP';
      case 'sf':
        return 'SF';
      case 'nuit':
        return 'Nuit';
      case 'mer':
        return 'Mer';
      default:
        return 'Notes';
    }
  }

  String _dictationExampleFor(String field) {
    for (final step in _guidedSteps) {
      if (step.field == field) return step.example;
    }
    return 'Tape une valeur ou utilise Dicter';
  }

  Widget _dateTimeCard() {
    return _whiteCard(
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                flex: 4,
                child: _diveNumberField(),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 6,
                child: _datePickerField(),
              ),
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

  Widget _diveNumberField() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.middenblauw.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: AppColors.middenblauw.withValues(alpha: 0.28),
        ),
      ),
      child: Row(
        children: [
          const Icon(Icons.tag, color: AppColors.middenblauw, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'N° PLONGÉE',
                  style: TextStyle(
                    fontSize: 9.5,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.8,
                    color: Colors.grey.shade700,
                  ),
                ),
                const SizedBox(height: 2),
                TextField(
                  controller: _diveNumber,
                  keyboardType: TextInputType.number,
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                  decoration: InputDecoration(
                    hintText: '—',
                    hintStyle: TextStyle(
                      color: Colors.grey.shade400,
                      fontWeight: FontWeight.w700,
                    ),
                    border: InputBorder.none,
                    isDense: true,
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _datePickerField() {
    return InkWell(
      onTap: _pickDate,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.middenblauw.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: AppColors.middenblauw.withValues(alpha: 0.28),
          ),
        ),
        child: Row(
          children: [
            const Icon(Icons.calendar_today_outlined,
                color: AppColors.middenblauw, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'DATE',
                    style: TextStyle(
                      fontSize: 9.5,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 0.8,
                      color: Colors.grey.shade600,
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
            Icon(Icons.unfold_more, color: Colors.grey.shade400),
          ],
        ),
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
    return _dictation.text.trim().isNotEmpty ||
        _locationSelection?.name.trim().isNotEmpty == true ||
        _depth.text.trim().isNotEmpty ||
        _duration.text.trim().isNotEmpty ||
        _diveNumber.text.trim().isNotEmpty ||
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
            r'(?:duree|duration|duur)\s+(?:totale?|total|de|van|ongeveer|environ)?\s*(\d+(?:[\.,]\d+)?)\b',
            caseSensitive: false,
          ),
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
      r"(?:gedoken met|buddy(?:s)?|bin[oô]mes?|binome c est|binome etait|binome was|avec\s+(?!\d)|met\s+(?!\d))\s+(.+?)(?=,?\s+(?:lieu|plaats|locatie|location|site|profondeur|profond|diepte|depth|duree|durée|duur|duration|j\s*[’\']?ai\s+vu|vu|gezien|seen|j avais|ik had|een|une|un)?\s*(?:bouteille|fles|tank|lestage|poids|gewicht|plombee|plongee deco)\b|,?\s+(?:lieu|plaats|locatie|location|site|profondeur|profond|diepte|depth|duree|durée|duur|duration|j\s*[’\']?ai\s+vu|vu|gezien|seen)\b|\.|;|$)",
      caseSensitive: false,
    );
    _collectDictatedBuddies(text, buddyRx, buddies);
    final fallbackBuddyRx = RegExp(
      r"\b(?:manger|mange|mangé|manager|manche|mangeait|plonge(?:r|ait)?|duik(?:en)?)?\s*(?:avec|met)\s+(.+?)(?=,?\s+(?:lieu|plaats|locatie|location|site|profondeur|profond|diepte|depth|duree|durée|duur|duration|j\s*[’\']?ai\s+vu|vu|gezien|seen)\b|[.;]|$)",
      caseSensitive: false,
    );
    _collectDictatedBuddies(text, fallbackBuddyRx, buddies);

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

    final spokenNumeric = RegExp(
      r'\b(?:date\s+)?(\d{1,2})\s+(?:du|de|d|sur)\s+(\d{1,2})(?:\s+(\d{2,4}))?\b',
    ).firstMatch(normalized);
    if (spokenNumeric != null) {
      final day = int.tryParse(spokenNumeric.group(1)!);
      final month = int.tryParse(spokenNumeric.group(2)!);
      var year = int.tryParse(spokenNumeric.group(3) ?? today.year.toString());
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
              r'(?:\s+(?:de|d|a|à|om|l|eau|water))*\s*:?\s*(\d{1,2})\s*(?:h|heure|heures|uur|:)\s*(\d{1,2})?\b',
        ),
        RegExp(
          r'\b' +
              escaped +
              r'(?:\s+(?:de|d|a|à|om|l|eau|water))*\s*:?\s*(\d{1,2})\s*(?:h|heure|heures|uur)\b',
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

  void _collectDictatedBuddies(
    String text,
    RegExp regex,
    List<String> buddies,
  ) {
    for (final match in regex.allMatches(text)) {
      final chunk = match.group(1)?.trim() ?? '';
      if (chunk.isEmpty) continue;
      for (final part in chunk.split(RegExp(r'\s+(?:en|et|and)\s+|[,;]'))) {
        final name = _cleanDictatedName(part);
        if (name.isNotEmpty) buddies.add(name);
      }
    }
  }

  String? _extractDictatedLocation(String text) {
    final cleaned = text.replaceAll('\n', ' ').trim();
    if (cleaned.isEmpty) return null;

    final explicit = RegExp(
      r'\b(?:le\s+)?(?:lieu|plaats|locatie|location|site)\s*(?:est|et|is|:)?\s+(.+?)(?=\s+\b(?:profondeur|profond|diepte|depth|duree|durée|duur|duration|bin[oô]mes?|buddy|buddies|bouteille|fles|tank|lestage|poids|gewicht|notes?|vu|gezien)\b|[.;]|$)',
      caseSensitive: false,
    ).firstMatch(cleaned);
    if (explicit != null) {
      final value = explicit.group(1)?.trim();
      if (value != null && value.isNotEmpty) {
        return _cleanDictatedLocation(value);
      }
    }

    return null;
  }

  String _cleanDictatedLocation(String value) {
    return value
        .replaceAll(
          RegExp(
            r'\b(?:date|le|la|les|du|de|d)\s+\d{1,2}\s+(?:du|de|d|sur)?\s*\d{1,2}(?:\s+\d{2,4})?\b',
            caseSensitive: false,
          ),
          ' ',
        )
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim()
        .replaceFirst(
          RegExp(r'^(?:le\s+)?(?:lieu|plaats|locatie|location|site)\s+',
              caseSensitive: false),
          '',
        )
        .replaceFirst(
            RegExp(r'^(?:est|et|is|a|à|:)\s+', caseSensitive: false), '')
        .replaceAll(RegExp(r'[,.。]+$'), '');
  }

  DiveLocationSelection? _matchDictatedLocation(
    String? rawLocation,
    String normalizedFullText,
  ) {
    final source = rawLocation;
    if (source == null || source.trim().isEmpty) return null;
    final alias = _locationAlias(_normalizeDictation(source));
    if (alias != null) {
      return DiveLocationSelection(
        name: alias,
        isSea: _looksLikeSeaLocation(alias),
      );
    }
    final sourceNorm = _normalizeDictation(source);
    _DictationLocation? best;
    var bestScore = 999;
    for (final location in _dictationLocations) {
      final score =
          _locationMatchScore(sourceNorm, _normalizeDictation(location.name));
      if (score < bestScore) {
        best = location;
        bestScore = score;
      }
    }
    if (best != null && bestScore < 999) {
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

  int _locationMatchScore(String source, String target) {
    if (source.isEmpty || target.isEmpty) return 999;
    if (source == target) return 0;
    final sourceParts = _locationMatchParts(source);
    final targetParts = _locationMatchParts(target);
    if (sourceParts.isEmpty || targetParts.isEmpty) return 999;

    if (sourceParts.length == 1) {
      final token = sourceParts.first;
      if (targetParts.any((t) => t == token)) return 5;
      if (token.length >= 3 && targetParts.any((t) => t.startsWith(token))) {
        return 15;
      }
      return 999;
    }

    final exactOverlap =
        sourceParts.where((s) => targetParts.any((t) => s == t)).length;
    if (exactOverlap == sourceParts.length) {
      return 10 + (targetParts.length - exactOverlap).clamp(0, 20);
    }
    if (exactOverlap >= 2) return 40 - exactOverlap;
    final fuzzyOverlap = sourceParts
        .where((s) => targetParts.any((t) => _levenshtein(s, t) <= 1))
        .length;
    if (fuzzyOverlap >= 2) return 60 - fuzzyOverlap;
    return 999;
  }

  List<String> _locationMatchParts(String value) {
    const stop = {
      'date',
      'lieu',
      'plaats',
      'locatie',
      'location',
      'site',
      'profondeur',
      'duree',
      'durée',
      'binome',
      'binomes',
      'buddy',
      'buddies',
      'notes',
      'note',
      'vu',
      'gezien',
      'est',
      'et',
      'is',
      'the',
      'le',
      'la',
      'les',
      'de',
      'du',
      'des',
      'a',
      'à',
    };
    return value
        .split(' ')
        .where((p) => p.length >= 3)
        .where((p) => int.tryParse(p) == null)
        .where((p) => !stop.contains(p))
        .toList();
  }

  String? _locationAlias(String normalizedText) {
    if (normalizedText.contains('danza hot') ||
        normalizedText.contains('danza')) {
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
    final sourceParts = source.split(' ').where((p) => p.length >= 3).toList();
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
    if (best != null &&
        bestScore < 999 &&
        _isReliableBuddyMatch(sourceParts, best)) {
      return BinomeSelection.member(
        memberId: best.id,
        displayName: best.displayName,
      );
    }
    return BinomeSelection.external(displayName: rawName);
  }

  bool _isReliableBuddyMatch(
      List<String> sourceParts, _DictationMember member) {
    if (sourceParts.isEmpty) return false;
    final memberParts = _normalizeDictation(member.displayName)
        .split(' ')
        .where((p) => p.length >= 3)
        .toList();
    final strongOverlap = sourceParts
        .where((s) => memberParts.any((m) => _personTokenMatches(s, m)))
        .length;
    if (sourceParts.length >= 2) return strongOverlap >= 2;
    final exactOverlap =
        sourceParts.where((s) => memberParts.any((m) => s == m)).length;
    return exactOverlap >= 1 && memberParts.length == 1;
  }

  int _matchScore(String source, String target) {
    if (source.isEmpty || target.isEmpty) return 999;
    if (source == target) return 0;
    final sourceParts = source.split(' ').where((p) => p.length >= 3).toList();
    final targetParts = target.split(' ').where((p) => p.length >= 3).toList();
    if (sourceParts.isEmpty || targetParts.isEmpty) return 999;
    if (sourceParts.length == 1) {
      final token = sourceParts.first;
      if (targetParts.length == 1 && targetParts.first == token) return 1;
      return 999;
    }
    var score = targetParts.length;
    for (final part in sourceParts) {
      final exact = targetParts.any((t) => t == part);
      final strong = targetParts.any((t) => _personTokenMatches(part, t));
      if (exact) {
        score += 0;
      } else if (strong) {
        score += 8;
      } else {
        return 999;
      }
    }
    return score;
  }

  bool _personTokenMatches(String source, String target) {
    if (source == target) return true;
    if (source.length >= 3 && target.startsWith(source)) return true;
    if (target.length >= 3 && source.startsWith(target)) return true;
    final maxDistance = source.length <= 5 || target.length <= 5 ? 1 : 2;
    return _levenshtein(source, target) <= maxDistance;
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
              r'\b(?:lieu|plaats|locatie|location|site|profondeur|profond|diepte|depth|duree|durée|duur|duration|bouteille|fles|tank|lestage|poids|gewicht|kg|kilo|kilos).*$',
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
      final explicitDiveNumber = await _resolveDiveNumberForSave(
        clubId: clubId,
        userId: userId,
      );
      final extras = <String, dynamic>{
        ...?widget.createExtras,
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
        if (explicitDiveNumber != null && explicitDiveNumber > 0)
          'dive_number': explicitDiveNumber,
        if (widget.mode == LogbookEntryMode.edit && explicitDiveNumber == null)
          'dive_number': FieldValue.delete(),
      };

      final source = widget.mode == LogbookEntryMode.auto
          ? 'calypso_operation'
          : (widget.mode == LogbookEntryMode.edit
              ? (widget.initialData?['source'] as String?) ?? 'manual'
              : widget.sourceOverride ?? 'manual');

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
  final String field;
  final String label;
  final bool required;
  final String? value;
  final String? hint;
  final bool wide;

  const _DictationField({
    required this.field,
    required this.label,
    this.required = false,
    this.value,
    this.hint,
    this.wide = false,
  });
}

class _FieldInputResult {
  final String text;
  final bool dictate;

  const _FieldInputResult.text(this.text) : dictate = false;
  const _FieldInputResult.dictate()
      : text = '',
        dictate = true;
}

class _GuidedDictationStep {
  final String field;
  final String label;
  final String prompt;
  final String example;

  const _GuidedDictationStep({
    required this.field,
    required this.label,
    required this.prompt,
    required this.example,
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

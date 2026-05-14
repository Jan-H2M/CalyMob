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
  /// Entry id when mode == edit.
  final String? entryId;
  /// Raw Firestore map when mode == edit — used to prefill every field.
  final Map<String, dynamic>? initialData;

  const LogbookEntryScreen.auto({super.key, required this.task})
      : mode = LogbookEntryMode.auto,
        entryId = null,
        initialData = null;

  const LogbookEntryScreen.manual({super.key})
      : task = null,
        entryId = null,
        initialData = null,
        mode = LogbookEntryMode.manual;

  const LogbookEntryScreen.edit({
    super.key,
    required String this.entryId,
    required Map<String, dynamic> this.initialData,
  })  : task = null,
        mode = LogbookEntryMode.edit;

  @override
  State<LogbookEntryScreen> createState() => _LogbookEntryScreenState();
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
  List<BinomeSelection> _binomes = const [];
  LogbookCounters _counters = const LogbookCounters();
  CombiSelection? _combi;
  TankSelection? _tank;
  bool _submitting = false;

  /// Triple-binding anchor: tracks which two of (entry / exit / duration) the
  /// user touched most recently. The third one is derived from the other two.
  /// Keys: 'entry', 'exit', 'duration'.
  final List<String> _timingAnchor = <String>[];
  bool _suppressDurationListener = false;

  @override
  void initState() {
    super.initState();
    _duration.addListener(_onDurationChanged);
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
          final id = b['memberId'] as String?;
          final name = b['displayName'] as String?;
          if (id != null && name != null) {
            out.add(BinomeSelection.member(memberId: id, displayName: name));
          }
        } else {
          out.add(BinomeSelection.external(
            displayName: b['displayName'] as String?,
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
          out.add(BinomeSelection.member(memberId: memberId, displayName: name));
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
          final title = (data['titre'] as String?) ?? (data['title'] as String?);
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
          final plannedRole = pal.data()?['planned_role'] as Map<String, dynamic>?;
          final userId = context.read<AuthProvider>().currentUser?.uid;
          if (plannedRole != null && userId != null) {
            final myRole = plannedRole[userId] as String?;
            if (myRole == 'dp') setState(() => _counters = _counters.copyWith(dp: true));
            if (myRole == 'sf') setState(() => _counters = _counters.copyWith(sf: true));
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
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final userId = context.read<AuthProvider>().currentUser?.uid;
    return Scaffold(
      extendBody: true,
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          bottom: false,
          child: Stack(
            children: [
              ListView(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 140),
                children: [
                  _header(),
                  if (widget.mode == LogbookEntryMode.auto) _autoBanner(),
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
                ],
              ),
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
    );
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
            onPressed: () => Navigator.pop(context),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isEdit
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
                  isEdit
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
          color: value != null ? AppColors.middenblauw.withValues(alpha: 0.10) : Colors.grey.shade50,
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
                  color: value != null ? AppColors.middenblauw : Colors.grey.shade400,
                ),
                const SizedBox(width: 4),
                Text(
                  value != null ? _formatTime(value) : '—:—',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: value != null ? AppColors.donkerblauw : Colors.grey.shade400,
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
    const items = <Map<String, String>>[
      {'key': 'exo', 'label': 'Exo'},
      {'key': 'nitrox', 'label': 'Nitrox'},
      {'key': 'deco', 'label': 'Déco'},
      {'key': 'dp', 'label': 'DP'},
      {'key': 'sf', 'label': 'SF'},
      {'key': 'nuit', 'label': 'Nuit'},
      {'key': 'mer', 'label': 'Mer'},
    ];
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: items.map((item) {
        final on = _counters.isOn(item['key']!);
        return ChoiceChip(
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
      }).toList(),
    );
  }

  Widget _equipmentSection(String? userId) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Combi (suit catalogue — same pattern as the tank picker)
        Text(
          'COMBINAISON',
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.bold,
            color: Colors.grey.shade600,
            letterSpacing: 1,
          ),
        ),
        const SizedBox(height: 4),
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
        const Divider(height: 22),
        // Bouteille
        Text(
          'BOUTEILLE',
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.bold,
            color: Colors.grey.shade600,
            letterSpacing: 1,
          ),
        ),
        const SizedBox(height: 4),
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
        const Divider(height: 22),
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
            Icon(Icons.fitness_center,
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
      padding: padding ?? const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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

  String _formatDate(DateTime d) {
    const months = [
      'jan', 'fév', 'mar', 'avr', 'mai', 'juin',
      'juil', 'août', 'sept', 'oct', 'nov', 'déc'
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

  Future<void> _save() async {
    if (!_canSubmit) return;
    setState(() => _submitting = true);
    try {
      final auth = context.read<AuthProvider>();
      final memberProvider = context.read<MemberProvider>();
      final userId = auth.currentUser?.uid;
      if (userId == null) throw 'Session non identifiée';

      const clubId = FirebaseConfig.defaultClubId;
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
          'exit_time':
              Timestamp.fromDate(_composeDateTime(_date, _exitTime!)),
        if (_entryTime != null) 'entry_time_str': _formatTime(_entryTime!),
        if (_exitTime != null) 'exit_time_str': _formatTime(_exitTime!),
        if (_combi != null) 'combi': _combi!.toMap(),
        // Keep legacy combi_type for backwards compat with the first
        // iteration (chips-only) — readers may still inspect this field.
        if (_combi != null) 'combi_type': _combi!.type,
        if (_tank != null) 'tank': _tank!.toMap(),
        if (lestage != null && lestage > 0) 'lestage_kg': lestage,
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

      if (widget.mode == LogbookEntryMode.edit && widget.entryId != null) {
        await _service.update(
          clubId: clubId,
          entryId: widget.entryId!,
          entry: entry,
          extras: extras,
        );
      } else {
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
        Navigator.of(context).pop();
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
        title: const Row(
          children: [
            Icon(Icons.delete_outline, color: Colors.red),
            SizedBox(width: 8),
            Text('Supprimer cette plongée ?'),
          ],
        ),
        content: const Text(
          "Cette action est définitive — la plongée disparaît "
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

/// Carnet de Formation — Logbook entry screen.
///
/// Two modes :
///   - `auto`   : opened from a `logbook_completion` formation_task — pre-fills
///                date, location, palanquée and counter defaults from the
///                operation context.
///   - `manual` : opened directly from the Profile / Mon carnet drawer — blank
///                form, the student fills everything.
///
/// Implements the "Counter pattern" UI (tech doc §7) : seven chips, no Jour,
/// no Air. The chips for `dp`, `sf`, `mer` are auto-checked from the palanquée
/// + DiveLocation when in auto mode.
///
/// Spec : `CARNET_DE_FORMATION_TECH.md` v2.1 §11.2 (mockup 03).

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
import '../../widgets/ocean/ocean_gradient_background.dart';

enum LogbookEntryMode { auto, manual }

class LogbookEntryScreen extends StatefulWidget {
  final LogbookEntryMode mode;
  final FormationTask? task; // required when mode == auto

  const LogbookEntryScreen.auto({super.key, required this.task})
      : mode = LogbookEntryMode.auto;

  const LogbookEntryScreen.manual({super.key})
      : task = null,
        mode = LogbookEntryMode.manual;

  @override
  State<LogbookEntryScreen> createState() => _LogbookEntryScreenState();
}

class _LogbookEntryScreenState extends State<LogbookEntryScreen> {
  final StudentLogbookService _service = StudentLogbookService();
  final FormationTaskService _taskService = FormationTaskService();

  DateTime _date = DateTime.now();
  final TextEditingController _location = TextEditingController();
  final TextEditingController _depth = TextEditingController();
  final TextEditingController _duration = TextEditingController();
  final TextEditingController _notes = TextEditingController();
  final TextEditingController _buddyName = TextEditingController();
  LogbookCounters _counters = const LogbookCounters();
  String? _locationId;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    if (widget.mode == LogbookEntryMode.auto && widget.task != null) {
      _prefillFromTask();
    }
  }

  Future<void> _prefillFromTask() async {
    final ctx = widget.task!.context;
    setState(() {
      _location.text = ctx.operationTitle ?? '';
      _locationId = ctx.locationId;
    });

    // Try to read the operation and palanquée for richer prefill.
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
          _location.text = data['titre'] ?? data['title'] ?? _location.text;
        }
      } catch (_) {/* graceful */}
    }

    // Read DiveLocation to set the `mer` chip default.
    if (ctx.locationId != null) {
      try {
        final loc = await FirebaseFirestore.instance
            .collection('clubs')
            .doc(clubId)
            .collection('dive_locations')
            .doc(ctx.locationId!)
            .get();
        if (loc.exists) {
          final waterType = loc.data()?['water_type'] as String?;
          if (waterType == 'sea') {
            setState(() => _counters = _counters.copyWith(mer: true));
          }
        }
      } catch (_) {/* graceful */}
    }

    // Read palanquée to default `dp`/`sf` from planned_role
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
    _location.dispose();
    _depth.dispose();
    _duration.dispose();
    _notes.dispose();
    _buddyName.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _header(),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 110),
                  children: [
                    if (widget.mode == LogbookEntryMode.auto) _autoBanner(),
                    const SizedBox(height: 12),
                    _sectionTitle('LIEU'),
                    _whiteCard(
                      child: TextField(
                        controller: _location,
                        readOnly: widget.mode == LogbookEntryMode.auto,
                        decoration: const InputDecoration(
                          hintText: 'Ex: Vodelée',
                          border: InputBorder.none,
                        ),
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
                              decoration: const InputDecoration(
                                hintText: 'Profondeur (m)',
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
                              decoration: const InputDecoration(
                                hintText: 'Durée (min)',
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
                    const SizedBox(height: 6),
                    Text(
                      'Pas de Jour : c\'est par défaut quand Nuit n\'est pas coché.',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.7),
                        fontSize: 11.5,
                      ),
                    ),
                    const SizedBox(height: 12),
                    _sectionTitle('BUDDY (optionnel)'),
                    _whiteCard(
                      child: TextField(
                        controller: _buddyName,
                        decoration: const InputDecoration(
                          hintText: 'Nom du buddy',
                          border: InputBorder.none,
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    _sectionTitle('NOTES (optionnel)'),
                    _whiteCard(
                      child: TextField(
                        controller: _notes,
                        maxLines: 3,
                        decoration: const InputDecoration(
                          hintText: 'Belle visibilité, fond à 22 m…',
                          border: InputBorder.none,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: ElevatedButton(
            onPressed: _submitting ? null : _save,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.middenblauw,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              minimumSize: const Size.fromHeight(48),
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
                : Text(widget.mode == LogbookEntryMode.auto
                    ? 'Enregistrer dans mon carnet'
                    : 'Ajouter au carnet'),
          ),
        ),
      ),
    );
  }

  Widget _header() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 12, 8, 12),
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
                  widget.mode == LogbookEntryMode.auto
                      ? 'Carnet — sortie Calypso'
                      : 'Nouvelle plongée',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  widget.mode == LogbookEntryMode.auto
                      ? 'pré-rempli — complète et enregistre'
                      : 'manuelle · ailleurs',
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
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
          Text(
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
            _location.text.isEmpty ? '—' : _location.text,
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

  Widget _whiteCard({required Widget child}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(14),
      ),
      child: child,
    );
  }

  String _formatDate(DateTime d) {
    const months = [
      'jan', 'fév', 'mar', 'avr', 'mai', 'juin',
      'juil', 'août', 'sept', 'oct', 'nov', 'déc'
    ];
    return '${d.day} ${months[d.month - 1]} ${d.year}';
  }

  Future<void> _save() async {
    setState(() => _submitting = true);
    try {
      final auth = context.read<AuthProvider>();
      final memberProvider = context.read<MemberProvider>();
      final userId = auth.currentUser?.uid;
      if (userId == null) throw 'Session non identifiée';

      const clubId = FirebaseConfig.defaultClubId;
      final memberName =
          '${memberProvider.prenom ?? ''} ${memberProvider.nom ?? ''}'.trim();

      final buddies = <LogbookBuddy>[];
      if (_buddyName.text.trim().isNotEmpty) {
        buddies.add(LogbookBuddy(name: _buddyName.text.trim()));
      }

      final entry = StudentLogbookEntry(
        id: '',
        memberId: userId,
        memberName: memberName,
        source: widget.mode == LogbookEntryMode.auto ? 'calypso_operation' : 'manual',
        date: _date,
        locationId: _locationId,
        locationName: _location.text.trim(),
        operationId: widget.task?.context.operationId,
        operationTitle: widget.task?.context.operationTitle,
        palanqueeId: widget.task?.context.palanqueeId,
        depthMaxMeters: double.tryParse(_depth.text.replaceAll(',', '.')),
        durationMinutes: int.tryParse(_duration.text),
        counters: _counters,
        buddies: buddies,
        notes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
      );

      await _service.create(clubId: clubId, entry: entry);

      // If opened from a logbook_completion task, mark it done.
      if (widget.task != null) {
        await _taskService.markCompleted(clubId, widget.task!.id, userId);
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Plongée enregistrée ✓')),
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
}

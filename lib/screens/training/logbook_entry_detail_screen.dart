/// Phase C follow-up (2026-05-13) — Logbook entry detail screen.
///
/// Read-only view of a single `student_logbook_entries` doc per the
/// §3.1.7 "Detail of an entry" mockup. Shown when the user taps any
/// card in Mon Carnet.
///
/// Fields:
///   - Header: 🌊 lieu (icon depends on water_type/counters.mer)
///   - Profondeur · durée
///   - Counter chips (only the enabled ones)
///   - Binômes list (members + externals with type-aware rendering)
///   - Notes
///   - Source line (Sortie Calypso / Piscine / Manuelle)
///   - Validated-by line when applicable
///
/// Edit per §11 Q19 is deferred — for now the detail is read-only
/// and shows a "Modifier" CTA only when the entry is editable
/// (manual source + own + < 7 days). The CTA wires into the existing
/// LogbookEntryScreen.manual() in a future iteration.

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'logbook_entry_screen.dart';

class LogbookEntryDetailScreen extends StatefulWidget {
  final String entryId;
  final Map<String, dynamic> data;

  const LogbookEntryDetailScreen({
    super.key,
    required this.entryId,
    required this.data,
  });

  @override
  State<LogbookEntryDetailScreen> createState() =>
      _LogbookEntryDetailScreenState();
}

class _LogbookEntryDetailScreenState extends State<LogbookEntryDetailScreen> {
  late Map<String, dynamic> data = Map<String, dynamic>.from(widget.data);

  String get entryId => widget.entryId;

  /// Editable when this is the signed-in member's own entry. Imported,
  /// manually created and pool-generated entries all use the same edit screen;
  /// Firestore rules still enforce ownership on save.
  bool get _canEdit {
    final userId = FirebaseAuth.instance.currentUser?.uid;
    return userId != null && data['member_id'] == userId;
  }

  bool get _isPool => (data['source'] as String?) == 'piscine';

  @override
  Widget build(BuildContext context) {
    final date = (data['date'] as Timestamp?)?.toDate();
    final dateLabel = date != null
        ? '${date.day.toString().padLeft(2, '0')}/'
            '${date.month.toString().padLeft(2, '0')}/'
            '${date.year}'
        : '—';

    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _header(context, dateLabel),
              Expanded(
                child: _isPool ? _poolBody() : _diveBody(date),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _diveBody(DateTime? date) {
    final locationName =
        (data['location_name'] as String?) ?? (data['lieu'] as String?) ?? '—';
    final country = data['country'] as String?;
    final depth = (data['depth_max_meters'] as num?)?.toDouble();
    final duration = (data['duration_minutes'] as num?)?.toInt();
    final source = (data['source'] as String?) ?? 'manual';
    final notes = (data['notes'] as String?)?.trim();
    final operationTitle = data['operation_title'] as String?;
    final validatorId = data['validator_id'] as String?;
    final themeSnapshot = data['theme_snapshot'] as String?;

    final counters = data['counters'] as Map<String, dynamic>? ?? const {};
    final isSea = counters['mer'] == true;

    final binomes = _parseBinomes(data);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: [
        _LocationCard(name: locationName, country: country, isSea: isSea),
        const SizedBox(height: 12),
        _DateTimeCard(
          date: date,
          entryTime: _readTime(data, 'entry_time', 'entry_time_str'),
          exitTime: _readTime(data, 'exit_time', 'exit_time_str'),
        ),
        const SizedBox(height: 12),
        _ParamsCard(depth: depth, duration: duration),
        if (counters.isNotEmpty) ...[
          const SizedBox(height: 12),
          _CountersCard(counters: counters),
        ],
        if (_hasEquipment(data)) ...[
          const SizedBox(height: 12),
          _EquipmentCard(data: data),
        ],
        if (binomes.isNotEmpty) ...[
          const SizedBox(height: 12),
          _BinomesCard(binomes: binomes),
        ],
        if (notes != null && notes.isNotEmpty) ...[
          const SizedBox(height: 12),
          _NotesCard(notes: notes),
        ],
        const SizedBox(height: 12),
        _SourceCard(
          source: source,
          operationTitle: operationTitle,
          themeSnapshot: themeSnapshot,
          validatorId: validatorId,
        ),
      ],
    );
  }

  /// Pool entries are a different beast. No equipment, no binôme list, no
  /// counters, no depth/duration/times. What matters is : where, in which
  /// group, what theme, with which monitor, and who else was in your group.
  Widget _poolBody() {
    final locationName = (data['location_name'] as String?) ??
        (data['lieu'] as String?) ??
        'Watermael-Boitsfort';
    final themeSnapshot = (data['theme_snapshot'] as String?)?.trim();
    final notes = (data['notes'] as String?)?.trim();
    final groupLevel = data['group_level'] as String?;
    final groupNumberRaw = data['group_number'];
    final groupNumber = groupNumberRaw is num ? groupNumberRaw.toInt() : null;
    final validatorId = data['validator_id'] as String?;
    final moniteurIds = (data['moniteur_ids'] as List?)?.cast<String>() ?? [];
    final groupMembers = _parsePoolGroupMembers(data);
    final validatorName = data['validator_name'] as String?;
    final moniteurNames =
        (data['moniteur_names'] as List?)?.cast<String>() ?? const [];

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: [
        _LocationCard(name: locationName, country: null, isSea: false),
        const SizedBox(height: 12),
        _PoolGroupCard(
          level: groupLevel,
          groupNumber: groupNumber,
          theme: themeSnapshot,
          validatorId: validatorId,
          moniteurIds: moniteurIds,
          validatorName: validatorName,
          moniteurNames: moniteurNames,
        ),
        if (groupMembers.isNotEmpty) ...[
          const SizedBox(height: 12),
          _PoolGroupMembersCard(members: groupMembers),
        ],
        if (notes != null && notes.isNotEmpty) ...[
          const SizedBox(height: 12),
          _NotesCard(notes: notes),
        ],
        const SizedBox(height: 12),
        _SourceCard(
          source: 'piscine',
          operationTitle: null,
          themeSnapshot: themeSnapshot,
          validatorId: validatorId,
        ),
      ],
    );
  }

  List<_PoolGroupMember> _parsePoolGroupMembers(Map<String, dynamic> data) {
    final raw = data['pool_group_members'] as List? ?? const [];
    final result = <_PoolGroupMember>[];
    for (final m in raw) {
      if (m is! Map) continue;
      final displayName = (m['display_name'] as String?) ??
          (m['displayName'] as String?) ??
          (m['name'] as String?) ??
          (m['memberName'] as String?);
      if (displayName == null || displayName.isEmpty) continue;
      result.add(_PoolGroupMember(
        displayName: displayName,
        memberId: m['member_id'] as String?,
      ));
    }
    return result;
  }

  Widget _header(BuildContext context, String dateLabel) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 6),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _isPool
                      ? 'Piscine du $dateLabel'
                      : (data['dive_number'] is num
                          ? 'Plongée N°${(data['dive_number'] as num).toInt()} du $dateLabel'
                          : 'Plongée du $dateLabel'),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const Text(
                  'détail',
                  style: TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
          if (_canEdit)
            IconButton(
              icon: const Icon(Icons.edit_outlined, color: Colors.white),
              tooltip: 'Modifier',
              onPressed: _openEditSheet,
            ),
        ],
      ),
    );
  }

  Future<void> _openEditSheet() async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => LogbookEntryScreen.edit(
          entryId: entryId,
          initialData: data,
        ),
      ),
    );
    // After the edit screen returns, refresh the detail data from Firestore
    // so any change made there shows up immediately.
    if (!mounted) return;
    try {
      final snap = await FirebaseFirestore.instance
          .collection('clubs')
          .doc(FirebaseConfig.defaultClubId)
          .collection('student_logbook_entries')
          .doc(entryId)
          .get();
      if (!snap.exists) {
        // The entry was deleted in the edit screen — pop the detail.
        if (mounted) Navigator.pop(context);
        return;
      }
      if (mounted) {
        setState(() => data = {...snap.data() ?? {}});
      }
    } catch (_) {
      // ignore — UI already reflects whatever the edit screen pushed via
      // its own snackbar feedback.
    }
  }

  bool _hasEquipment(Map<String, dynamic> data) {
    return data['combi_type'] != null ||
        data['combi'] is Map ||
        data['tank'] is Map ||
        data['lestage_kg'] != null;
  }

  /// Read a time field — prefer the structured Timestamp version, fall back
  /// to the human-readable HH:mm string written alongside.
  String? _readTime(Map<String, dynamic> data, String tsKey, String strKey) {
    final ts = data[tsKey];
    if (ts is Timestamp) {
      final d = ts.toDate();
      return '${d.hour.toString().padLeft(2, '0')}:'
          '${d.minute.toString().padLeft(2, '0')}';
    }
    final s = data[strKey];
    if (s is String && s.isNotEmpty) return s;
    return null;
  }

  List<_ParsedBinome> _parseBinomes(Map<String, dynamic> data) {
    final result = <_ParsedBinome>[];
    final binomes = data['binomes'] as List?;
    if (binomes != null) {
      for (final b in binomes) {
        if (b is! Map) continue;
        final type = (b['type'] as String?) ?? '';
        if (type == 'member') {
          result.add(_ParsedBinome(
            displayName: (b['display_name'] as String?) ??
                (b['displayName'] as String?) ??
                '?',
            isExternal: false,
          ));
        } else {
          result.add(_ParsedBinome(
            displayName: (b['display_name'] as String?) ??
                (b['displayName'] as String?) ??
                (b['name'] as String?) ??
                'Binôme externe',
            niveau: b['niveau'] as String?,
            club: b['club'] as String?,
            isExternal: true,
          ));
        }
      }
    } else {
      // Legacy `buddies` list fallback
      final buddies = data['buddies'] as List? ?? const [];
      for (final b in buddies) {
        if (b is Map) {
          final memberId = b['member_id'] as String?;
          final name = (b['name'] as String?) ?? '';
          result.add(_ParsedBinome(
            displayName: name.isEmpty ? '?' : name,
            isExternal: memberId == null,
            club: b['external_organization'] as String?,
          ));
        } else if (b is String && b.isNotEmpty) {
          result.add(_ParsedBinome(displayName: b, isExternal: false));
        }
      }
    }
    return result;
  }
}

class _ParsedBinome {
  final String displayName;
  final bool isExternal;
  final String? niveau;
  final String? club;

  const _ParsedBinome({
    required this.displayName,
    required this.isExternal,
    this.niveau,
    this.club,
  });
}

class _PoolGroupMember {
  final String displayName;
  final String? memberId;
  const _PoolGroupMember({required this.displayName, this.memberId});
}

/// Pool-specific group card — replaces the dive ParamsCard/CountersCard/
/// EquipmentCard stack with a single block that summarises which group the
/// member was in, what was taught, and who the monitor was.
class _PoolGroupCard extends StatelessWidget {
  final String? level;
  final int? groupNumber;
  final String? theme;
  final String? validatorId;
  final List<String> moniteurIds;
  final String? validatorName;
  final List<String> moniteurNames;

  const _PoolGroupCard({
    required this.level,
    required this.groupNumber,
    required this.theme,
    required this.validatorId,
    required this.moniteurIds,
    this.validatorName,
    this.moniteurNames = const [],
  });

  @override
  Widget build(BuildContext context) {
    final groupParts = <String>[];
    if (level != null && level!.isNotEmpty) {
      groupParts.add('Formation $level');
    }
    if (groupNumber != null) {
      groupParts.add('Groupe $groupNumber');
    }
    final groupLabel = groupParts.join(' · ');
    final hasMonitor = validatorId != null && validatorId!.isNotEmpty ||
        moniteurIds.isNotEmpty;

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: Colors.white.withValues(alpha: 0.10),
        border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.school_outlined, size: 18, color: Colors.white),
              const SizedBox(width: 8),
              const Text(
                'Groupe',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.3,
                ),
              ),
              const Spacer(),
              if (groupLabel.isNotEmpty)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    groupLabel,
                    style: const TextStyle(
                      color: AppColors.donkerblauw,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
          ),
          if (theme != null && theme!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              theme!,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 2),
            const Text(
              'thème de la séance',
              style: TextStyle(color: Colors.white70, fontSize: 11),
            ),
          ],
          if (hasMonitor) ...[
            const SizedBox(height: 12),
            _MonitorLine(
              validatorId: validatorId,
              moniteurIds: moniteurIds,
              validatorName: validatorName,
              moniteurNames: moniteurNames,
            ),
          ],
        ],
      ),
    );
  }
}

class _MonitorLine extends StatelessWidget {
  final String? validatorId;
  final List<String> moniteurIds;
  final String? validatorName;
  final List<String> moniteurNames;
  const _MonitorLine({
    required this.validatorId,
    required this.moniteurIds,
    this.validatorName,
    this.moniteurNames = const [],
  });

  @override
  Widget build(BuildContext context) {
    // Prefer snapshotted names (written by onPoolSessionClosed since
    // 2026-05-14). Fall back to a live member lookup for legacy entries.
    final snapshotLabels = <String>{
      if (validatorName != null && validatorName!.isNotEmpty) validatorName!,
      ...moniteurNames.where((n) => n.isNotEmpty),
    }.toList();
    if (snapshotLabels.isNotEmpty) {
      return Row(
        children: [
          const Icon(Icons.person_outline, color: Colors.white70, size: 16),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              'avec ${snapshotLabels.join(', ')}',
              style: const TextStyle(color: Colors.white, fontSize: 13),
            ),
          ),
        ],
      );
    }

    final ids = <String>{
      if (validatorId != null && validatorId!.isNotEmpty) validatorId!,
      ...moniteurIds,
    }.toList();
    if (ids.isEmpty) return const SizedBox.shrink();

    return FutureBuilder<Map<String, String>>(
      future: _resolveMemberNames(ids),
      builder: (context, snap) {
        final names = snap.data ?? const {};
        final labels = ids.map((id) => names[id] ?? id).toList();
        return Row(
          children: [
            const Icon(Icons.person_outline, color: Colors.white70, size: 16),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                'avec ${labels.join(', ')}',
                style: const TextStyle(color: Colors.white, fontSize: 13),
              ),
            ),
          ],
        );
      },
    );
  }

  Future<Map<String, String>> _resolveMemberNames(List<String> ids) async {
    final out = <String, String>{};
    final db = FirebaseFirestore.instance;
    for (final id in ids) {
      try {
        final s = await db
            .collection('clubs')
            .doc(FirebaseConfig.defaultClubId)
            .collection('members')
            .doc(id)
            .get();
        if (!s.exists) continue;
        final v = s.data() ?? {};
        final prenom = (v['prenom'] as String?) ?? '';
        final nom = (v['nom'] as String?) ?? '';
        final display = ('$prenom $nom').trim();
        if (display.isNotEmpty) out[id] = display;
      } catch (_) {
        // best-effort
      }
    }
    return out;
  }
}

class _PoolGroupMembersCard extends StatelessWidget {
  final List<_PoolGroupMember> members;
  const _PoolGroupMembersCard({required this.members});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: Colors.white.withValues(alpha: 0.10),
        border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.group_outlined, color: Colors.white, size: 18),
              SizedBox(width: 8),
              Text(
                'Co-équipiers',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.3,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              for (final m in members)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.28),
                    ),
                  ),
                  child: Text(
                    m.displayName,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

class _Card extends StatelessWidget {
  final Widget child;
  const _Card({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: AppColors.donkerblauw.withValues(alpha: 0.18),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TextStyle(
        color: Colors.grey.shade600,
        fontSize: 10.5,
        letterSpacing: 1.2,
        fontWeight: FontWeight.bold,
      ),
    );
  }
}

class _LocationCard extends StatelessWidget {
  final String name;
  final String? country;
  final bool isSea;

  const _LocationCard({
    required this.name,
    this.country,
    required this.isSea,
  });

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Row(
        children: [
          Icon(
            isSea ? Icons.waves : Icons.terrain,
            color: isSea ? Colors.cyan.shade700 : Colors.green.shade700,
            size: 36,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                  ),
                ),
                if (country != null && country!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      country!,
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DateTimeCard extends StatelessWidget {
  final DateTime? date;
  final String? entryTime;
  final String? exitTime;

  const _DateTimeCard({this.date, this.entryTime, this.exitTime});

  static const _months = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre'
  ];

  static const _weekdays = [
    'lundi',
    'mardi',
    'mercredi',
    'jeudi',
    'vendredi',
    'samedi',
    'dimanche'
  ];

  @override
  Widget build(BuildContext context) {
    String dateLabel = '—';
    if (date != null) {
      final d = date!;
      dateLabel = '${_weekdays[(d.weekday - 1).clamp(0, 6)]} '
          '${d.day} ${_months[d.month - 1]} ${d.year}';
    }
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionLabel('QUAND'),
          const SizedBox(height: 6),
          Row(
            children: [
              const Icon(Icons.calendar_today_outlined,
                  color: AppColors.middenblauw, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  dateLabel,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Colors.black87,
                  ),
                ),
              ),
            ],
          ),
          if (entryTime != null || exitTime != null) ...[
            const Divider(height: 16),
            Row(
              children: [
                Expanded(
                  child: _TimeBox(
                    label: "IMMERSION",
                    value: entryTime,
                    icon: Icons.south,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _TimeBox(
                    label: 'SORTIE',
                    value: exitTime,
                    icon: Icons.north,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _TimeBox extends StatelessWidget {
  final String label;
  final String? value;
  final IconData icon;
  const _TimeBox({required this.label, this.value, required this.icon});

  @override
  Widget build(BuildContext context) {
    final has = value != null && value!.isNotEmpty;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: has
            ? AppColors.middenblauw.withValues(alpha: 0.08)
            : Colors.grey.shade100,
        borderRadius: BorderRadius.circular(10),
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
              Icon(icon,
                  size: 14,
                  color: has ? AppColors.middenblauw : Colors.grey.shade400),
              const SizedBox(width: 4),
              Text(
                has ? value! : '—:—',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: has ? AppColors.donkerblauw : Colors.grey.shade400,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ParamsCard extends StatelessWidget {
  final double? depth;
  final int? duration;
  const _ParamsCard({this.depth, this.duration});

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Row(
        children: [
          Expanded(
            child: _Stat(
              label: 'PROFONDEUR MAX',
              value: depth != null ? '${depth!.toStringAsFixed(0)} m' : '—',
              icon: Icons.straighten,
            ),
          ),
          Container(width: 1, height: 36, color: Colors.grey.shade200),
          Expanded(
            child: _Stat(
              label: 'DURÉE',
              value: duration != null ? '$duration min' : '—',
              icon: Icons.timer_outlined,
            ),
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  const _Stat({required this.label, required this.value, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, color: AppColors.middenblauw, size: 22),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: Colors.black87,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: TextStyle(
            fontSize: 10,
            color: Colors.grey.shade600,
            letterSpacing: 1,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _CountersCard extends StatelessWidget {
  final Map<String, dynamic> counters;
  const _CountersCard({required this.counters});

  static const _labels = <String, String>{
    'exo': 'Exo',
    'nitrox': 'Nitrox',
    'deco': 'Déco',
    'dp': 'DP',
    'sf': 'SF',
    'nuit': 'Nuit',
    'mer': 'Mer',
  };

  @override
  Widget build(BuildContext context) {
    final on = <String>[];
    for (final entry in _labels.entries) {
      if (counters[entry.key] == true) on.add(entry.value);
    }
    if (on.isEmpty) {
      return const SizedBox.shrink();
    }
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionLabel('COMPTEURS'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final l in on)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.middenblauw,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.check, size: 12, color: Colors.white),
                      const SizedBox(width: 4),
                      Text(
                        l,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _EquipmentCard extends StatelessWidget {
  final Map<String, dynamic> data;
  const _EquipmentCard({required this.data});

  @override
  Widget build(BuildContext context) {
    final combiMap = data['combi'] is Map ? data['combi'] as Map : null;
    final legacyCombiType = data['combi_type'] as String?;
    final tank = data['tank'] as Map?;
    final lestage = (data['lestage_kg'] as num?)?.toDouble();

    String tankLabel = '';
    if (tank != null) {
      final v = (tank['volume_l'] as num?)?.toDouble() ?? 0;
      final p = (tank['pressure_bar'] as num?)?.toDouble() ?? 0;
      final label = tank['label'] as String?;
      final base = '${_fmt(v)} L · ${_fmt(p)} bar';
      tankLabel = label != null && label.isNotEmpty ? '$label · $base' : base;
    }

    String combiLabel = '';
    String combiType = '';
    if (combiMap != null) {
      combiType = (combiMap['type'] as String?) ?? 'humide';
      final thickness = (combiMap['thickness_mm'] as num?)?.toInt();
      final brand = combiMap['brand'] as String?;
      final label = combiMap['label'] as String?;
      if (label != null && label.trim().isNotEmpty) {
        combiLabel = label.trim();
      } else {
        final parts = <String>[
          combiType == 'etanche' ? 'Étanche' : 'Humide',
          if (combiType == 'humide' && thickness != null) '$thickness mm',
          if (brand != null && brand.trim().isNotEmpty) brand.trim(),
        ];
        combiLabel = parts.join(' · ');
      }
    } else if (legacyCombiType != null) {
      combiType = legacyCombiType;
      combiLabel = legacyCombiType == 'etanche' ? 'Étanche' : 'Humide';
    }

    final rows = <Widget>[];
    if (combiLabel.isNotEmpty) {
      rows.add(_row(
        icon: combiType == 'etanche' ? Icons.shield_outlined : Icons.opacity,
        label: 'Combi',
        value: combiLabel,
      ));
    }
    if (tankLabel.isNotEmpty) {
      if (rows.isNotEmpty) rows.add(const SizedBox(height: 6));
      rows.add(_row(
        icon: Icons.scuba_diving,
        label: 'Bouteille',
        value: tankLabel,
      ));
    }
    if (lestage != null && lestage > 0) {
      if (rows.isNotEmpty) rows.add(const SizedBox(height: 6));
      rows.add(_row(
        icon: Icons.fitness_center,
        label: 'Lestage',
        value: '${_fmt(lestage)} kg',
      ));
    }

    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionLabel('ÉQUIPEMENT'),
          const SizedBox(height: 8),
          ...rows,
        ],
      ),
    );
  }

  static String _fmt(double n) {
    final asInt = n.toInt();
    if (asInt.toDouble() == n) return asInt.toString();
    return n.toStringAsFixed(1);
  }

  Widget _row(
      {required IconData icon, required String label, required String value}) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.middenblauw),
        const SizedBox(width: 8),
        SizedBox(
          width: 78,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: Colors.grey.shade600,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: Colors.black87,
            ),
          ),
        ),
      ],
    );
  }
}

class _BinomesCard extends StatelessWidget {
  final List<_ParsedBinome> binomes;
  const _BinomesCard({required this.binomes});

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionLabel('BINÔMES'),
          const SizedBox(height: 8),
          for (final b in binomes)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Icon(
                    b.isExternal ? Icons.public : Icons.person,
                    size: 18,
                    color: b.isExternal
                        ? const Color(0xFF0369A1)
                        : Colors.green.shade800,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          b.displayName,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Colors.black87,
                          ),
                        ),
                        if (b.isExternal &&
                            (b.niveau != null || b.club != null))
                          Text(
                            [
                              if (b.niveau != null && b.niveau!.isNotEmpty)
                                b.niveau!,
                              if (b.club != null && b.club!.isNotEmpty) b.club!,
                            ].join(' · '),
                            style: TextStyle(
                              fontSize: 11.5,
                              color: Colors.grey.shade600,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _NotesCard extends StatelessWidget {
  final String notes;
  const _NotesCard({required this.notes});

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionLabel('NOTES'),
          const SizedBox(height: 8),
          Text(
            notes,
            style: const TextStyle(
              fontSize: 14,
              color: Colors.black87,
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }
}

class _SourceCard extends StatelessWidget {
  final String source;
  final String? operationTitle;
  final String? themeSnapshot;
  final String? validatorId;

  const _SourceCard({
    required this.source,
    this.operationTitle,
    this.themeSnapshot,
    this.validatorId,
  });

  @override
  Widget build(BuildContext context) {
    final lines = <Widget>[];
    switch (source) {
      case 'calypso_operation':
        lines.add(_line(
          Icons.anchor,
          'Sortie Calypso',
          subtitle: operationTitle,
        ));
        break;
      case 'piscine':
        lines.add(_line(
          Icons.pool,
          'Séance piscine',
          subtitle: themeSnapshot,
        ));
        break;
      case 'imported':
        lines.add(_line(Icons.cloud_download, 'Importée'));
        break;
      case 'manual':
      default:
        lines.add(_line(Icons.edit_note, 'Saisie manuelle'));
    }
    if (validatorId != null) {
      lines.add(const SizedBox(height: 6));
      lines.add(_line(
        Icons.verified_user_outlined,
        'Validateur assigné',
        subtitle: validatorId,
      ));
    }
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionLabel('SOURCE'),
          const SizedBox(height: 8),
          ...lines,
        ],
      ),
    );
  }

  Widget _line(IconData icon, String title, {String? subtitle}) {
    return Row(
      children: [
        Icon(icon, color: AppColors.middenblauw, size: 18),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.black87,
                ),
              ),
              if (subtitle != null && subtitle.isNotEmpty)
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

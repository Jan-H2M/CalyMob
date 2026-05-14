/// Phase C (2026-05-13) — Mon Carnet : the diver's personal logbook list.
///
/// Triggered from the LandingScreen "Mon carnet" tile (3+2 layout, row 1).
/// Lists `student_logbook_entries` for the signed-in member, filterable by
/// year, with cards that summarise date / lieu / profondeur / durée / counters
/// and indicate the entry's source (piscine / sortie Calypso / manuel).
///
/// Visual language mirrors `stats_screen.dart` exactly so the carnet,
/// stats and other training surfaces feel like one consistent product:
/// OceanGradientBackground with jellyfish + bubbles, white text on dark
/// backdrop, glass-style cards over the gradient.
///
/// Spec : `_carnet_plan.md` §3.1.7 + §13 C.8.

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../exercises/member_exercises_screen.dart';
import '../../providers/member_provider.dart';
import 'logbook_entry_detail_screen.dart';
import 'logbook_entry_screen.dart';
import 'logbook_ocr_capture_screen.dart';
import 'stats_screen.dart';

class MonCarnetScreen extends StatefulWidget {
  const MonCarnetScreen({super.key});

  @override
  State<MonCarnetScreen> createState() => _MonCarnetScreenState();
}

/// Two distinct lists, never mixed — pool sessions are conceptually a
/// different artefact from sea/lake/quarry dives and have a different
/// detail layout.
enum _CarnetMode { dives, pool }

class _MonCarnetScreenState extends State<MonCarnetScreen> {
  int? _year;
  _CarnetMode _mode = _CarnetMode.dives;

  @override
  void initState() {
    super.initState();
    _year = DateTime.now().year;
  }

  Stream<List<_LogbookEntryRow>> _stream(String clubId, String userId) {
    Query<Map<String, dynamic>> q = FirebaseFirestore.instance
        .collection('clubs')
        .doc(clubId)
        .collection('student_logbook_entries')
        .where('member_id', isEqualTo: userId)
        .orderBy('date', descending: true);
    if (_year != null) {
      q = q
          .where('date',
              isGreaterThanOrEqualTo:
                  Timestamp.fromDate(DateTime(_year!, 1, 1)))
          .where('date',
              isLessThan: Timestamp.fromDate(DateTime(_year! + 1, 1, 1)));
    }
    return q.snapshots().map((snap) {
      final rows = snap.docs
          .map((d) => _LogbookEntryRow.fromMap(d.id, d.data()))
          .toList();
      // Mode-based partition — pool entries (source=piscine) are isolated
      // from dive entries (everything else). We don't ship the count back
      // up the tree, so the badge counts above re-listen via the same
      // stream when the mode flips.
      return rows.where((r) {
        final isPool = r.source == 'piscine';
        return _mode == _CarnetMode.pool ? isPool : !isPool;
      }).toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    final userId = context.watch<AuthProvider>().currentUser?.uid;
    const clubId = FirebaseConfig.defaultClubId;

    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _header(context),
              _modeSegmented(),
              _yearPills(),
              const SizedBox(height: 12),
              Expanded(
                child: userId == null
                    ? const _CenterMessage(
                        text: 'Session expirée — reconnecte-toi.')
                    : StreamBuilder<List<_LogbookEntryRow>>(
                        stream: _stream(clubId, userId),
                        builder: (context, snap) {
                          if (snap.connectionState == ConnectionState.waiting) {
                            return const Center(
                              child: CircularProgressIndicator(
                                  color: Colors.white),
                            );
                          }
                          if (snap.hasError) {
                            return _CenterMessage(
                              text:
                                  'Impossible de charger le carnet.\n${snap.error}',
                            );
                          }
                          final rows = snap.data ?? const [];
                          if (rows.isEmpty) return _emptyState();
                          return ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                            itemCount: rows.length + 1,
                            separatorBuilder: (_, __) =>
                                const SizedBox(height: 10),
                            itemBuilder: (_, i) {
                              if (i == rows.length) {
                                return const Padding(
                                  padding: EdgeInsets.only(top: 12),
                                  child: _WebEspaceFooter(),
                                );
                              }
                              return _EntryCard(entry: rows[i]);
                            },
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
      // Manual entry only makes sense for sea/lake/quarry dives. Pool entries
      // are system-generated from the check-in flow at the pool entrance.
      floatingActionButton: _mode == _CarnetMode.dives
          ? _CarnetActions(
              onScanPaper: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const LogbookOcrCaptureScreen(),
                ),
              ),
              onAddDive: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const LogbookEntryScreen.manual(),
                ),
              ),
            )
          : null,
      floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
    );
  }

  Widget _modeSegmented() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
        ),
        padding: const EdgeInsets.all(4),
        child: Row(
          children: [
            Expanded(
              child: _modeChip(
                label: 'Plongées',
                icon: Icons.scuba_diving_outlined,
                active: _mode == _CarnetMode.dives,
                onTap: () => setState(() => _mode = _CarnetMode.dives),
              ),
            ),
            const SizedBox(width: 4),
            Expanded(
              child: _modeChip(
                label: 'Piscine',
                icon: Icons.pool_outlined,
                active: _mode == _CarnetMode.pool,
                onTap: () => setState(() => _mode = _CarnetMode.pool),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _modeChip({
    required String label,
    required IconData icon,
    required bool active,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(9),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOut,
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: active ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(9),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 17,
                color: active ? AppColors.donkerblauw : Colors.white,
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  color: active ? AppColors.donkerblauw : Colors.white,
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.2,
                ),
              ),
            ],
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
          const Expanded(
            child: Text(
              'Mon carnet',
              style: TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.bold,
                shadows: [
                  Shadow(
                    offset: Offset(0, 1),
                    blurRadius: 4,
                    color: Colors.black38,
                  ),
                ],
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.school_outlined, color: Colors.white),
            tooltip: 'Ma progression LIFRAS',
            onPressed: () {
              final auth = context.read<AuthProvider>();
              final memberProvider = context.read<MemberProvider>();
              final userId = auth.currentUser?.uid;
              if (userId == null) return;
              final memberName = ('${memberProvider.prenom ?? ''} '
                      '${memberProvider.nom ?? ''}')
                  .trim();
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => MemberExercisesScreen(
                    memberId: userId,
                    memberName: memberName.isEmpty ? 'Moi' : memberName,
                    isOwnProfile: true,
                  ),
                ),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.bar_chart, color: Colors.white),
            tooltip: 'Stats & cartes',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const StatsScreen()),
            ),
          ),
        ],
      ),
    );
  }

  Widget _yearPills() {
    final now = DateTime.now().year;
    final years = [now, now - 1, now - 2, now - 3];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: SizedBox(
        height: 36,
        child: ListView(
          scrollDirection: Axis.horizontal,
          children: [
            for (final y in years) _yearPill(y.toString(), y),
            _yearPill('Tout', null),
          ],
        ),
      ),
    );
  }

  Widget _yearPill(String label, int? value) {
    final isActive = _year == value;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: () => setState(() => _year = value),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            curve: Curves.easeOut,
            padding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            decoration: BoxDecoration(
              color:
                  isActive ? Colors.white : Colors.white.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: Colors.white.withValues(alpha: isActive ? 1 : 0.35),
                width: 1,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (isActive) ...[
                  Icon(Icons.check, size: 14, color: AppColors.donkerblauw),
                  const SizedBox(width: 4),
                ],
                Text(
                  label,
                  style: TextStyle(
                    color: isActive ? AppColors.donkerblauw : Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.2,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _emptyState() {
    final isPool = _mode == _CarnetMode.pool;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isPool ? Icons.pool_outlined : Icons.menu_book_outlined,
              size: 64,
              color: Colors.white.withValues(alpha: 0.7),
            ),
            const SizedBox(height: 14),
            Text(
              isPool ? 'Pas encore de piscine' : 'Pas encore de plongées',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              isPool
                  ? 'Tes séances de piscine apparaîtront ici dès que tu '
                      'auras scanné ton badge à l\'entrée et confirmé '
                      'le check-in dans Communication.'
                  : 'Tes plongées Calypso apparaîtront automatiquement ici '
                      'dès que tu auras complété un carnet après une sortie. '
                      'Tu peux aussi ajouter une plongée hors club en bas à droite.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.85),
                fontSize: 14,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LogbookEntryRow {
  final String id;
  final DateTime? date;
  final String locationName;
  final String? country;
  final double? depthMeters;
  final int? durationMinutes;
  final String source;
  final List<String> counters;
  final String? notes;
  final List<String> buddyNames;
  // Pool-only metadata, snapshotted on the logbook entry by
  // onPoolSessionClosed. Empty/null for dive entries.
  final String? themeSnapshot;
  final String? groupLevel;
  final int? groupNumber;

  /// Full raw map for the detail screen — keeps us from having to refetch.
  final Map<String, dynamic> raw;

  const _LogbookEntryRow({
    required this.id,
    required this.date,
    required this.locationName,
    this.country,
    this.depthMeters,
    this.durationMinutes,
    required this.source,
    required this.counters,
    this.notes,
    this.buddyNames = const [],
    this.themeSnapshot,
    this.groupLevel,
    this.groupNumber,
    this.raw = const {},
  });

  factory _LogbookEntryRow.fromMap(String id, Map<String, dynamic> map) {
    final date = (map['date'] as Timestamp?)?.toDate();
    final counters = <String>[];
    final c = map['counters'] as Map<String, dynamic>? ?? const {};
    if (c['exo'] == true) counters.add('Exo');
    if (c['nitrox'] == true) counters.add('Nitrox');
    if (c['deco'] == true) counters.add('Déco');
    if (c['dp'] == true) counters.add('DP');
    if (c['sf'] == true) counters.add('SF');
    if (c['nuit'] == true) counters.add('Nuit');
    if (c['mer'] == true) counters.add('Mer');

    final buddies = <String>[];
    final binomes = map['binomes'] as List?;
    if (binomes != null) {
      for (final b in binomes) {
        if (b is Map) {
          final name = b['displayName'] ?? b['name'];
          if (name is String && name.isNotEmpty) buddies.add(name);
        }
      }
    } else {
      final list = map['buddies'] as List? ?? const [];
      for (final b in list) {
        if (b is Map) {
          final name = b['name'];
          if (name is String && name.isNotEmpty) buddies.add(name);
        } else if (b is String && b.isNotEmpty) {
          buddies.add(b);
        }
      }
    }

    final groupNumberRaw = map['group_number'];
    return _LogbookEntryRow(
      id: id,
      date: date,
      themeSnapshot: map['theme_snapshot'] as String?,
      groupLevel: map['group_level'] as String?,
      groupNumber: groupNumberRaw is num ? groupNumberRaw.toInt() : null,
      locationName:
          (map['location_name'] as String?) ?? (map['lieu'] as String?) ?? '—',
      country: map['country'] as String?,
      depthMeters: (map['depth_max_meters'] as num?)?.toDouble(),
      durationMinutes: (map['duration_minutes'] as num?)?.toInt(),
      source: (map['source'] as String?) ?? 'manual',
      counters: counters,
      notes: map['notes'] as String?,
      buddyNames: buddies,
      raw: map,
    );
  }
}

class _EntryCard extends StatelessWidget {
  final _LogbookEntryRow entry;
  const _EntryCard({required this.entry});

  @override
  Widget build(BuildContext context) {
    final dateLabel = entry.date != null
        ? '${entry.date!.day.toString().padLeft(2, '0')}/'
            '${entry.date!.month.toString().padLeft(2, '0')}/'
            '${entry.date!.year}'
        : '—';
    final isPool = entry.source == 'piscine';

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: Colors.white.withValues(alpha: 0.10),
        border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
        boxShadow: [
          BoxShadow(
            color: AppColors.donkerblauw.withValues(alpha: 0.18),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => LogbookEntryDetailScreen(
                entryId: entry.id,
                data: entry.raw,
              ),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: isPool ? _poolBody(dateLabel) : _diveBody(dateLabel),
          ),
        ),
      ),
    );
  }

  Widget _diveBody(String dateLabel) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            _SourceBadge(source: entry.source),
            const SizedBox(width: 8),
            Text(
              dateLabel,
              style: const TextStyle(
                color: Colors.white70,
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
              ),
            ),
            const Spacer(),
            if (entry.depthMeters != null)
              _Stat(
                icon: Icons.straighten,
                text: '${entry.depthMeters!.toStringAsFixed(0)} m',
              ),
            if (entry.durationMinutes != null) ...[
              const SizedBox(width: 8),
              _Stat(
                icon: Icons.timer_outlined,
                text: '${entry.durationMinutes} min',
              ),
            ],
          ],
        ),
        const SizedBox(height: 8),
        Text(
          entry.locationName,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 17,
            fontWeight: FontWeight.bold,
          ),
        ),
        if (entry.buddyNames.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            'avec ${entry.buddyNames.join(', ')}',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.78),
              fontSize: 12.5,
            ),
          ),
        ],
        if (entry.counters.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final c in entry.counters)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.25),
                    ),
                  ),
                  child: Text(
                    c,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
            ],
          ),
        ],
        if (entry.notes != null && entry.notes!.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(
            entry.notes!,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.85),
              fontSize: 12.5,
              fontStyle: FontStyle.italic,
            ),
          ),
        ],
      ],
    );
  }

  Widget _poolBody(String dateLabel) {
    final groupParts = <String>[];
    if (entry.groupLevel != null && entry.groupLevel!.isNotEmpty) {
      groupParts.add('Formation ${entry.groupLevel}');
    }
    if (entry.groupNumber != null) {
      groupParts.add('Groupe ${entry.groupNumber}');
    }
    final groupLabel = groupParts.join(' · ');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const _SourceBadge(source: 'piscine'),
            const SizedBox(width: 8),
            Text(
              dateLabel,
              style: const TextStyle(
                color: Colors.white70,
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          entry.locationName,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 17,
            fontWeight: FontWeight.bold,
          ),
        ),
        if (groupLabel.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            groupLabel,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.85),
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
        if (entry.themeSnapshot != null && entry.themeSnapshot!.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            entry.themeSnapshot!,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.78),
              fontSize: 12.5,
              fontStyle: FontStyle.italic,
            ),
          ),
        ],
        if (entry.notes != null && entry.notes!.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(
            entry.notes!,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.85),
              fontSize: 12.5,
              fontStyle: FontStyle.italic,
            ),
          ),
        ],
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  final IconData icon;
  final String text;
  const _Stat({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(icon, size: 13, color: Colors.white),
          const SizedBox(width: 4),
          Text(
            text,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _SourceBadge extends StatelessWidget {
  final String source;
  const _SourceBadge({required this.source});

  @override
  Widget build(BuildContext context) {
    String label;
    Color bg;
    IconData icon;
    switch (source) {
      case 'calypso_operation':
        label = 'Sortie';
        bg = const Color(0xFF0EA5E9); // sky-500
        icon = Icons.anchor;
        break;
      case 'piscine':
        label = 'Piscine';
        bg = const Color(0xFF06B6D4); // cyan-500
        icon = Icons.pool;
        break;
      case 'imported':
      case 'ocr_import':
        label = 'Importée';
        bg = const Color(0xFF8B5CF6); // violet-500
        icon = Icons.cloud_download;
        break;
      case 'manual':
      default:
        label = 'Manuelle';
        bg = const Color(0xFF64748B); // slate-500
        icon = Icons.edit_note;
        break;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: Colors.white),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }
}

class _CarnetActions extends StatelessWidget {
  final VoidCallback onScanPaper;
  final VoidCallback onAddDive;
  const _CarnetActions({
    required this.onScanPaper,
    required this.onAddDive,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          Expanded(
            child: _BottomActionButton(
              onTap: onScanPaper,
              icon: Icons.document_scanner_outlined,
              label: 'Scanner Carnet papier',
              backgroundColor: Colors.white.withValues(alpha: 0.94),
              foregroundColor: AppColors.donkerblauw,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _BottomActionButton(
              onTap: onAddDive,
              icon: Icons.add,
              label: 'Ajouter une plongée',
              backgroundColor: AppColors.middenblauw,
              foregroundColor: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}

class _BottomActionButton extends StatelessWidget {
  final VoidCallback onTap;
  final IconData icon;
  final String label;
  final Color backgroundColor;
  final Color foregroundColor;

  const _BottomActionButton({
    required this.onTap,
    required this.icon,
    required this.label,
    required this.backgroundColor,
    required this.foregroundColor,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: backgroundColor,
      borderRadius: BorderRadius.circular(14),
      elevation: 8,
      shadowColor: AppColors.donkerblauw.withValues(alpha: 0.28),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 56),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, color: foregroundColor, size: 21),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: foregroundColor,
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                      height: 1.05,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Discreet hint that the carnet is also available on caly.club. Same data,
/// bigger screen — useful for members who want to consult their logbook on
/// a desktop browser. Placed after the entries list as a soft footer.
class _WebEspaceFooter extends StatelessWidget {
  const _WebEspaceFooter();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        children: [
          Icon(
            Icons.open_in_new,
            size: 13,
            color: Colors.white.withValues(alpha: 0.55),
          ),
          const SizedBox(height: 4),
          Text(
            'Aussi disponible sur caly.club',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.65),
              fontSize: 11.5,
              fontStyle: FontStyle.italic,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'Calypso · Mon espace',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.45),
              fontSize: 10,
              letterSpacing: 0.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _CenterMessage extends StatelessWidget {
  final String text;
  const _CenterMessage({required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Center(
        child: Text(
          text,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white, fontSize: 14),
        ),
      ),
    );
  }
}

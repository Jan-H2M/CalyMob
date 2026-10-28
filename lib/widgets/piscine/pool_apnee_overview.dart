import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

String poolApneeTrackName(String track) => switch (track) {
      'apnee.a1' => '1★ apnée · A1 / Discovery',
      'apnee.a2' => '2★ apnée · A2',
      _ => 'Trajet apnée inconnu',
    };

/// A planned apnée roster is not proof of presence or exercise validation.
class PoolApneeLesson {
  final String track;
  final String hour;
  final String theme;
  final List<String> instructorIds;
  final List<String> memberIds;

  const PoolApneeLesson({
    required this.track,
    required this.hour,
    required this.theme,
    required this.instructorIds,
    required this.memberIds,
  });

  factory PoolApneeLesson.fromMap(Map<String, dynamic> data) {
    List<String> ids(String key) =>
        (data[key] as List?)
            ?.whereType<String>()
            .where((id) => id.isNotEmpty)
            .toList() ??
        const [];
    return PoolApneeLesson(
      track: data['track']?.toString() ?? '',
      hour: data['hour']?.toString() ?? '',
      theme: data['theme']?.toString().trim() ?? '',
      instructorIds: ids('instructor_ids'),
      memberIds: ids('member_ids'),
    );
  }
}

class PoolApneeOverview extends StatefulWidget {
  final Stream<List<PoolApneeLesson>> lessons;
  final Future<Map<String, String>> Function(Set<String> ids) resolveNames;

  const PoolApneeOverview({
    super.key,
    required this.lessons,
    required this.resolveNames,
  });

  @override
  State<PoolApneeOverview> createState() => _PoolApneeOverviewState();
}

class _PoolApneeOverviewState extends State<PoolApneeOverview> {
  Set<String>? _nameIds;
  Future<Map<String, String>>? _names;

  @override
  void didUpdateWidget(PoolApneeOverview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.lessons != widget.lessons ||
        oldWidget.resolveNames != widget.resolveNames) {
      _nameIds = null;
      _names = null;
    }
  }

  Future<Map<String, String>> _loadNames(Set<String> ids) =>
      Future.sync(() => widget.resolveNames(ids))
          .timeout(const Duration(seconds: 8));

  Future<Map<String, String>> _namesFor(Set<String> ids) {
    if (_names == null || !setEquals(_nameIds, ids)) {
      _nameIds = Set.unmodifiable(ids);
      _names = ids.isEmpty ? Future.value(const {}) : _loadNames(_nameIds!);
    }
    return _names!;
  }

  void _retryNames() {
    setState(() {
      _names = _loadNames(_nameIds!);
    });
  }

  @override
  Widget build(BuildContext context) => StreamBuilder<List<PoolApneeLesson>>(
        key: ObjectKey(widget.lessons),
        stream: widget.lessons,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return const Text(
              'Planning apnée indisponible.',
              style: TextStyle(color: Colors.white),
            );
          }
          final rows = snapshot.data;
          if (rows == null || rows.isEmpty) {
            _nameIds = null;
            _names = null;
            return const SizedBox.shrink();
          }
          final sorted = [...rows]..sort(
              (a, b) => a.hour.compareTo(b.hour) == 0
                  ? a.track.compareTo(b.track)
                  : a.hour.compareTo(b.hour),
            );
          final ids = sorted
              .expand((row) => [...row.instructorIds, ...row.memberIds])
              .toSet();
          final namesFuture = _namesFor(ids);
          return FutureBuilder<Map<String, String>>(
            key: ObjectKey(namesFuture),
            future: namesFuture,
            builder: (context, namesSnapshot) {
              final names = namesSnapshot.data ?? const <String, String>{};
              String people(List<String> memberIds, String empty) {
                if (memberIds.isEmpty) return empty;
                if (namesSnapshot.hasError) return 'Noms indisponibles';
                if (!namesSnapshot.hasData) return 'Chargement…';
                return memberIds.map((id) => names[id] ?? 'Membre').join(', ');
              }

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Padding(
                    padding: EdgeInsets.only(left: 4, bottom: 12),
                    child: Text(
                      'Apnée',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  if (namesSnapshot.hasError)
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Noms des participants indisponibles.',
                            style: TextStyle(color: Colors.white),
                          ),
                        ),
                        TextButton(
                          onPressed: _retryNames,
                          style: TextButton.styleFrom(
                            foregroundColor: Colors.white,
                          ),
                          child: const Text('Réessayer'),
                        ),
                      ],
                    ),
                  ...sorted.map(
                    (row) => Card(
                      color: Colors.white.withValues(alpha: 0.96),
                      margin: const EdgeInsets.only(bottom: 10),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${poolApneeTrackName(row.track)} · ${row.hour == '1ere_heure' ? '20h15' : row.hour == '2eme_heure' ? '21h15' : row.hour}',
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 5),
                            Text(
                              row.theme.isEmpty
                                  ? 'Thème non renseigné'
                                  : row.theme,
                            ),
                            const SizedBox(height: 6),
                            Text(
                              'Encadrant : ${people(row.instructorIds, 'À attribuer')}',
                            ),
                            Text(
                              'Élèves : ${people(row.memberIds, 'À inscrire au cours')}',
                            ),
                            const SizedBox(height: 4),
                            const Text(
                              'Roster du cours · présence à vérifier séparément',
                              style: TextStyle(
                                  fontSize: 11, color: Colors.black54),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              );
            },
          );
        },
      );
}

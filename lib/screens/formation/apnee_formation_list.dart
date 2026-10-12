import 'package:flutter/material.dart';
import 'package:rxdart/rxdart.dart';
import '../../models/member_profile.dart';
import '../../services/apnee_training_service.dart';
import '../../services/formation_enrollment_service.dart';
import '../../utils/member_directory_visibility.dart';
import '../../utils/member_name.dart';
import '../../widgets/formation/formation_navigation.dart';
import '../../widgets/formation/formation_student_tile.dart';
import 'student_360_screen.dart';
import '../../utils/permission_helper.dart';

/// One catalogue-backed track at a time, using the canonical public directory.
/// The server guards the sole active target, revisions, permissions and audit.
class ApneeFormationList extends StatefulWidget {
  final String clubId;
  final String search;
  final bool poolOnly;
  final bool canEnroll;
  final ApneeTrainingService? service;
  const ApneeFormationList({
    super.key,
    required this.clubId,
    this.search = '',
    this.poolOnly = false,
    this.canEnroll = false,
    this.service,
  });
  @override
  State<ApneeFormationList> createState() => _ApneeFormationListState();
}

ApneeRow apneeEnrollmentChange(
  List<ApneeRow> rows,
  String memberId,
  String track, {
  bool toggle = false,
  int expectedRevision = 0,
}) {
  ApneeRow? destination;
  for (final row in rows.where((row) => row['member_id'] == memberId)) {
    if (row['track'] == track) destination = row;
  }
  final closing = toggle && destination?['status'] == 'active';
  return {
    'memberId': memberId,
    'track': track,
    'active': !closing,
    'expectedRevision': expectedRevision,
  };
}

class _ApneeFormationListState extends State<ApneeFormationList> {
  late final ApneeTrainingService _service =
      widget.service ?? ApneeTrainingService();
  late final Stream<List<List<ApneeRow>>> _data = CombineLatestStream.list([
    _service.watch(widget.clubId, 'member_directory'),
    _service.watch(widget.clubId, 'apnee_enrollments'),
  ]);
  String _track = 'apnee.a1';
  bool _others = false;
  bool _busy = false;
  String? _message;

  Future<void> _change(
    List<ApneeRow> enrollments,
    String memberId,
    String track, {
    bool toggle = false,
    required int expectedRevision,
  }) async {
    if (!widget.canEnroll || _busy) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final change = apneeEnrollmentChange(enrollments, memberId, track,
          toggle: toggle, expectedRevision: expectedRevision);
      await FormationEnrollmentService(
              firestore: _service.db, invoke: _service.invoke)
          .save(widget.clubId,
              memberId: memberId,
              track: track,
              active: change['active'],
              expectedRevision: expectedRevision);
      if (mounted)
        setState(() {
          _track = track;
          _message =
              'Inscription enregistrée et auditée. Résultats historiques conservés.';
        });
    } catch (_) {
      if (mounted)
        setState(
          () => _message =
              'Modification non confirmée. Rechargez avant de réessayer.',
        );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => StreamBuilder<List<List<ApneeRow>>>(
        stream: _data,
        builder: (context, snapshot) {
          if (snapshot.hasError)
            return const Center(
              child: Text(
                'Liste apnée indisponible. Réessayez.',
                style: TextStyle(color: Colors.white),
              ),
            );
          if (!snapshot.hasData)
            return const Center(child: CircularProgressIndicator());
          final members = snapshot.data![0]
              .where(
                (row) =>
                    !excludedFromMemberDirectory(row) &&
                    MemberProfile.fromDirectoryData(row['id'], row).isActive,
              )
              .toList()
            ..sort(
              (a, b) => memberDisplayName(a).compareTo(memberDisplayName(b)),
            );
          final ids = members.map((row) => row['id']).toSet();
          final enrollments = snapshot.data![1]
              .where((row) => ids.contains(row['member_id']))
              .toList();
          final current = {
            for (final row
                in enrollments.where((row) => row['track'] == _track))
              row['member_id']: row,
          };
          final query = widget.search.trim().toLowerCase();
          final matching = members
              .where(
                  (row) => memberDisplayName(row).toLowerCase().contains(query))
              .toList();
          final active = matching
              .where((row) => current[row['id']]?['status'] == 'active')
              .toList();
          final others = matching
              .where((row) => current[row['id']]?['status'] != 'active')
              .toList();
          Widget member(ApneeRow row) {
            final id = row['id'] as String;
            final name = memberDisplayName(row, fallback: 'Membre');
            final enrollment = current[id];
            final enrolled = enrollment?['status'] == 'active';
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: FormationStudentTile(
                name: name,
                avatar: CircleAvatar(
                    radius: 15,
                    backgroundColor: const Color(0xFF406187),
                    child: Text(
                        name
                            .split(RegExp(r'\s+'))
                            .where((part) => part.isNotEmpty)
                            .take(2)
                            .map((part) => part[0])
                            .join()
                            .toUpperCase(),
                        style: const TextStyle(
                            color: Colors.white, fontSize: 11))),
                active: enrolled,
                onToggle: widget.canEnroll && !_busy
                    ? () => _change(enrollments, id, _track,
                        toggle: true,
                        expectedRevision: row['formation_revision'] ?? 0)
                    : null,
                goal: enrolled
                    ? DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                        isDense: true,
                        isExpanded: true,
                        value: _track,
                        disabledHint: Text(_track == 'apnee.a1' ? '1★' : '2★',
                            style: const TextStyle(
                                color: Colors.white70, fontSize: 11)),
                        dropdownColor: const Color(0xFF173853),
                        style:
                            const TextStyle(color: Colors.white, fontSize: 12),
                        items: const [
                          DropdownMenuItem(
                              value: 'apnee.a1', child: Text('1★')),
                          DropdownMenuItem(
                              value: 'apnee.a2', child: Text('2★')),
                        ],
                        onChanged: widget.canEnroll && !_busy
                            ? (value) {
                                if (value != null && value != _track)
                                  _change(enrollments, id, value,
                                      expectedRevision:
                                          row['formation_revision'] ?? 0);
                              }
                            : null,
                      ))
                    : null,
                onTap: enrollment == null
                    ? null
                    : () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => Student360Screen(
                              clubId: widget.clubId,
                              member: MemberProfile.fromDirectoryData(id, row),
                              initialApnee: true,
                              scope: widget.poolOnly
                                  ? FormationTrackingScope.piscineOnly
                                  : FormationTrackingScope.full,
                              apneeService: _service,
                            ),
                          ),
                        ),
              ),
            );
          }

          return Column(
            children: [
              FormationLevelSelector(
                selected: _track,
                enabled: !_busy,
                levels: {
                  for (final track in apneeFormationLevels.entries)
                    track.key:
                        '${track.value} · ${enrollments.where((row) => row['track'] == track.key && row['status'] == 'active').length}',
                },
                onChanged: (value) => setState(() {
                  _track = value;
                  _others = false;
                }),
              ),
              if (_message != null)
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: Text(
                    _message!,
                    style: const TextStyle(color: Colors.white),
                  ),
                ),
              Expanded(
                child: ListView(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(
                        'En formation · ${active.length}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    ...active.map(member),
                    if (active.isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(12),
                        child: Text(
                          'Aucun élève inscrit dans ce trajet.',
                          style: TextStyle(color: Colors.white70),
                        ),
                      ),
                    if (others.isNotEmpty) ...[
                      TextButton(
                        onPressed: () => setState(() => _others = !_others),
                        child: Text('Autres membres · ${others.length}'),
                      ),
                      if (_others || query.isNotEmpty) ...others.map(member),
                    ],
                  ],
                ),
              ),
            ],
          );
        },
      );
}

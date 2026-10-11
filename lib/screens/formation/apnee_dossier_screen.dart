import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../../services/apnee_training_service.dart';
import '../../utils/member_name.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class ApneeDossierScreen extends StatelessWidget {
  final String clubId;
  final String memberId;
  final String memberName;
  final bool poolOnly;
  final ApneeTrainingService? service;
  final String? viewerId;
  final bool canManage;
  final bool readOnly;
  const ApneeDossierScreen(
      {super.key,
      required this.clubId,
      required this.memberId,
      required this.memberName,
      this.poolOnly = false,
      this.viewerId,
      this.canManage = false,
      this.readOnly = false,
      this.service});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text('Apnée · $memberName')),
        body: OceanGradientBackground(
          creatures: CreatureSet.fishAndBubbles,
          child: StreamBuilder<List<ApneeRow>>(
            stream: (service ?? ApneeTrainingService())
                .watch(clubId, 'apnee_enrollments', memberId: memberId),
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return const Center(
                    child: Text('Suivi apnée indisponible. Réessayez.',
                        style: TextStyle(color: Colors.white)));
              }
              if (!snapshot.hasData) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snapshot.data!.isEmpty) {
                return const Center(
                    child: Text('Aucune inscription apnée pour ce membre.',
                        style: TextStyle(color: Colors.white)));
              }
              return ListView(
                  padding: const EdgeInsets.all(12),
                  children: snapshot.data!
                      .map((row) => _ApneeTrackCard(
                          clubId: clubId,
                          enrollment: row,
                          viewerId: viewerId,
                          canManage: canManage,
                          readOnly: readOnly,
                          poolOnly: poolOnly,
                          service: service ?? ApneeTrainingService()))
                      .toList());
            },
          ),
        ),
      );
}

class ApneeStudentList extends StatelessWidget {
  final String clubId;
  final String search;
  final bool poolOnly;
  const ApneeStudentList(
      {super.key,
      required this.clubId,
      this.search = '',
      this.poolOnly = false});
  @override
  Widget build(BuildContext context) => StreamBuilder<List<ApneeRow>>(
        stream: ApneeTrainingService().watch(clubId, 'apnee_enrollments'),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return const Center(
                child: Text('Liste apnée indisponible.',
                    style: TextStyle(color: Colors.white)));
          }
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final members = snapshot.data!
              .where((row) => row['status'] == 'active')
              .map((row) => row['member_id'].toString())
              .toSet()
              .toList();
          if (members.isEmpty) {
            return const Center(
                child: Text('Aucun élève inscrit en apnée.',
                    style: TextStyle(color: Colors.white)));
          }
          return ListView.builder(
              itemCount: members.length,
              itemBuilder: (context, index) =>
                  FutureBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                    future: FirebaseFirestore.instance
                        .doc('clubs/$clubId/member_directory/${members[index]}')
                        .get(),
                    builder: (context, member) {
                      if (member.hasError) {
                        return const ListTile(
                            title: Text('Identité indisponible',
                                style: TextStyle(color: Colors.white)));
                      }
                      if (!member.hasData) return const SizedBox.shrink();
                      final data = member.data!.data();
                      if (data == null) {
                        return const SizedBox
                            .shrink(); // no hidden QA account resurrection
                      }
                      final name = memberDisplayName(data, fallback: 'Membre');
                      if (!name
                          .toLowerCase()
                          .contains(search.toLowerCase().trim())) {
                        return const SizedBox.shrink();
                      }
                      final tracks = snapshot.data!
                          .where((row) =>
                              row['member_id'] == members[index] &&
                              row['status'] == 'active')
                          .map((row) => apneeTrackName(row['track']))
                          .join(' · ');
                      return ListTile(
                          title: Text(name,
                              style: const TextStyle(color: Colors.white)),
                          subtitle: Text(tracks,
                              style: const TextStyle(color: Colors.white70)),
                          trailing: const Icon(Icons.chevron_right,
                              color: Colors.white),
                          onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                  builder: (_) => ApneeDossierScreen(
                                      clubId: clubId,
                                      memberId: members[index],
                                      memberName: name,
                                      canManage: true,
                                      poolOnly: poolOnly))));
                    },
                  ));
        },
      );
}

class _ApneeTrackCard extends StatefulWidget {
  final String clubId;
  final ApneeRow enrollment;
  final bool poolOnly;
  final ApneeTrainingService service;
  final String? viewerId;
  final bool canManage;
  final bool readOnly;
  const _ApneeTrackCard(
      {required this.clubId,
      required this.enrollment,
      required this.poolOnly,
      required this.viewerId,
      required this.canManage,
      required this.readOnly,
      required this.service});
  @override
  State<_ApneeTrackCard> createState() => _ApneeTrackCardState();
}

class _ApneeTrackCardState extends State<_ApneeTrackCard> {
  late final Future<ApneeRow> _catalog = ApneeTrainingService.catalog();
  ApneeTrainingService get _service => widget.service;
  @override
  Widget build(BuildContext context) => FutureBuilder<ApneeRow>(
      future: _catalog,
      builder: (context, catalog) {
        if (catalog.hasError) {
          return const Text('Référentiel apnée indisponible.',
              style: TextStyle(color: Colors.white));
        }
        if (!catalog.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final items = (catalog.data!['requirements'] as List)
            .cast<ApneeRow>()
            .where((r) =>
                r['track'] == widget.enrollment['track'] &&
                (!widget.poolOnly || r['setting'] == 'pool'))
            .toList();
        return StreamBuilder<List<ApneeRow>>(
          stream: _service.watch(widget.clubId,
              'apnee_enrollments/${widget.enrollment['id']}/requirements',
              poolOnly: widget.poolOnly),
          builder: (context, results) {
            if (results.hasError) {
              return const Text('Résultats officiels indisponibles.',
                  style: TextStyle(color: Colors.white));
            }
            if (!results.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            final rows = results.data!;
            ApneeRow? result(ApneeRow item) {
              for (final row in rows) {
                if (row['requirement_key'] == item['key']) return row;
              }
              return null;
            }

            return Card(
                color: const Color(0xCC173853),
                child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(apneeTrackName(widget.enrollment['track']),
                            style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold)),
                        Text(
                            'Carte LIFRAS specimen ${catalog.data!['sourceVersion']}',
                            style: const TextStyle(
                                color: Colors.white70, fontSize: 11)),
                        const SizedBox(height: 8),
                        Wrap(
                            spacing: 12,
                            children: (widget.poolOnly
                                    ? ['pool']
                                    : ['general', 'theory', 'pool', 'depth'])
                                .map((setting) {
                              final relevant = items.where((r) =>
                                  r['setting'] == setting &&
                                  r['kind'] != 'milestone');
                              final done = relevant
                                  .where((r) =>
                                      result(r)?['status'] == 'validated')
                                  .length;
                              final milestones = items.where((r) =>
                                  r['setting'] == setting &&
                                  r['kind'] == 'milestone');
                              final milestone =
                                  milestones.isEmpty ? null : milestones.first;
                              final mark = milestone == null
                                  ? ''
                                  : result(milestone)?['status'] == 'validated'
                                      ? '✓'
                                      : '○';
                              const labels = {
                                'general': 'Conditions',
                                'theory': 'Théorie',
                                'pool': 'Piscine',
                                'depth': 'Profondeur'
                              };
                              return Text(
                                  '${labels[setting]} ${relevant.isEmpty ? '' : '$done/${relevant.length}'}${milestone == null ? '' : ' · Validation $mark'}',
                                  style: const TextStyle(
                                      color: Colors.white, fontSize: 12));
                            }).toList()),
                        ...(widget.poolOnly
                                ? ['pool']
                                : ['pool', 'depth', 'theory', 'general'])
                            .map((setting) => ExpansionTile(
                                  initiallyExpanded: setting == 'pool',
                                  collapsedIconColor: Colors.white,
                                  iconColor: Colors.white,
                                  title: Text(
                                      const {
                                        'general': 'Conditions',
                                        'theory': 'Théorie',
                                        'pool': 'Piscine',
                                        'depth': 'Profondeur'
                                      }[setting]!,
                                      style: const TextStyle(
                                          color: Colors.white, fontSize: 14)),
                                  children: items
                                      .where((r) => r['setting'] == setting)
                                      .map((item) {
                                    final row = result(item);
                                    final status = row?['status'];
                                    return ListTile(
                                      dense: true,
                                      contentPadding:
                                          const EdgeInsets.symmetric(
                                              horizontal: 4),
                                      leading: Icon(
                                          status == 'validated'
                                              ? Icons.check_circle
                                              : status == 'refused'
                                                  ? Icons.cancel
                                                  : Icons
                                                      .radio_button_unchecked,
                                          color: status == 'validated'
                                              ? Colors.greenAccent
                                              : status == 'refused'
                                                  ? Colors.orangeAccent
                                                  : Colors.white54,
                                          size: 18),
                                      title: Text(item['labelFr'],
                                          style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 12)),
                                      subtitle: row == null
                                          ? null
                                          : Text(
                                              '${_date(row['validated_at'])} · ${row['validated_by']} (${row['validator_federation']})',
                                              style: const TextStyle(
                                                  color: Colors.white70,
                                                  fontSize: 10)),
                                      onTap: () => showModalBottomSheet<void>(
                                          context: context,
                                          isScrollControlled: true,
                                          backgroundColor:
                                              const Color(0xFF173853),
                                          builder: (_) => SafeArea(
                                              child: Padding(
                                                  padding:
                                                      const EdgeInsets.all(20),
                                                  child: Column(
                                                    mainAxisSize:
                                                        MainAxisSize.min,
                                                    crossAxisAlignment:
                                                        CrossAxisAlignment
                                                            .start,
                                                    children: [
                                                      Text(item['labelFr'],
                                                          style: const TextStyle(
                                                              color:
                                                                  Colors.white,
                                                              fontWeight:
                                                                  FontWeight
                                                                      .bold)),
                                                      const SizedBox(
                                                          height: 12),
                                                      Text(
                                                          'LIFRAS specimen ${catalog.data!['sourceVersion']} · ${item['sectionRef'] == null ? '' : '§${item['sectionRef']} · '}page ${item['sourcePage']}',
                                                          style: const TextStyle(
                                                              color: Colors
                                                                  .white70)),
                                                      const SizedBox(
                                                          height: 12),
                                                      const Text(
                                                          'Exigence de la carte de préparation, pas un protocole complet. Une présence à un cours ne valide pas cette exigence.',
                                                          style: TextStyle(
                                                              color: Colors
                                                                  .white)),
                                                      TextButton(
                                                          onPressed: () =>
                                                              Navigator.pop(
                                                                  context),
                                                          child: const Text(
                                                              'Fermer')),
                                                    ],
                                                  )))),
                                    );
                                  }).toList(),
                                )),
                        _ApneeHistory(
                            clubId: widget.clubId,
                            enrollment: widget.enrollment,
                            viewerId: widget.viewerId,
                            canManage: widget.canManage,
                            readOnly: widget.readOnly,
                            service: _service),
                        if (!widget.poolOnly)
                          StreamBuilder<List<ApneeRow>>(
                            stream: _service.watch(widget.clubId,
                                'apnee_enrollments/${widget.enrollment['id']}/awards'),
                            builder: (context, awards) => Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('Brevet apnée officiel',
                                      style: TextStyle(
                                          color: Colors.white,
                                          fontWeight: FontWeight.bold)),
                                  if (awards.hasError)
                                    const Text('Brevet indisponible',
                                        style:
                                            TextStyle(color: Colors.white70)),
                                  ...(awards.data ?? []).map((row) => Text(
                                      '${row['award'].toString().toUpperCase()} · ${_date(row['validated_at'])} · ${row['validated_by']}',
                                      style: const TextStyle(
                                          color: Colors.white70))),
                                ]),
                          ),
                      ],
                    )));
          },
        );
      });
}

String _date(dynamic value) {
  final date = apneeDate(value);
  return date == null
      ? 'Date inconnue'
      : '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
}

Future<void> editApneeParticipation(BuildContext context, String clubId,
    ApneeRow row, ApneeTrainingService service) async {
  var note = row['note'] as String? ?? '';
  var status = ['absent', 'attended'].contains(row['participation_status'])
      ? row['participation_status'] as String
      : '';
  var busy = false;
  String? error;
  await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
            builder: (context, setState) => AlertDialog(
              title: Text('${_date(row['session_date'])} · Apnée'),
              content: SingleChildScrollView(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text(
                    'Corriger la participation à ce cours. Aucun scan QR ni résultat officiel ne sera créé.'),
                DropdownButton<String>(
                    isExpanded: true,
                    value: status,
                    items: const [
                      DropdownMenuItem(
                          value: '', child: Text('Choisir la participation…')),
                      DropdownMenuItem(
                          value: 'attended', child: Text('A participé')),
                      DropdownMenuItem(
                          value: 'absent', child: Text('N’a pas participé'))
                    ],
                    onChanged: busy
                        ? null
                        : (value) => setState(() => status = value!)),
                TextFormField(
                    initialValue: note,
                    onChanged: (value) => note = value,
                    enabled: !busy,
                    maxLength: 2000,
                    maxLines: 3,
                    decoration: const InputDecoration(
                        labelText: 'Remarque de cette séance')),
                if (error != null)
                  Text(error!, style: const TextStyle(color: Colors.red)),
              ])),
              actions: [
                TextButton(
                    onPressed: busy ? null : () => Navigator.pop(dialogContext),
                    child: const Text('Annuler')),
                FilledButton(
                    onPressed: busy || status.isEmpty
                        ? null
                        : () async {
                            setState(() {
                              busy = true;
                              error = null;
                            });
                            try {
                              await service.save(clubId, {
                                'action': 'attendance',
                                'memberId': row['member_id'],
                                'sessionId': row['session_id'],
                                'lessonId': row['course_id'],
                                'status': status,
                                'note': note,
                                'expectedRevision': row['revision'] ?? 0
                              });
                              if (dialogContext.mounted) {
                                Navigator.pop(dialogContext);
                              }
                            } catch (_) {
                              if (dialogContext.mounted) {
                                setState(() {
                                  busy = false;
                                  error =
                                      'Correction impossible. Rechargez la séance.';
                                });
                              }
                            }
                          },
                    child: Text(busy ? 'Enregistrement…' : 'Enregistrer'))
              ],
            ),
          ));
}

class _ApneeHistory extends StatelessWidget {
  final String clubId;
  final ApneeRow enrollment;
  final ApneeTrainingService service;
  final String? viewerId;
  final bool canManage;
  final bool readOnly;
  const _ApneeHistory(
      {required this.clubId,
      required this.enrollment,
      required this.service,
      required this.viewerId,
      required this.canManage,
      required this.readOnly});
  @override
  Widget build(BuildContext context) => StreamBuilder<List<ApneeRow>>(
        stream: service.history(clubId, enrollment['member_id']),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return const Text('Historique apnée indisponible.',
                style: TextStyle(color: Colors.white70));
          }
          final rows = (snapshot.data ?? [])
              .where((r) =>
                  r['track'] == enrollment['track'] &&
                  r['participation_status'] != 'cancelled')
              .toList()
            ..sort((a, b) => (apneeDate(b['session_date']) ?? DateTime(0))
                .compareTo(apneeDate(a['session_date']) ?? DateTime(0)));
          if (!snapshot.hasData) {
            return const Text('Chargement des séances…',
                style: TextStyle(color: Colors.white70));
          }
          final past = rows
              .where((r) =>
                  apneeDate(r['session_date'])?.isBefore(DateTime.now()) ==
                      true &&
                  r['participation_status'] != 'absent')
              .length;
          return ExpansionTile(
              iconColor: Colors.white,
              collapsedIconColor: Colors.white,
              title: Text('Séances apnée · $past participations',
                  style: const TextStyle(color: Colors.white, fontSize: 14)),
              children: rows
                  .map((row) => ListTile(
                        dense: true,
                        trailing: canCorrectApneeParticipation(row,
                                viewerId: viewerId,
                                memberId: enrollment['member_id'],
                                canManage: canManage,
                                readOnly: readOnly)
                            ? IconButton(
                                icon: const Icon(Icons.edit_note,
                                    color: Colors.white),
                                tooltip:
                                    'Participation et remarque de cette séance',
                                onPressed: () => editApneeParticipation(
                                    context, clubId, row, service))
                            : null,
                        title: Text(
                            '${_date(row['session_date'])} · ${row['hour'] == '1ere_heure' ? '20h15' : '21h15'} · ${row['theme'] ?? 'Apnée'}',
                            style: const TextStyle(
                                color: Colors.white, fontSize: 12)),
                        subtitle: Text(
                            '${row['participation_status'] == 'absent' ? 'Absent' : row['qr_verified'] == true ? 'Présence QR vérifiée · cours attribué au roster' : row['source'] == 'roster_inferred' ? (apneeDate(row['session_date'])?.isAfter(DateTime.now()) == true ? 'Prévu au roster' : 'Participation déduite du roster · scan non confirmé') : 'Participation confirmée'}${(row['note'] as String?)?.isNotEmpty == true ? '\n${row['note']}' : ''}',
                            style: const TextStyle(
                                color: Colors.white70, fontSize: 10)),
                      ))
                  .toList());
        },
      );
}

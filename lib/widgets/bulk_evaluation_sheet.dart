import 'package:flutter/material.dart';
import '../config/app_colors.dart';
import '../models/piscine_attendee.dart';
import '../models/member_observation.dart';
import '../services/member_observation_service.dart';

/// Bulk evaluation mode: évaluer plusieurs membres sur le même exercice.
/// Utilisé en mode examen: l'encadrant sélectionne un exercice, puis
/// coche acquis/en_progres/a_revoir pour chaque membre présent.
class BulkEvaluationSheet extends StatefulWidget {
  final String clubId;
  final String sessionId;
  final String sessionTitle;
  final DateTime sessionDate;
  final String observerId;
  final String observerName;
  final List<PiscineAttendee> attendees;

  const BulkEvaluationSheet({
    super.key,
    required this.clubId,
    required this.sessionId,
    required this.sessionTitle,
    required this.sessionDate,
    required this.observerId,
    required this.observerName,
    required this.attendees,
  });
  @override
  State<BulkEvaluationSheet> createState() => _BulkEvaluationSheetState();
}

class _BulkEvaluationSheetState extends State<BulkEvaluationSheet> {
  final MemberObservationService _service = MemberObservationService();
  bool _saving = false;

  // Exercice sélectionné
  String _exerciceCode = '';
  String _exerciceDescription = '';

  // Résultat par membre: memberId -> result
  final Map<String, String?> _results = {};

  @override
  void initState() {
    super.initState();
    for (final a in widget.attendees) {
      _results[a.memberId] = null;
    }
  }

  Future<void> _saveAll() async {
    if (_exerciceCode.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Veuillez saisir un code exercice')),
      );
      return;
    }
    final toSave = _results.entries
        .where((e) => e.value != null)
        .toList();
    if (toSave.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Aucun résultat sélectionné')),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final observations = toSave.map((entry) {
        final attendee = widget.attendees.firstWhere(
          (a) => a.memberId == entry.key,
        );
        return MemberObservation(
          id: '',
          memberId: entry.key,
          memberName: attendee.memberName,
          memberNiveau: '',
          contextType: 'piscine',
          contextId: widget.sessionId,
          contextDate: widget.sessionDate,
          contextTitle: widget.sessionTitle,
          category: 'exercice_lifras',
          exerciceCode: _exerciceCode,
          exerciceDescription: _exerciceDescription,
          result: entry.value,          note: '',
          observerId: widget.observerId,
          observerName: widget.observerName,
          createdAt: DateTime.now(),
        );
      }).toList();

      await _service.addBulkObservations(widget.clubId, observations);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${observations.length} observations enregistrées'),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {    return DraggableScrollableSheet(
      initialChildSize: 0.9,
      maxChildSize: 0.95,
      minChildSize: 0.5,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              // Handle
              Container(
                margin: const EdgeInsets.only(top: 8),
                width: 40, height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              // Header
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text('Mode Examen',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    ),
                    TextButton(onPressed: () => Navigator.pop(context),                      child: const Text('Fermer')),
                  ],
                ),
              ),
              // Exercice input
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    SizedBox(
                      width: 100,
                      child: TextField(
                        decoration: InputDecoration(
                          hintText: 'P2.CO',
                          labelText: 'Code',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10)),
                          isDense: true,
                        ),
                        onChanged: (v) => _exerciceCode = v,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        decoration: InputDecoration(
                          hintText: 'Description',
                          labelText: 'Exercice',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10)),                          isDense: true,
                        ),
                        onChanged: (v) => _exerciceDescription = v,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              const Divider(height: 1),
              // Members list with result toggles
              Expanded(
                child: ListView.builder(
                  controller: scrollController,
                  itemCount: widget.attendees.length,
                  itemBuilder: (context, index) {
                    final a = widget.attendees[index];
                    final result = _results[a.memberId];
                    return _BulkMemberRow(
                      name: a.memberName,
                      result: result,
                      onResultChanged: (r) {
                        setState(() => _results[a.memberId] = r);
                      },
                    );
                  },
                ),
              ),
              // Save button
              SafeArea(                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _saving ? null : _saveAll,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: _saving
                          ? const SizedBox(
                              height: 20, width: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                          : const Text('Enregistrer tout',
                              style: TextStyle(fontSize: 16,
                                fontWeight: FontWeight.bold)),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Row for a single member in bulk evaluation mode.
/// Shows member name + 3 toggle buttons for result selection.
class _BulkMemberRow extends StatelessWidget {
  final String name;
  final String? result;
  final ValueChanged<String?> onResultChanged;

  const _BulkMemberRow({
    required this.name,
    required this.result,
    required this.onResultChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(name,
              style: const TextStyle(fontSize: 15),
              overflow: TextOverflow.ellipsis),
          ),
          const SizedBox(width: 8),
          _resultButton('acquis', '✓', Colors.green),
          const SizedBox(width: 4),
          _resultButton('en_progres', '~', Colors.orange),
          const SizedBox(width: 4),
          _resultButton('a_revoir', '✗', Colors.red),
        ],
      ),
    );
  }

  Widget _resultButton(String value, String label, Color color) {
    final isSelected = result == value;
    return GestureDetector(
      onTap: () => onResultChanged(isSelected ? null : value),
      child: Container(
        width: 40, height: 36,
        decoration: BoxDecoration(
          color: isSelected ? color : Colors.grey.shade100,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSelected ? color : Colors.grey.shade300,
          ),
        ),
        alignment: Alignment.center,
        child: Text(label,
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: isSelected ? Colors.white : Colors.grey.shade500,
          ),
        ),
      ),
    );
  }
}

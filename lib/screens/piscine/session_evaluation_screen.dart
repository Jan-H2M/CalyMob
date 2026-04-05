import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/firebase_config.dart';
import '../../config/app_colors.dart';
import '../../models/piscine_attendee.dart';
import '../../models/piscine_session.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/piscine_session_service.dart';
import '../../services/member_observation_service.dart';
import '../../widgets/observation_bottom_sheet.dart';

/// Scherm voor encadrants om observaties te noteren per aanwezige.
/// Geopend vanuit SessionDetailScreen via de "Évaluer" knop.
class SessionEvaluationScreen extends StatefulWidget {
  final PiscineSession session;
  final String? themeTitle;
  final List<String>? relatedExerciceCodes;

  const SessionEvaluationScreen({
    super.key,
    required this.session,
    this.themeTitle,
    this.relatedExerciceCodes,
  });

  @override
  State<SessionEvaluationScreen> createState() =>
      _SessionEvaluationScreenState();
}
class _SessionEvaluationScreenState extends State<SessionEvaluationScreen> {
  final PiscineSessionService _sessionService = PiscineSessionService();
  final MemberObservationService _observationService =
      MemberObservationService();
  final String _clubId = FirebaseConfig.defaultClubId;

  List<PiscineAttendee> _attendees = [];
  Map<String, int> _observationCounts = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    final attendeesStream = _sessionService.getAttendeesStream(
      _clubId, widget.session.id,
    );
    attendeesStream.listen((attendees) {
      if (mounted) setState(() => _attendees = attendees);
    });

    // Luister naar observaties om count per lid bij te houden
    _observationService
        .getObservationsForSession(_clubId, widget.session.id)
        .listen((observations) {
      if (!mounted) return;
      final counts = <String, int>{};
      for (final obs in observations) {        counts[obs.memberId] = (counts[obs.memberId] ?? 0) + 1;
      }
      setState(() {
        _observationCounts = counts;
        _loading = false;
      });
    });
  }

  void _openObservationSheet(PiscineAttendee attendee) {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final memberProvider = Provider.of<MemberProvider>(context, listen: false);
    final observerName = memberProvider.displayName ?? 'Inconnu';
    final observerId = authProvider.currentUser?.uid ?? '';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => ObservationBottomSheet(
        clubId: _clubId,
        memberId: attendee.memberId,
        memberName: attendee.memberName,
        memberNiveau: '', // Wordt geladen in de sheet
        sessionId: widget.session.id,
        sessionTitle: 'Piscine ${_formatDate(widget.session.date)}',
        sessionDate: widget.session.date,
        observerId: observerId,
        observerName: observerName,        defaultThemeTitle: widget.themeTitle,
        suggestedExerciceCodes: widget.relatedExerciceCodes,
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Évaluer — ${_formatDate(widget.session.date)}'),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _attendees.isEmpty
              ? const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Text(
                      'Aucun participant enregistré pour cette session.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 16, color: Colors.grey),
                    ),
                  ),                )
              : ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: _attendees.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final attendee = _attendees[index];
                    final count = _observationCounts[attendee.memberId] ?? 0;
                    return _AttendeeRow(
                      attendee: attendee,
                      observationCount: count,
                      onTap: () => _openObservationSheet(attendee),
                    );
                  },
                ),
    );
  }
}

/// Rij per aanwezige: naam + badge met aantal observaties.
class _AttendeeRow extends StatelessWidget {
  final PiscineAttendee attendee;
  final int observationCount;
  final VoidCallback onTap;

  const _AttendeeRow({
    required this.attendee,
    required this.observationCount,
    required this.onTap,
  });
  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: AppColors.primary.withOpacity(0.1),
        child: Text(
          attendee.memberName.isNotEmpty
              ? attendee.memberName[0].toUpperCase()
              : '?',
          style: TextStyle(
            color: AppColors.primary,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      title: Text(
        attendee.memberName,
        style: const TextStyle(fontWeight: FontWeight.w500),
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (observationCount > 0)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.green.shade100,
                borderRadius: BorderRadius.circular(12),
              ),              child: Text(
                '$observationCount obs.',
                style: TextStyle(
                  color: Colors.green.shade800,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          const SizedBox(width: 4),
          const Icon(Icons.chevron_right, color: Colors.grey),
        ],
      ),
      onTap: onTap,
    );
  }
}
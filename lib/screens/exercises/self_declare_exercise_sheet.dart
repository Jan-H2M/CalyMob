import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/firebase_config.dart';
import '../../models/exercice_lifras.dart';
import '../../models/operation.dart';
import '../../models/piscine_session.dart';
import '../../providers/exercice_valide_provider.dart';
import '../../services/operation_service.dart';
import '../../services/piscine_session_service.dart';
import '../../utils/date_formatter.dart';

/// Optie voor de session-picker — ofwel een piscine sessie, ofwel een evènement.
class _SessionOption {
  /// Firestore session id — piscine_session id of operation id
  final String id;

  /// 'piscine' of 'operation' — voor de Firestore velden thema_id/session_id
  final String kind;

  final DateTime date;
  final String label;

  _SessionOption({
    required this.id,
    required this.kind,
    required this.date,
    required this.label,
  });
}

/// Bottom sheet waarin een member een exercice als "Je l'ai fait" declareert.
///
/// Flow:
///   1. Header met niveau-badge + exercice code + beschrijving
///   2. Session picker (last 30 days — piscine_sessions + évènements)
///   3. Optionele note
///   4. Envoyer la demande → [ExerciceValideProvider.declareByMember]
///
/// De declaratie krijgt status = pending en declared_by_member = true. Een
/// encadrant moet die later valideren of weigeren.
class SelfDeclareExerciseSheet extends StatefulWidget {
  final ExerciceLIFRAS exercice;
  final String memberId;

  const SelfDeclareExerciseSheet({
    super.key,
    required this.exercice,
    required this.memberId,
  });

  /// Convenience om de sheet te tonen en het resultaat af te wachten.
  /// Returnt `true` als de declaratie succesvol werd aangemaakt.
  static Future<bool?> show(
    BuildContext context, {
    required ExerciceLIFRAS exercice,
    required String memberId,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SelfDeclareExerciseSheet(
        exercice: exercice,
        memberId: memberId,
      ),
    );
  }

  @override
  State<SelfDeclareExerciseSheet> createState() =>
      _SelfDeclareExerciseSheetState();
}

class _SelfDeclareExerciseSheetState extends State<SelfDeclareExerciseSheet> {
  final String _clubId = FirebaseConfig.defaultClubId;
  final PiscineSessionService _piscineService = PiscineSessionService();
  final OperationService _operationService = OperationService();
  final TextEditingController _noteController = TextEditingController();

  bool _isLoadingSessions = true;
  bool _isSubmitting = false;
  String? _errorMessage;
  List<_SessionOption> _sessions = [];
  _SessionOption? _selectedSession;

  @override
  void initState() {
    super.initState();
    _loadSessions();
  }

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _loadSessions() async {
    setState(() {
      _isLoadingSessions = true;
      _errorMessage = null;
    });

    try {
      // Parallel: piscine sessions + operations
      final results = await Future.wait([
        _piscineService.getRecentAttendedSessions(
          clubId: _clubId,
          memberId: widget.memberId,
          days: 30,
        ),
        _operationService.getRecentAttendedOperations(
          clubId: _clubId,
          memberId: widget.memberId,
          days: 30,
        ),
      ]);

      final piscineSessions = results[0] as List<PiscineSession>;
      final operations = results[1] as List<Operation>;

      final options = <_SessionOption>[
        ...piscineSessions.map((s) => _SessionOption(
              id: s.id,
              kind: 'piscine',
              date: s.date,
              label: _formatPiscineLabel(s),
            )),
        ...operations.map((op) => _SessionOption(
              id: op.id,
              kind: 'operation',
              date: op.dateDebut ?? DateTime.now(),
              label: _formatOperationLabel(op),
            )),
      ]..sort((a, b) => b.date.compareTo(a.date));

      if (!mounted) return;
      setState(() {
        _sessions = options;
        _isLoadingSessions = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Erreur de chargement: $e';
        _isLoadingSessions = false;
      });
    }
  }

  String _formatPiscineLabel(PiscineSession s) {
    final dateStr = DateFormatter.formatMedium(s.date);
    final lieu = s.lieu.isNotEmpty ? ' • ${s.lieu}' : '';
    return '🏊 $dateStr$lieu';
  }

  String _formatOperationLabel(Operation op) {
    final dateStr = op.dateDebut != null
        ? DateFormatter.formatMedium(op.dateDebut!)
        : '—';
    return '🎫 $dateStr • ${op.titre}';
  }

  Future<void> _submit() async {
    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      final provider = context.read<ExerciceValideProvider>();
      final sel = _selectedSession;
      await provider.declareByMember(
        clubId: _clubId,
        memberId: widget.memberId,
        exercice: widget.exercice,
        dateDeclaration: sel?.date ?? DateTime.now(),
        sessionId: sel?.id,
        themaId: null,
        notes: _noteController.text.trim().isEmpty
            ? null
            : _noteController.text.trim(),
      );

      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Déclaration envoyée pour validation — ${widget.exercice.code}',
          ),
          backgroundColor: Colors.teal,
          behavior: SnackBarBehavior.floating,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Erreur: $e';
        _isSubmitting = false;
      });
    }
  }

  Color _getNiveauColor(NiveauLIFRAS niveau) {
    switch (niveau) {
      case NiveauLIFRAS.tn:
        return Colors.teal;
      case NiveauLIFRAS.nb:
        return Colors.grey;
      case NiveauLIFRAS.p2:
        return Colors.blue;
      case NiveauLIFRAS.p3:
        return Colors.green;
      case NiveauLIFRAS.p4:
        return Colors.orange;
      case NiveauLIFRAS.am:
        return Colors.purple;
      case NiveauLIFRAS.mc:
        return Colors.red;
      case NiveauLIFRAS.mf:
        return Colors.red.shade800;
      case NiveauLIFRAS.mn:
        return Colors.brown.shade800;
    }
  }

  @override
  Widget build(BuildContext context) {
    final niveauColor = _getNiveauColor(widget.exercice.niveau);
    final mediaQuery = MediaQuery.of(context);

    return Padding(
      padding: EdgeInsets.only(
        bottom: mediaQuery.viewInsets.bottom,
      ),
      child: Container(
        constraints: BoxConstraints(
          maxHeight: mediaQuery.size.height * 0.9,
        ),
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              // Title
              const Text(
                'Je l\'ai fait',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Envoie une demande de validation à un encadrant',
                style: TextStyle(
                  fontSize: 13,
                  color: Colors.grey[600],
                ),
              ),
              const SizedBox(height: 16),

              // Exercice header
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: niveauColor.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: niveauColor.withOpacity(0.3)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: niveauColor,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Center(
                        child: Text(
                          widget.exercice.niveau.code,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.exercice.code,
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            widget.exercice.description,
                            style: const TextStyle(fontSize: 14),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // Session picker
              Text(
                'Séance',
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: Colors.grey[800],
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Lors de quelle séance as-tu fait cet exercice ?',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey[600],
                ),
              ),
              const SizedBox(height: 10),
              _buildSessionPicker(),
              const SizedBox(height: 20),

              // Note
              Text(
                'Note (optionnel)',
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: Colors.grey[800],
                ),
              ),
              const SizedBox(height: 6),
              TextField(
                controller: _noteController,
                maxLines: 3,
                maxLength: 300,
                decoration: InputDecoration(
                  hintText: 'Ex: fait avec Pierre à 20:45',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  contentPadding: const EdgeInsets.all(12),
                ),
                enabled: !_isSubmitting,
              ),
              const SizedBox(height: 16),

              if (_errorMessage != null) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.red[50],
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.red[200]!),
                  ),
                  child: Text(
                    _errorMessage!,
                    style: TextStyle(color: Colors.red[800], fontSize: 13),
                  ),
                ),
                const SizedBox(height: 16),
              ],

              // Submit button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: (_isLoadingSessions || _isSubmitting)
                      ? null
                      : _submit,
                  icon: _isSubmitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.send),
                  label: Text(
                    _isSubmitting ? 'Envoi…' : 'Envoyer la demande',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 15,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.teal,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Center(
                child: TextButton(
                  onPressed: _isSubmitting
                      ? null
                      : () => Navigator.of(context).pop(false),
                  child: const Text('Annuler'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSessionPicker() {
    if (_isLoadingSessions) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.grey[50],
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey[300]!),
        ),
        child: Row(
          children: const [
            SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            SizedBox(width: 12),
            Text('Chargement des séances…'),
          ],
        ),
      );
    }

    if (_sessions.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.amber[50],
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.amber[200]!),
        ),
        child: Row(
          children: [
            Icon(Icons.info_outline, color: Colors.amber[800], size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Aucune séance trouvée dans les 30 derniers jours. '
                'La déclaration sera envoyée sans séance associée.',
                style: TextStyle(
                  fontSize: 13,
                  color: Colors.amber[900],
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[300]!),
      ),
      child: DropdownButtonHideUnderline(
        child: ButtonTheme(
          alignedDropdown: true,
          child: DropdownButton<_SessionOption?>(
            value: _selectedSession,
            hint: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 4),
              child: Text('Choisir une séance'),
            ),
            isExpanded: true,
            icon: const Padding(
              padding: EdgeInsets.only(right: 8),
              child: Icon(Icons.arrow_drop_down),
            ),
            items: [
              const DropdownMenuItem<_SessionOption?>(
                value: null,
                child: Text(
                  'Pas de séance spécifique',
                  style: TextStyle(fontStyle: FontStyle.italic),
                ),
              ),
              ..._sessions.map(
                (s) => DropdownMenuItem<_SessionOption?>(
                  value: s,
                  child: Text(
                    s.label,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            ],
            onChanged: _isSubmitting
                ? null
                : (v) => setState(() => _selectedSession = v),
          ),
        ),
      ),
    );
  }
}

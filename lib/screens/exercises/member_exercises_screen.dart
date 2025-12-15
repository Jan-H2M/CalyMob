import 'package:flutter/material.dart';
import '../../config/firebase_config.dart';
import '../../config/app_assets.dart';
import '../../models/exercice_valide.dart';
import '../../models/exercice_lifras.dart';
import '../../services/exercice_valide_service.dart';
import '../../utils/date_formatter.dart';
import 'validate_exercise_screen.dart';

/// Écran affichant les exercices validés d'un membre
class MemberExercisesScreen extends StatefulWidget {
  final String memberId;
  final String memberName;
  final bool isMonitor; // Si l'utilisateur actuel est moniteur (peut éditer)
  final bool isOwnProfile; // Si c'est le profil de l'utilisateur lui-même

  const MemberExercisesScreen({
    super.key,
    required this.memberId,
    required this.memberName,
    this.isMonitor = false,
    this.isOwnProfile = false,
  });

  @override
  State<MemberExercisesScreen> createState() => _MemberExercisesScreenState();
}

class _MemberExercisesScreenState extends State<MemberExercisesScreen> {
  final ExerciceValideService _service = ExerciceValideService();
  final String _clubId = FirebaseConfig.defaultClubId;

  List<ExerciceValide> _exercices = [];
  bool _isLoading = true;
  String? _errorMessage;
  NiveauLIFRAS? _filterNiveau;

  @override
  void initState() {
    super.initState();
    _loadExercices();
  }

  Future<void> _loadExercices() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      _exercices = await _service.getMemberExercicesValides(_clubId, widget.memberId);
    } catch (e) {
      _errorMessage = e.toString();
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  List<ExerciceValide> get _filteredExercices {
    if (_filterNiveau == null) return _exercices;
    return _exercices.where((e) => e.exerciceNiveau == _filterNiveau).toList();
  }

  Map<NiveauLIFRAS, List<ExerciceValide>> get _groupedExercices {
    return _service.groupByNiveau(_filteredExercices);
  }

  Future<void> _deleteExercice(ExerciceValide exercice) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Supprimer ?'),
        content: Text('Voulez-vous supprimer la validation de "${exercice.exerciceCode}" ?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Supprimer', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      await _service.deleteExerciceValide(
        clubId: _clubId,
        memberId: widget.memberId,
        exerciceValideId: exercice.id,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Exercice supprimé'),
            backgroundColor: Colors.green,
          ),
        );
        _loadExercices();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Exercices validés', style: TextStyle(color: Colors.white)),
            Text(
              widget.memberName,
              style: const TextStyle(fontSize: 14, color: Colors.white70),
            ),
          ],
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          if (widget.isMonitor)
            IconButton(
              icon: const Icon(Icons.add),
              onPressed: () async {
                final result = await Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ValidateExerciseScreen(
                      memberId: widget.memberId,
                      memberName: widget.memberName,
                    ),
                  ),
                );
                if (result == true) {
                  _loadExercices();
                }
              },
              tooltip: 'Valider un exercice',
            ),
        ],
      ),
      body: Stack(
        children: [
          // Ocean background
          Positioned.fill(
            child: Image.asset(
              AppAssets.backgroundFull,
              fit: BoxFit.cover,
            ),
          ),
          // Content
          SafeArea(
            child: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.error_outline, size: 64, color: Colors.red[300]),
                      const SizedBox(height: 16),
                      Text(_errorMessage!, textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadExercices,
                        child: const Text('Réessayer'),
                      ),
                    ],
                  ),
                )
              : _exercices.isEmpty
                  ? _buildEmptyState()
                  : _buildContent(),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.assignment_outlined, size: 80, color: Colors.grey[400]),
          const SizedBox(height: 16),
          Text(
            widget.isOwnProfile
                ? 'Vous n\'avez pas encore d\'exercices validés'
                : 'Aucun exercice validé',
            style: TextStyle(
              fontSize: 18,
              color: Colors.grey[600],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Les exercices validés apparaîtront ici',
            style: TextStyle(color: Colors.grey[500]),
          ),
          if (widget.isMonitor) ...[
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () async {
                final result = await Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ValidateExerciseScreen(
                      memberId: widget.memberId,
                      memberName: widget.memberName,
                    ),
                  ),
                );
                if (result == true) {
                  _loadExercices();
                }
              },
              icon: const Icon(Icons.add),
              label: const Text('Valider un exercice'),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.teal),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildContent() {
    final stats = _service.getStats(_exercices);

    return Column(
      children: [
        // Stats header
        Container(
          padding: const EdgeInsets.all(16),
          color: Colors.teal[50],
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildStat('Total', stats['total'].toString(), Colors.teal),
              if (stats['lastValidation'] != null)
                _buildStat(
                  'Dernière',
                  DateFormatter.formatShort(stats['lastValidation'] as DateTime),
                  Colors.blue,
                ),
            ],
          ),
        ),

        // Filter chips
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Row(
            children: [
              FilterChip(
                label: const Text('Tous'),
                selected: _filterNiveau == null,
                onSelected: (_) => setState(() => _filterNiveau = null),
                selectedColor: Colors.teal[100],
              ),
              const SizedBox(width: 8),
              ..._getAvailableNiveaux().map((niveau) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: Text(niveau.code),
                      selected: _filterNiveau == niveau,
                      onSelected: (_) => setState(() => _filterNiveau = niveau),
                      selectedColor: _getNiveauColor(niveau).withOpacity(0.3),
                      avatar: CircleAvatar(
                        backgroundColor: _getNiveauColor(niveau),
                        radius: 10,
                        child: Text(
                          _exercices.where((e) => e.exerciceNiveau == niveau).length.toString(),
                          style: const TextStyle(fontSize: 10, color: Colors.white),
                        ),
                      ),
                    ),
                  )),
            ],
          ),
        ),

        // Exercise list
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadExercices,
            child: ListView.builder(
              padding: const EdgeInsets.all(8),
              itemCount: _filteredExercices.length,
              itemBuilder: (context, index) {
                final exercice = _filteredExercices[index];
                return _buildExerciceCard(exercice);
              },
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildStat(String label, String value, Color color) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey[600],
          ),
        ),
      ],
    );
  }

  List<NiveauLIFRAS> _getAvailableNiveaux() {
    final niveaux = _exercices.map((e) => e.exerciceNiveau).toSet().toList();
    // Sort by enum order
    niveaux.sort((a, b) => a.index.compareTo(b.index));
    return niveaux;
  }

  Widget _buildExerciceCard(ExerciceValide exercice) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ListTile(
        leading: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: _getNiveauColor(exercice.exerciceNiveau),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Center(
            child: Text(
              exercice.exerciceNiveau.code,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 14,
              ),
            ),
          ),
        ),
        title: Text(
          exercice.exerciceCode,
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(exercice.exerciceDescription),
            const SizedBox(height: 4),
            Row(
              children: [
                Icon(Icons.calendar_today, size: 12, color: Colors.grey[600]),
                const SizedBox(width: 4),
                Text(
                  DateFormatter.formatMedium(exercice.dateValidation),
                  style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                ),
                const SizedBox(width: 12),
                Icon(Icons.person, size: 12, color: Colors.grey[600]),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    exercice.moniteurNom,
                    style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            if (exercice.lieu != null && exercice.lieu!.isNotEmpty) ...[
              const SizedBox(height: 2),
              Row(
                children: [
                  Icon(Icons.location_on, size: 12, color: Colors.grey[600]),
                  const SizedBox(width: 4),
                  Text(
                    exercice.lieu!,
                    style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                  ),
                ],
              ),
            ],
          ],
        ),
        trailing: widget.isMonitor
            ? PopupMenuButton<String>(
                onSelected: (value) {
                  if (value == 'delete') {
                    _deleteExercice(exercice);
                  }
                },
                itemBuilder: (_) => [
                  const PopupMenuItem(
                    value: 'delete',
                    child: Row(
                      children: [
                        Icon(Icons.delete, color: Colors.red),
                        SizedBox(width: 8),
                        Text('Supprimer'),
                      ],
                    ),
                  ),
                ],
              )
            : null,
        onTap: () => _showExerciceDetails(exercice),
      ),
    );
  }

  void _showExerciceDetails(ExerciceValide exercice) {
    showModalBottomSheet(
      context: context,
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: _getNiveauColor(exercice.exerciceNiveau),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    exercice.exerciceNiveau.code,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    exercice.exerciceCode,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              exercice.exerciceDescription,
              style: const TextStyle(fontSize: 16),
            ),
            const Divider(height: 32),
            _buildDetailRow(Icons.calendar_today, 'Date de validation',
                DateFormatter.formatLong(exercice.dateValidation)),
            _buildDetailRow(Icons.person, 'Moniteur', exercice.moniteurNom),
            if (exercice.lieu != null && exercice.lieu!.isNotEmpty)
              _buildDetailRow(Icons.location_on, 'Lieu', exercice.lieu!),
            if (exercice.notes != null && exercice.notes!.isNotEmpty)
              _buildDetailRow(Icons.notes, 'Notes', exercice.notes!),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: Colors.teal),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[600],
                  ),
                ),
                Text(
                  value,
                  style: const TextStyle(fontSize: 16),
                ),
              ],
            ),
          ),
        ],
      ),
    );
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
}

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lottie/lottie.dart';
import '../../models/piscine_session.dart';
import '../../services/piscine_session_service.dart';
import '../../providers/auth_provider.dart';
import '../../config/firebase_config.dart';
import '../../widgets/piscine_animated_background.dart';
import '../../theme/calypso_theme.dart';
import 'session_detail_screen.dart';

class PiscineListScreen extends StatefulWidget {
  const PiscineListScreen({super.key});

  @override
  State<PiscineListScreen> createState() => _PiscineListScreenState();
}

class _PiscineListScreenState extends State<PiscineListScreen>
    with TickerProviderStateMixin {
  final PiscineSessionService _sessionService = PiscineSessionService();
  late AnimationController _bubbleController;

  @override
  void initState() {
    super.initState();
    _bubbleController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 8),
    )..repeat();
  }

  @override
  void dispose() {
    _bubbleController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);
    final clubId = FirebaseConfig.defaultClubId;
    final userId = authProvider.currentUser?.uid;

    if (userId == null) {
      return const Scaffold(
        body: Center(child: Text('Niet verbonden')),
      );
    }

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text(
          'Séances Piscine',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: PiscineAnimatedBackground(
        showJellyfish: true,
        showBubbles: true,
        jellyfishCount: 2,
        child: SafeArea(
          child: StreamBuilder<List<PiscineSession>>(
            stream: _sessionService.getPublishedSessions(clubId),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(
                  child: CircularProgressIndicator(color: Colors.white),
                );
              }

              if (snapshot.hasError) {
                return Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline,
                          color: Colors.white70, size: 48),
                      const SizedBox(height: 16),
                      Text(
                        'Erreur de chargement',
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.9),
                          fontSize: 16,
                        ),
                      ),
                    ],
                  ),
                );
              }

              final sessions = snapshot.data ?? [];

              if (sessions.isEmpty) {
                return _buildEmptyState();
              }

              return ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: sessions.length,
                itemBuilder: (context, index) {
                  final session = sessions[index];
                  return _SessionCard(
                    session: session,
                    userId: userId,
                    onTap: () => _navigateToDetail(context, session),
                  );
                },
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Swimming fish animation
          Lottie.asset(
            'assets/animations/swimming_fish.json',
            width: 150,
            height: 150,
          ),
          const SizedBox(height: 24),
          Text(
            'Aucune séance planifiée',
            style: TextStyle(
              color: Colors.white.withOpacity(0.9),
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Les prochaines séances apparaîtront ici',
            style: TextStyle(
              color: Colors.white.withOpacity(0.7),
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }

  void _navigateToDetail(BuildContext context, PiscineSession session) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => SessionDetailScreen(session: session),
      ),
    );
  }
}

class _SessionCard extends StatelessWidget {
  final PiscineSession session;
  final String userId;
  final VoidCallback onTap;

  const _SessionCard({
    required this.session,
    required this.userId,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final userLevel = session.getEncadrantLevel(userId);
    final isAccueil = session.isAccueil(userId);
    final isBapteme = session.isBaptemeEncadrant(userId);

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      elevation: 4,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Colors.white,
                Colors.blue.shade50,
              ],
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Date and status row
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: CalypsoTheme.donkerblauw.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Icon(
                            Icons.calendar_today,
                            color: CalypsoTheme.donkerblauw,
                            size: 20,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              session.formattedDate,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: CalypsoTheme.donkerblauw,
                              ),
                            ),
                            Text(
                              session.formattedHoraire,
                              style: TextStyle(
                                fontSize: 13,
                                color: Colors.grey.shade600,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    _buildStatusBadge(),
                  ],
                ),

                const SizedBox(height: 16),

                // Location
                Row(
                  children: [
                    Icon(Icons.location_on,
                        size: 16,
                        color: Colors.grey.shade600),
                    const SizedBox(width: 4),
                    Text(
                      session.lieu,
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.grey.shade700,
                      ),
                    ),
                  ],
                ),

                const Divider(height: 24),

                // User role in this session
                if (isAccueil || isBapteme || userLevel != null) ...[
                  Text(
                    'Votre rôle',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade500,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: [
                      if (isAccueil)
                        _buildRoleBadge('Accueil', Icons.badge, Colors.blue),
                      if (isBapteme)
                        _buildRoleBadge('Baptêmes', Icons.pool, Colors.teal),
                      if (userLevel != null)
                        _buildRoleBadge(
                          'Encadrant ${PiscineLevel.displayName(userLevel)}',
                          Icons.school,
                          Colors.purple,
                        ),
                    ],
                  ),
                ] else ...[
                  // Show levels summary
                  _buildLevelsSummary(),
                ],

                const SizedBox(height: 12),

                // Chevron to indicate tapability
                Align(
                  alignment: Alignment.centerRight,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: CalypsoTheme.middenblauw.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'Voir détails',
                          style: TextStyle(
                            fontSize: 12,
                            color: CalypsoTheme.middenblauw,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Icon(
                          Icons.chevron_right,
                          size: 16,
                          color: CalypsoTheme.middenblauw,
                        ),
                      ],
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

  Widget _buildStatusBadge() {
    Color color;
    String text;
    IconData icon;

    switch (session.statut) {
      case PiscineSessionStatus.brouillon:
        color = Colors.orange;
        text = 'Brouillon';
        icon = Icons.edit_note;
        break;
      case PiscineSessionStatus.publie:
        color = Colors.green;
        text = 'Publié';
        icon = Icons.check_circle;
        break;
      case PiscineSessionStatus.termine:
        color = Colors.grey;
        text = 'Terminé';
        icon = Icons.done_all;
        break;
      default:
        color = Colors.grey;
        text = session.statut;
        icon = Icons.info;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            text,
            style: TextStyle(
              fontSize: 12,
              color: color,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRoleBadge(String label, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: color,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLevelsSummary() {
    // Count active levels (with at least one encadrant)
    final activeLevels = session.niveaux.entries
        .where((e) => e.value.encadrants.isNotEmpty)
        .map((e) => e.key)
        .toList();

    if (activeLevels.isEmpty) {
      return Text(
        'Aucun niveau configuré',
        style: TextStyle(
          fontSize: 13,
          color: Colors.grey.shade500,
          fontStyle: FontStyle.italic,
        ),
      );
    }

    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: activeLevels.map((level) {
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: CalypsoTheme.lichtblauw.withOpacity(0.2),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            '${PiscineLevel.stars(level)} $level',
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        );
      }).toList(),
    );
  }
}

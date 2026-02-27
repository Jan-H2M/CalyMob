import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:provider/provider.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../config/app_assets.dart';
import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../models/operation.dart';
import '../../services/local_read_tracker.dart';
import '../operations/event_discussion_screen.dart';
import '../../utils/date_formatter.dart';

/// Écran listant toutes les discussions des événements auxquels l'utilisateur est inscrit
class MessagesScreen extends StatelessWidget {
  const MessagesScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final userId = authProvider.currentUser?.uid ?? '';

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'Mes Messages',
          style: TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
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
            child: FutureBuilder<List<Operation>>(
        future: _loadUserEvents(userId),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, size: 64, color: Colors.red),
                  const SizedBox(height: 16),
                  Text('Erreur: ${snapshot.error}'),
                ],
              ),
            );
          }

          final operations = snapshot.data ?? [];

          if (operations.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.chat_bubble_outline, size: 80, color: Colors.grey[400]),
                  const SizedBox(height: 16),
                  Text(
                    'Aucune discussion',
                    style: TextStyle(
                      fontSize: 18,
                      color: Colors.grey[600],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Inscrivez-vous à un événement pour participer aux discussions',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey[500],
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: operations.length,
            itemBuilder: (context, index) {
              final operation = operations[index];
              return _buildEventCard(context, operation);
            },
          );
        },
      ),
          ),
        ],
      ),
    );
  }

  /// Charger tous les événements auxquels l'utilisateur est inscrit
  /// Utilise collectionGroup('inscriptions') pour trouver toutes les inscriptions,
  /// puis charge les opérations parentes (cohérent avec OperationService)
  Future<List<Operation>> _loadUserEvents(String userId) async {
    final clubId = FirebaseConfig.defaultClubId;
    try {
      // 1. Trouver toutes les inscriptions de l'utilisateur via collectionGroup
      final inscriptionsSnapshot = await FirebaseFirestore.instance
          .collectionGroup('inscriptions')
          .where('membre_id', isEqualTo: userId)
          .get();

      final List<Operation> userOperations = [];

      // 2. Pour chaque inscription, charger l'opération parente
      for (final inscDoc in inscriptionsSnapshot.docs) {
        try {
          // Vérifier que l'inscription appartient au bon club
          final path = inscDoc.reference.path;
          if (!path.startsWith('clubs/$clubId/')) continue;

          // Remonter vers le document operation parent
          final operationRef = inscDoc.reference.parent.parent;
          if (operationRef == null) continue;

          final operationDoc = await operationRef.get();
          if (!operationDoc.exists) continue;

          final data = operationDoc.data() as Map<String, dynamic>?;
          if (data == null) continue;

          // Filtrer seulement les événements
          if (data['type'] != 'evenement') continue;

          userOperations.add(Operation.fromFirestore(operationDoc));
        } catch (e) {
          debugPrint('⚠️ Erreur parsing inscription: $e');
        }
      }

      // 3. Trier par date décroissante
      userOperations.sort((a, b) {
        if (a.dateDebut == null && b.dateDebut == null) return 0;
        if (a.dateDebut == null) return 1;
        if (b.dateDebut == null) return -1;
        return b.dateDebut!.compareTo(a.dateDebut!);
      });

      return userOperations;
    } catch (e) {
      debugPrint('❌ Erreur chargement événements: $e');
      rethrow;
    }
  }

  Widget _buildUnreadBadge(BuildContext context, Operation operation) {
    final clubId = FirebaseConfig.defaultClubId;
    final tracker = LocalReadTracker();
    final epoch = DateTime(2024, 1, 1);

    // Gebruik LocalReadTracker timestamp om ongelezen te berekenen
    final lastRead = tracker.getLastRead('operation_${operation.id}') ?? epoch;

    return StreamBuilder<QuerySnapshot>(
      // Luister naar nieuwe messages na lastRead (real-time)
      stream: FirebaseFirestore.instance
          .collection('clubs/$clubId/operations/${operation.id}/messages')
          .where('created_at', isGreaterThan: Timestamp.fromDate(lastRead))
          .snapshots(),
      builder: (context, snapshot) {
        final unreadCount = snapshot.data?.docs.length ?? 0;
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (unreadCount > 0)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.red,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  unreadCount > 99 ? '99+' : unreadCount.toString(),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            if (unreadCount > 0) const SizedBox(width: 6),
            Icon(Icons.chevron_right, color: Colors.grey[400]),
          ],
        );
      },
    );
  }

  Widget _buildEventCard(BuildContext context, Operation operation) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      elevation: 2,
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => EventDiscussionScreen(
                clubId: FirebaseConfig.defaultClubId,
                operationId: operation.id,
                operationTitle: operation.titre,
              ),
            ),
          );
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              // Icône
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.teal.shade50,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  Icons.chat_bubble,
                  color: Colors.teal.shade700,
                  size: 28,
                ),
              ),

              const SizedBox(width: 16),

              // Détails
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      operation.titre,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    if (operation.dateDebut != null)
                      Text(
                        DateFormatter.formatMedium(operation.dateDebut!),
                        style: TextStyle(
                          fontSize: 14,
                          color: Colors.grey[600],
                        ),
                      ),
                    const SizedBox(height: 4),
                    StreamBuilder<QuerySnapshot>(
                      stream: FirebaseFirestore.instance
                          .collection('clubs/${FirebaseConfig.defaultClubId}/operations/${operation.id}/messages')
                          .orderBy('created_at', descending: true)
                          .limit(1)
                          .snapshots(),
                      builder: (context, msgSnapshot) {
                        if (!msgSnapshot.hasData || msgSnapshot.data!.docs.isEmpty) {
                          return Text(
                            'Aucun message',
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.grey[500],
                              fontStyle: FontStyle.italic,
                            ),
                          );
                        }

                        final lastMsg = msgSnapshot.data!.docs.first.data() as Map<String, dynamic>;
                        final lastMsgText = lastMsg['message'] as String? ?? '';
                        final lastMsgTime = (lastMsg['created_at'] as Timestamp?)?.toDate();

                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              lastMsgText.length > 50
                                  ? '${lastMsgText.substring(0, 50)}...'
                                  : lastMsgText,
                              style: TextStyle(
                                fontSize: 13,
                                color: Colors.grey[700],
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (lastMsgTime != null) ...[
                              const SizedBox(height: 2),
                              Text(
                                DateFormatter.formatRelative(lastMsgTime),
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey[500],
                                ),
                              ),
                            ],
                          ],
                        );
                      },
                    ),
                  ],
                ),
              ),

              // Unread badge + flèche
              _buildUnreadBadge(context, operation),
            ],
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:provider/provider.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../providers/auth_provider.dart';
import '../../models/operation.dart';
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
      appBar: AppBar(
        title: const Text(
          'Mes Messages',
          style: TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.teal,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: FutureBuilder<List<Operation>>(
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
    );
  }

  /// Charger tous les événements auxquels l'utilisateur est inscrit
  Future<List<Operation>> _loadUserEvents(String userId) async {
    try {
      // 1. Récupérer toutes les opérations (sans filtre)
      final operationsSnapshot = await FirebaseFirestore.instance
          .collection('clubs/calypso/operations')
          .get();

      final List<Operation> userOperations = [];

      // 2. Pour chaque opération, vérifier si c'est un événement et si l'utilisateur est inscrit
      for (final opDoc in operationsSnapshot.docs) {
        final data = opDoc.data();

        // Filtrer seulement les événements
        if (data['type'] != 'evenement') continue;

        // Vérifier si l'utilisateur est inscrit
        final inscriptionSnapshot = await FirebaseFirestore.instance
            .collection('clubs/calypso/operations/${opDoc.id}/inscriptions')
            .doc(userId)
            .get();

        if (inscriptionSnapshot.exists) {
          userOperations.add(Operation.fromFirestore(opDoc));
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
                clubId: 'calypso',
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
                          .collection('clubs/calypso/operations/${operation.id}/messages')
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

              // Flèche
              Icon(
                Icons.chevron_right,
                color: Colors.grey[400],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

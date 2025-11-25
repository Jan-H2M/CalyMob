import 'package:flutter/material.dart';
import '../models/operation.dart';
import '../utils/date_formatter.dart';
import '../utils/currency_formatter.dart';

/// Card pour afficher une opération dans une liste
class OperationCard extends StatelessWidget {
  final Operation operation;
  final int participantCount;
  final VoidCallback? onTap;

  const OperationCard({
    Key? key,
    required this.operation,
    this.participantCount = 0,
    this.onTap,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final isOpen = operation.statut == 'ouvert';
    final isFull = operation.capaciteMax != null &&
                   participantCount >= operation.capaciteMax!;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header avec titre et badge statut
              Row(
                children: [
                  Expanded(
                    child: Text(
                      operation.titre,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  _buildStatusBadge(isOpen, isFull),
                ],
              ),

              const SizedBox(height: 12),

              // Date
              if (operation.dateDebut != null)
                _buildInfoRow(
                  Icons.calendar_today,
                  DateFormatter.formatRelative(operation.dateDebut!),
                  DateFormatter.formatMedium(operation.dateDebut!),
                ),

              const SizedBox(height: 8),

              // Lieu
              if (operation.lieu != null)
                _buildInfoRow(
                  Icons.location_on,
                  operation.lieu!,
                  null,
                ),

              const SizedBox(height: 8),

              // Prix et capacité
              Row(
                children: [
                  // Prix
                  if (operation.prixMembre != null)
                    _buildInfoRow(
                      Icons.euro,
                      CurrencyFormatter.formatCompact(operation.prixMembre!),
                      null,
                    ),

                  const Spacer(),

                  // Capacité
                  if (operation.capaciteMax != null)
                    _buildCapacityIndicator(participantCount, operation.capaciteMax!),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Badge de statut (Ouvert/Fermé/Complet)
  Widget _buildStatusBadge(bool isOpen, bool isFull) {
    Color color;
    String label;
    IconData icon;

    if (!isOpen) {
      color = Colors.grey;
      label = 'FERMÉ';
      icon = Icons.cancel;
    } else if (isFull) {
      color = Colors.orange;
      label = 'COMPLET';
      icon = Icons.people;
    } else {
      color = Colors.green;
      label = 'OUVERT';
      icon = Icons.check_circle;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color, width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  /// Ligne d'info avec icône
  Widget _buildInfoRow(IconData icon, String text, String? subtitle) {
    return Row(
      children: [
        Icon(icon, size: 16, color: Colors.grey[600]),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                text,
                style: const TextStyle(fontSize: 14),
              ),
              if (subtitle != null)
                Text(
                  subtitle,
                  style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                ),
            ],
          ),
        ),
      ],
    );
  }

  /// Indicateur de capacité avec barre de progression
  Widget _buildCapacityIndicator(int current, int max) {
    final percentage = (current / max).clamp(0.0, 1.0);
    final color = percentage < 0.7 ? Colors.green : (percentage < 0.9 ? Colors.orange : Colors.red);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.people, size: 16, color: Colors.grey[600]),
        const SizedBox(width: 4),
        Text(
          '$current/$max',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 40,
          height: 4,
          child: LinearProgressIndicator(
            value: percentage,
            backgroundColor: Colors.grey[300],
            valueColor: AlwaysStoppedAnimation<Color>(color),
          ),
        ),
      ],
    );
  }
}

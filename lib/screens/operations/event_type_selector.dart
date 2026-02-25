import 'package:flutter/material.dart';
import '../../config/app_colors.dart';

/// Stap 0: Sélectionnez le type d'événement à créer
/// Toont alleen "Plongée" en "Sortie" (geen andere types)
/// Identiek aan OperationTypeSelector in CalyCompta
class EventTypeSelector extends StatelessWidget {
  final VoidCallback onClose;
  final ValueChanged<String> onCategorySelected; // 'plongee' of 'sortie'

  const EventTypeSelector({
    Key? key,
    required this.onClose,
    required this.onCategorySelected,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'Nouvelle activité',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: onClose,
        ),
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              AppColors.donkerblauw,
              AppColors.middenblauw,
              AppColors.lichtblauw.withOpacity(0.8),
            ],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              children: [
                const SizedBox(height: 40),
                // Subtitle
                Text(
                  'Sélectionnez le type d\'événement à créer',
                  style: TextStyle(
                    fontSize: 16,
                    color: Colors.white.withOpacity(0.9),
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 48),
                // Category cards
                _buildCategoryCard(
                  context,
                  icon: Icons.scuba_diving,
                  label: 'Plongée',
                  description: 'Sélectionner un lieu de plongée',
                  color: AppColors.middenblauw,
                  category: 'plongee',
                ),
                const SizedBox(height: 20),
                _buildCategoryCard(
                  context,
                  icon: Icons.directions_boat,
                  label: 'Sortie',
                  description: 'Événement festif ou sortie club',
                  color: AppColors.oranje,
                  category: 'sortie',
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildCategoryCard(
    BuildContext context, {
    required IconData icon,
    required String label,
    required String description,
    required Color color,
    required String category,
  }) {
    return GestureDetector(
      onTap: () => onCategorySelected(category),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 28),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: AppColors.donkerblauw.withOpacity(0.2),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            // Icon circle
            Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                color: color.withOpacity(0.15),
                shape: BoxShape.circle,
              ),
              child: Icon(
                icon,
                size: 30,
                color: color,
              ),
            ),
            const SizedBox(width: 20),
            // Text
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppColors.donkerblauw,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    description,
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey[600],
                    ),
                  ),
                ],
              ),
            ),
            // Arrow
            Icon(
              Icons.chevron_right,
              color: color.withOpacity(0.6),
              size: 28,
            ),
          ],
        ),
      ),
    );
  }
}

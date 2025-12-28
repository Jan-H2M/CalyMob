import 'package:flutter/material.dart';
import '../../models/piscine_session.dart';
import '../../config/app_colors.dart';

class ThemeEditDialog extends StatefulWidget {
  final String level;
  final String currentTheme;

  const ThemeEditDialog({
    super.key,
    required this.level,
    required this.currentTheme,
  });

  @override
  State<ThemeEditDialog> createState() => _ThemeEditDialogState();
}

class _ThemeEditDialogState extends State<ThemeEditDialog> {
  late TextEditingController _controller;
  final FocusNode _focusNode = FocusNode();

  // Suggestions courantes pour les thèmes
  static const List<String> _themeSuggestions = [
    'Initiation au palmage',
    'Vidage de masque',
    'Apnée statique',
    'Apnée dynamique',
    'Descente à la verticale',
    'Remontée contrôlée',
    'Lestage et équilibre',
    'RSE (Remontée Sans Embout)',
    'Déplacement en immersion',
    'Capelage/décapelage',
    'Assistance d\'un plongeur',
    'Orientation sous-marine',
    'Gestion de l\'air',
    'Communication sous-marine',
    'Exercices de respiration',
    'Perfectionnement PMT',
  ];

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.currentTheme);
    // Auto-focus on the text field
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _selectSuggestion(String suggestion) {
    _controller.text = suggestion;
    _controller.selection = TextSelection.fromPosition(
      TextPosition(offset: suggestion.length),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
      ),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 400, maxHeight: 500),
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.middenblauw.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    Icons.edit_note,
                    color: AppColors.middenblauw,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Thème du jour',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        '${PiscineLevel.stars(widget.level)} ${PiscineLevel.displayName(widget.level)}',
                        style: TextStyle(
                          fontSize: 14,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: Icon(Icons.close, color: Colors.grey.shade400),
                ),
              ],
            ),

            const SizedBox(height: 24),

            // Text field
            TextField(
              controller: _controller,
              focusNode: _focusNode,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: 'Décrivez le thème de la séance...',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: AppColors.middenblauw, width: 2),
                ),
                filled: true,
                fillColor: Colors.grey.shade50,
              ),
            ),

            const SizedBox(height: 16),

            // Suggestions
            Text(
              'Suggestions',
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey.shade600,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 8),

            Expanded(
              child: SingleChildScrollView(
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _themeSuggestions.map((suggestion) {
                    return InkWell(
                      onTap: () => _selectSuggestion(suggestion),
                      borderRadius: BorderRadius.circular(20),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.lichtblauw.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: AppColors.lichtblauw.withOpacity(0.3),
                          ),
                        ),
                        child: Text(
                          suggestion,
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.donkerblauw,
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),

            const SizedBox(height: 24),

            // Action buttons
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: Text(
                    'Annuler',
                    style: TextStyle(color: Colors.grey.shade600),
                  ),
                ),
                const SizedBox(width: 12),
                ElevatedButton(
                  onPressed: () {
                    Navigator.of(context).pop(_controller.text.trim());
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.middenblauw,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 24,
                      vertical: 12,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text(
                    'Enregistrer',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

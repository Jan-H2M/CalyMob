import 'package:flutter/material.dart';
import '../../config/app_colors.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'logbook_entry_screen.dart';
import 'logbook_ocr_capture_screen.dart';
import 'logbook_xlsx_import_screen.dart';

class LogbookAddChoiceScreen extends StatelessWidget {
  const LogbookAddChoiceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.donkerblauw,
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          bottom: false,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
            children: [
              Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.arrow_back, color: Colors.white),
                    tooltip: 'Retour',
                  ),
                  const SizedBox(width: 4),
                  const Expanded(
                    child: Text(
                      'Ajouter une plongée',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              _ChoiceButton(
                icon: Icons.edit_note,
                title: 'Saisie manuelle',
                subtitle: 'Créer une plongée avec le formulaire classique.',
                onTap: () async {
                  final result = await Navigator.push<LogbookEntrySaveResult>(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const LogbookEntryScreen.manual(
                        enableDictation: false,
                      ),
                    ),
                  );
                  if (context.mounted && result != null) {
                    Navigator.pop(context, result);
                  }
                },
              ),
              const SizedBox(height: 12),
              _ChoiceButton(
                icon: Icons.mic_none,
                title: 'Dicter une plongée',
                subtitle: 'Parler, analyser, puis remplir les champs.',
                onTap: () async {
                  final result = await Navigator.push<LogbookEntrySaveResult>(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const LogbookEntryScreen.manual(
                        enableDictation: true,
                      ),
                    ),
                  );
                  if (context.mounted && result != null) {
                    Navigator.pop(context, result);
                  }
                },
              ),
              const SizedBox(height: 12),
              _ChoiceButton(
                icon: Icons.document_scanner_outlined,
                title: 'Scanner un carnet papier',
                subtitle: 'Lire une page avec OCR avant import.',
                onTap: () => Navigator.pushReplacement(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const LogbookOcrCaptureScreen(),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              _ChoiceButton(
                icon: Icons.table_chart_outlined,
                title: 'Importer depuis Excel',
                subtitle: 'Choisir et vérifier un fichier .xlsx dans CalyMob.',
                onTap: () async {
                  final imported = await Navigator.push<bool>(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const LogbookXlsxImportScreen(),
                    ),
                  );
                  if (context.mounted && imported == true) {
                    Navigator.pop(context);
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChoiceButton extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _ChoiceButton({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.94),
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppColors.middenblauw.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: AppColors.middenblauw, size: 26),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: AppColors.donkerblauw,
                        fontSize: 17,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: AppColors.donkerblauw.withValues(alpha: 0.70),
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              const Icon(Icons.chevron_right, color: AppColors.middenblauw),
            ],
          ),
        ),
      ),
    );
  }
}

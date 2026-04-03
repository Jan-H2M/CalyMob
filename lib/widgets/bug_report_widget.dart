import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:provider/provider.dart';
import '../config/app_colors.dart';
import '../config/firebase_config.dart';
import '../providers/auth_provider.dart';
import '../providers/member_provider.dart';
import '../services/bug_report_service.dart';

/// Clé globale pour la RepaintBoundary (screenshot capture).
/// Doit envelopper le widget racine de l'app (dans MyApp).
final GlobalKey repaintBoundaryKey = GlobalKey();

/// Contrôleur global du mode bug report.
/// Permet d'activer/désactiver le mode depuis n'importe quel écran.
class BugReportController extends ChangeNotifier {
  bool _isActive = false;
  Timer? _timeoutTimer;

  bool get isActive => _isActive;

  /// Active le mode bug report (affiche l'icône flottante).
  /// S'annule automatiquement après [timeoutSeconds].
  void activate({int timeoutSeconds = 60}) {
    _isActive = true;
    _timeoutTimer?.cancel();
    _timeoutTimer = Timer(Duration(seconds: timeoutSeconds), () {
      deactivate();
    });
    notifyListeners();
  }

  /// Désactive le mode bug report (masque l'icône).
  void deactivate() {
    _isActive = false;
    _timeoutTimer?.cancel();
    _timeoutTimer = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _timeoutTimer?.cancel();
    super.dispose();
  }
}

/// Widget overlay qui affiche l'icône 🐛 flottante quand le mode est actif.
/// Doit être placé comme enfant de l'arbre widget principal (ex: dans Stack de MyApp).
class BugReportOverlay extends StatefulWidget {
  final Widget child;

  const BugReportOverlay({super.key, required this.child});

  @override
  State<BugReportOverlay> createState() => _BugReportOverlayState();
}

class _BugReportOverlayState extends State<BugReportOverlay> {
  // Position initiale de l'icône (en bas à droite)
  double _xPos = -1; // -1 = pas encore initialisé
  double _yPos = -1;

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider.value(
      value: bugReportController,
      child: Consumer<BugReportController>(
        builder: (context, controller, _) {
          return Stack(
            children: [
              widget.child,
              if (controller.isActive)
                _BugIconOverlay(
                  xPos: _xPos,
                  yPos: _yPos,
                  onPositionChanged: (x, y) {
                    _xPos = x;
                    _yPos = y;
                  },
                  onTap: () => _captureAndShowForm(context),
                ),
            ],
          );
        },
      ),
    );
  }

  /// Prend un screenshot et ouvre le formulaire.
  Future<void> _captureAndShowForm(BuildContext context) async {
    Uint8List? screenshotBytes;

    try {
      // Capturer le screenshot VIA RepaintBoundary
      final boundary = repaintBoundaryKey.currentContext?.findRenderObject()
          as RenderRepaintBoundary?;

      if (boundary != null) {
        final image = await boundary.toImage(pixelRatio: 2.0);
        final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
        screenshotBytes = byteData?.buffer.asUint8List();
        debugPrint('📸 Screenshot capturé: ${screenshotBytes?.length ?? 0} bytes');
      }
    } catch (e) {
      debugPrint('⚠️ Impossible de capturer le screenshot: $e');
    }

    if (!context.mounted) return;

    // Ouvrir le formulaire dans un bottom sheet
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _BugReportForm(
        screenshotBytes: screenshotBytes,
      ),
    );
  }
}

/// L'icône 🐛 flottante, draggable.
class _BugIconOverlay extends StatefulWidget {
  final double xPos;
  final double yPos;
  final void Function(double x, double y) onPositionChanged;
  final VoidCallback onTap;

  const _BugIconOverlay({
    required this.xPos,
    required this.yPos,
    required this.onPositionChanged,
    required this.onTap,
  });

  @override
  State<_BugIconOverlay> createState() => _BugIconOverlayState();
}

class _BugIconOverlayState extends State<_BugIconOverlay>
    with SingleTickerProviderStateMixin {
  late double _x;
  late double _y;
  late AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final screenSize = MediaQuery.of(context).size;

    // Position par défaut: en bas à droite
    if (widget.xPos < 0) {
      _x = screenSize.width - 64;
      _y = screenSize.height - 160;
    } else {
      _x = widget.xPos;
      _y = widget.yPos;
    }

    return Positioned(
      left: _x,
      top: _y,
      child: GestureDetector(
        onPanUpdate: (details) {
          setState(() {
            _x = (_x + details.delta.dx).clamp(0, screenSize.width - 48);
            _y = (_y + details.delta.dy).clamp(0, screenSize.height - 48);
          });
          widget.onPositionChanged(_x, _y);
        },
        onTap: widget.onTap,
        child: AnimatedBuilder(
          animation: _pulseController,
          builder: (context, child) {
            final scale = 1.0 + (_pulseController.value * 0.08);
            return Transform.scale(
              scale: scale,
              child: child,
            );
          },
          child: Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: AppColors.oranje.withOpacity(0.9),
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: AppColors.oranje.withOpacity(0.4),
                  blurRadius: 12,
                  spreadRadius: 2,
                ),
              ],
            ),
            child: const Center(
              child: Text('🐛', style: TextStyle(fontSize: 24)),
            ),
          ),
        ),
      ),
    );
  }
}

/// Le formulaire de signalement dans un bottom sheet.
class _BugReportForm extends StatefulWidget {
  final Uint8List? screenshotBytes;

  const _BugReportForm({this.screenshotBytes});

  @override
  State<_BugReportForm> createState() => _BugReportFormState();
}

class _BugReportFormState extends State<_BugReportForm> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _bugReportService = BugReportService();

  String _priority = 'annoying'; // Par défaut: gênant
  bool _includeScreenshot = true;
  bool _isSending = false;

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      margin: EdgeInsets.only(bottom: bottomInset),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: DraggableScrollableSheet(
        initialChildSize: 0.85,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, scrollController) {
          return SingleChildScrollView(
            controller: scrollController,
            padding: const EdgeInsets.all(20),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Handle bar
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.grey[300],
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Titre du formulaire
                  Row(
                    children: [
                      const Text('🐛', style: TextStyle(fontSize: 24)),
                      const SizedBox(width: 8),
                      Text(
                        'Signaler un bug',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: AppColors.donkerblauw,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // Screenshot preview
                  if (widget.screenshotBytes != null && _includeScreenshot)
                    _buildScreenshotPreview(),

                  // Titre du problème
                  TextFormField(
                    controller: _titleController,
                    decoration: const InputDecoration(
                      labelText: 'Quel est le problème ?',
                      hintText: "Ex: L'app se ferme quand j'ouvre la caméra",
                    ),
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return 'Veuillez décrire le problème';
                      }
                      return null;
                    },
                    maxLines: 2,
                    textInputAction: TextInputAction.next,
                  ),
                  const SizedBox(height: 16),

                  // Description détaillée
                  TextFormField(
                    controller: _descriptionController,
                    decoration: const InputDecoration(
                      labelText: 'Plus de détails (optionnel)',
                      hintText: 'Quand est-ce que ça arrive ? Étapes pour reproduire...',
                    ),
                    maxLines: 3,
                  ),
                  const SizedBox(height: 20),

                  // Sélecteur de gravité
                  Text(
                    'Gravité',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Colors.grey[700],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      _buildPriorityChip('blocking', '🔴', 'Bloquant'),
                      const SizedBox(width: 8),
                      _buildPriorityChip('annoying', '🟡', 'Gênant'),
                      const SizedBox(width: 8),
                      _buildPriorityChip('minor', '🔵', 'Mineur'),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Bouton envoyer
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton.icon(
                      onPressed: _isSending ? null : _submit,
                      icon: _isSending
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : const Icon(Icons.send),
                      label: Text(_isSending ? 'Envoi en cours...' : 'Envoyer'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.middenblauw,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Info: données auto-collectées
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.grey[100],
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.info_outline, size: 16, color: Colors.grey[500]),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Les informations de votre appareil et la version de '
                            "l'app seront envoyées automatiquement pour nous aider "
                            'à résoudre le problème.',
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.grey[600],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildScreenshotPreview() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Capture d\'écran',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Colors.grey[700],
              ),
            ),
            TextButton.icon(
              onPressed: () => setState(() => _includeScreenshot = false),
              icon: const Icon(Icons.close, size: 16),
              label: const Text('Retirer'),
              style: TextButton.styleFrom(
                foregroundColor: Colors.red[400],
                textStyle: const TextStyle(fontSize: 12),
              ),
            ),
          ],
        ),
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.memory(
            widget.screenshotBytes!,
            height: 160,
            width: double.infinity,
            fit: BoxFit.cover,
          ),
        ),
        const SizedBox(height: 16),
      ],
    );
  }

  Widget _buildPriorityChip(String value, String emoji, String label) {
    final isSelected = _priority == value;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _priority = value),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: isSelected ? AppColors.middenblauw.withOpacity(0.1) : Colors.grey[100],
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: isSelected ? AppColors.middenblauw : Colors.grey[300]!,
              width: isSelected ? 2 : 1,
            ),
          ),
          child: Column(
            children: [
              Text(emoji, style: const TextStyle(fontSize: 20)),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                  color: isSelected ? AppColors.middenblauw : Colors.grey[700],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSending = true);

    try {
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      final memberProvider = Provider.of<MemberProvider>(context, listen: false);
      final clubId = FirebaseConfig.defaultClubId;
      final userId = authProvider.currentUser?.uid ?? '';
      final userName = memberProvider.displayName;
      final userEmail = authProvider.currentUser?.email ?? '';

      // Déterminer la route actuelle
      String? currentRoute;
      try {
        currentRoute = ModalRoute.of(context)?.settings.name;
      } catch (_) {}

      await _bugReportService.submitBugReport(
        clubId: clubId,
        userId: userId,
        userName: userName,
        userEmail: userEmail,
        title: _titleController.text.trim(),
        description: _descriptionController.text.trim().isEmpty
            ? null
            : _descriptionController.text.trim(),
        priority: _priority,
        screenshotBytes: _includeScreenshot ? widget.screenshotBytes : null,
        currentRoute: currentRoute,
      );

      // Désactiver le mode bug report
      bugReportController.deactivate();

      if (!mounted) return;

      // Fermer le bottom sheet
      Navigator.of(context).pop();

      // Afficher confirmation
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Row(
            children: [
              Icon(Icons.check_circle, color: Colors.white),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Merci ! Nous allons examiner votre signalement.',
                ),
              ),
            ],
          ),
          backgroundColor: AppColors.success,
          duration: Duration(seconds: 3),
        ),
      );
    } catch (e) {
      debugPrint('❌ Erreur envoi bug report: $e');
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erreur lors de l\'envoi: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }
}

/// Instance globale du contrôleur.
/// Utilisé par le Settings screen pour activer et par le widget pour écouter.
final bugReportController = BugReportController();

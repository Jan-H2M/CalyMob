import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../services/logbook_ocr_import_service.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'logbook_ocr_review_screen.dart';

class LogbookOcrCaptureScreen extends StatefulWidget {
  const LogbookOcrCaptureScreen({super.key});

  @override
  State<LogbookOcrCaptureScreen> createState() =>
      _LogbookOcrCaptureScreenState();
}

class _LogbookOcrCaptureScreenState extends State<LogbookOcrCaptureScreen> {
  final ImagePicker _picker = ImagePicker();
  final LogbookOcrImportService _service = LogbookOcrImportService();

  Uint8List? _imageBytes;
  String? _imageName;
  int _defaultYear = DateTime.now().year;
  bool _analyzing = false;

  Future<void> _pick(ImageSource source) async {
    try {
      final image = await _picker.pickImage(
        source: source,
        imageQuality: 82,
        maxWidth: 1800,
      );
      if (image == null) return;
      final bytes = await image.readAsBytes();
      if (!mounted) return;
      setState(() {
        _imageBytes = bytes;
        _imageName = image.name;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Impossible de charger la photo: $e')),
      );
    }
  }

  Future<void> _analyze() async {
    final bytes = _imageBytes;
    if (bytes == null || _analyzing) return;
    setState(() => _analyzing = true);
    try {
      final userId = context.read<AuthProvider>().currentUser?.uid;
      if (userId == null) throw 'Session non identifiée';
      final draft = await _service.analyzePage(
        clubId: FirebaseConfig.defaultClubId,
        memberId: userId,
        imageBytes: bytes,
        contentType: _contentTypeFromName(_imageName),
        defaultYear: _defaultYear,
      );
      if (!mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => LogbookOcrReviewScreen(
            draft: draft,
            imageBytes: bytes,
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Analyse impossible: $e')),
      );
    } finally {
      if (mounted) setState(() => _analyzing = false);
    }
  }

  String _contentTypeFromName(String? name) {
    final lower = (name ?? '').toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  @override
  Widget build(BuildContext context) {
    final years = List<int>.generate(8, (i) => DateTime.now().year - i);

    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _header(),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
                  children: [
                    _previewCard(),
                    const SizedBox(height: 12),
                    _whiteCard(
                      child: Row(
                        children: [
                          const Icon(
                            Icons.calendar_today_outlined,
                            color: AppColors.middenblauw,
                            size: 18,
                          ),
                          const SizedBox(width: 10),
                          const Expanded(
                            child: Text(
                              'Année des plongées',
                              style: TextStyle(fontWeight: FontWeight.w700),
                            ),
                          ),
                          DropdownButton<int>(
                            value: _defaultYear,
                            underline: const SizedBox.shrink(),
                            items: [
                              for (final y in years)
                                DropdownMenuItem(value: y, child: Text('$y')),
                            ],
                            onChanged: (v) {
                              if (v != null) setState(() => _defaultYear = v);
                            },
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    _whiteCard(
                      child: const Text(
                        'La photo sera analysée comme brouillon. Tu vérifieras '
                        'chaque plongée avant l’import dans Mon carnet.',
                        style: TextStyle(height: 1.35),
                      ),
                    ),
                    if (_analyzing) ...[
                      const SizedBox(height: 12),
                      _analyzingBanner(),
                    ],
                  ],
                ),
              ),
              _bottomBar(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 16, 8),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Scanner un carnet papier',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 21,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  'photo · analyse IA · validation',
                  style: TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _previewCard() {
    final bytes = _imageBytes;
    return Container(
      height: 360,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.35)),
      ),
      clipBehavior: Clip.antiAlias,
      child: bytes == null
          ? Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: () => _pick(ImageSource.camera),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.document_scanner_outlined,
                      size: 68,
                      color: AppColors.middenblauw.withValues(alpha: 0.85),
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'Photographie une page entière',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Garde les colonnes et les notes visibles.',
                      style: TextStyle(color: Colors.grey.shade700),
                    ),
                  ],
                ),
              ),
            )
          : Stack(
              fit: StackFit.expand,
              children: [
                Image.memory(bytes, fit: BoxFit.cover),
                Positioned(
                  left: 12,
                  right: 12,
                  bottom: 12,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 7,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.45),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      _imageName ?? 'Photo sélectionnée',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _bottomBar() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            AppColors.donkerblauw.withValues(alpha: 0),
            AppColors.donkerblauw.withValues(alpha: 0.50),
          ],
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: _analyzing ? null : () => _pick(ImageSource.gallery),
              icon: const Icon(Icons.photo_library_outlined),
              label: const Text('Galerie'),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                side: BorderSide(color: Colors.white.withValues(alpha: 0.55)),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: _analyzing ? null : () => _pick(ImageSource.camera),
              icon: const Icon(Icons.photo_camera_outlined),
              label: const Text('Prendre'),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                side: BorderSide(color: Colors.white.withValues(alpha: 0.55)),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: ElevatedButton.icon(
              onPressed: _imageBytes == null || _analyzing ? null : _analyze,
              icon: _analyzing
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.auto_fix_high_outlined),
              label: Text(_analyzing ? 'Analyse…' : 'Analyser'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.middenblauw,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _whiteCard({required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(14),
      ),
      child: child,
    );
  }

  /// Animated banner shown while the Cloud Function does its work. Cycles
  /// reassuring status messages every ~2.5 seconds so the user knows the app
  /// is still working — the AI call typically takes 8-15 seconds end-to-end.
  Widget _analyzingBanner() {
    return _AnalyzingBanner();
  }
}

class _AnalyzingBanner extends StatefulWidget {
  @override
  State<_AnalyzingBanner> createState() => _AnalyzingBannerState();
}

class _AnalyzingBannerState extends State<_AnalyzingBanner> {
  static const _steps = <_AnalysisStep>[
    _AnalysisStep(Icons.cloud_upload_outlined, 'Envoi de la photo…'),
    _AnalysisStep(Icons.psychology_outlined, "L'IA lit ton carnet…"),
    _AnalysisStep(Icons.search,
        'Recherche des dates, lieux, profondeurs…'),
    _AnalysisStep(Icons.set_meal_outlined,
        'Identification de la faune dans tes notes…'),
    _AnalysisStep(Icons.fact_check_outlined,
        "Mise en forme du brouillon…"),
    _AnalysisStep(Icons.hourglass_top_outlined,
        "Encore un instant — ça finalise…"),
  ];

  int _i = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(milliseconds: 2500), (_) {
      if (!mounted) return;
      setState(() => _i = (_i + 1) % _steps.length);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final step = _steps[_i];
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 14, 14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.middenblauw.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(
              strokeWidth: 2.5,
              valueColor: AlwaysStoppedAnimation<Color>(AppColors.middenblauw),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 350),
              child: Row(
                key: ValueKey(_i),
                children: [
                  Icon(step.icon,
                      size: 18, color: AppColors.donkerblauw),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      step.label,
                      style: TextStyle(
                        color: AppColors.donkerblauw,
                        fontWeight: FontWeight.w600,
                        fontSize: 13.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AnalysisStep {
  final IconData icon;
  final String label;
  const _AnalysisStep(this.icon, this.label);
}

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../config/app_colors.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'historical_validation_screen.dart';

class HistoricalQrScanScreen extends StatefulWidget {
  const HistoricalQrScanScreen({super.key});

  @override
  State<HistoricalQrScanScreen> createState() => _HistoricalQrScanScreenState();
}

class _HistoricalQrScanScreenState extends State<HistoricalQrScanScreen> {
  final MobileScannerController _scannerController = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const [BarcodeFormat.qrCode],
  );

  bool _handlingScan = false;
  String? _errorMessage;

  @override
  void dispose() {
    _scannerController.dispose();
    super.dispose();
  }

  Future<void> _handleBarcode(BarcodeCapture capture) async {
    if (_handlingScan) return;
    final raw = capture.barcodes
        .map((barcode) => barcode.rawValue)
        .whereType<String>()
        .firstOrNull;
    if (raw == null || raw.isEmpty) return;

    final batchId = _extractBatchId(raw);
    if (batchId == null || batchId.isEmpty) {
      setState(() {
        _errorMessage =
            'Ce QR ne correspond pas à une reprise de carte papier CalyMob.';
      });
      return;
    }

    setState(() {
      _handlingScan = true;
      _errorMessage = null;
    });
    await _scannerController.stop();
    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => HistoricalValidationScreen(batchId: batchId),
      ),
    );
  }

  String? _extractBatchId(String raw) {
    final uri = Uri.tryParse(raw.trim());
    if (uri == null) return null;

    if (uri.scheme == 'calymob' && uri.host == 'historical-validation') {
      return uri.queryParameters['batchId'];
    }

    if ((uri.scheme == 'https' || uri.scheme == 'http') &&
        uri.path.contains('historical-validation')) {
      return uri.queryParameters['batchId'];
    }

    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _header(),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  child: Column(
                    children: [
                      _instructionCard(),
                      const SizedBox(height: 14),
                      Expanded(child: _scannerCard()),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 16, 10),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          const Expanded(
            child: Text(
              'Scanner carte papier',
              style: TextStyle(
                color: Colors.white,
                fontSize: 21,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          ValueListenableBuilder<MobileScannerState>(
            valueListenable: _scannerController,
            builder: (context, state, child) {
              final torchOn = state.torchState == TorchState.on;
              return IconButton(
                icon: Icon(
                  torchOn ? Icons.flash_on : Icons.flash_off,
                  color: torchOn ? AppColors.oranje : Colors.white,
                ),
                onPressed: () => _scannerController.toggleTorch(),
                tooltip: 'Lampe',
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _instructionCard() {
    return _WhiteCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.qr_code_scanner, color: AppColors.middenblauw),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Demande à l’élève d’ouvrir “Reprise envoyée” et de montrer le QR. '
              'Après le scan, vérifie toujours la carte papier avant de valider.',
              style: TextStyle(
                color: AppColors.donkerblauw.withValues(alpha: 0.76),
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _scannerCard() {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _scannerController,
            onDetect: _handleBarcode,
            errorBuilder: (context, error, child) {
              return Container(
                color: Colors.black,
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.no_photography_outlined,
                        color: Colors.white, size: 46),
                    const SizedBox(height: 14),
                    const Text(
                      'Caméra indisponible',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      error.errorDetails?.message ??
                          'Autorise l’accès caméra ou teste sur un téléphone.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.72),
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
          _scanFrame(),
          if (_errorMessage != null)
            Positioned(
              left: 14,
              right: 14,
              bottom: 14,
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.error.withValues(alpha: 0.94),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _errorMessage!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          if (_handlingScan)
            Container(
              color: Colors.black54,
              child: const Center(
                child: CircularProgressIndicator(color: Colors.white),
              ),
            ),
        ],
      ),
    );
  }

  Widget _scanFrame() {
    return IgnorePointer(
      child: Center(
        child: Container(
          width: 230,
          height: 230,
          decoration: BoxDecoration(
            border: Border.all(color: Colors.white, width: 3),
            borderRadius: BorderRadius.circular(22),
          ),
        ),
      ),
    );
  }
}

class _WhiteCard extends StatelessWidget {
  final Widget child;
  const _WhiteCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: child,
    );
  }
}

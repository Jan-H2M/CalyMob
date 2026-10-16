import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../services/boutique/boutique_operations_service.dart';

/// Dedicated scanner: article codes can never enter attendance/member flows.
class BoutiqueQrScanScreen extends StatefulWidget {
  final String title;
  final String instruction;
  final Future<String> Function(String) onScan;
  final bool closeAfterScan;
  const BoutiqueQrScanScreen(
      {super.key,
      required this.title,
      required this.instruction,
      required this.onScan,
      this.closeAfterScan = false});
  @override
  State<BoutiqueQrScanScreen> createState() => _BoutiqueQrScanScreenState();
}

class _BoutiqueQrScanScreenState extends State<BoutiqueQrScanScreen>
    with WidgetsBindingObserver {
  final _camera =
      MobileScannerController(autoStart: true, formats: [BarcodeFormat.qrCode]);
  final _manual = TextEditingController();
  bool _working = false;
  String _feedback = 'Prêt à scanner';
  String? _last;
  DateTime? _lastAt;
  bool _error = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _camera.start();
    } else {
      _camera.stop();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _camera.dispose();
    _manual.dispose();
    super.dispose();
  }

  Future<void> _scan(String code) async {
    if (_working ||
        (code == _last &&
            _lastAt != null &&
            DateTime.now().difference(_lastAt!).inSeconds < 2)) {
      return;
    }
    setState(() {
      _working = true;
      _last = code;
      _lastAt = DateTime.now();
    });
    try {
      final message = await widget.onScan(code.trim());
      if (!mounted) return;
      if (widget.closeAfterScan) {
        Navigator.pop(context, code.trim());
        return;
      }
      setState(() {
        _feedback = message;
        _error = false;
        _manual.clear();
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _feedback = BoutiqueOperationsService.message(e);
          _error = true;
        });
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(widget.title), actions: [
          IconButton(
              tooltip: 'Lampe',
              onPressed: () => _camera.toggleTorch(),
              icon: const Icon(Icons.flashlight_on_outlined))
        ]),
        body: SafeArea(
            child: Column(children: [
          Padding(
              padding: const EdgeInsets.all(16),
              child: Text(widget.instruction)),
          Expanded(
              child: MobileScanner(
                  controller: _camera,
                  onDetect: (capture) {
                    final codes = capture.barcodes
                        .map((b) => b.rawValue)
                        .whereType<String>();
                    if (codes.isNotEmpty) _scan(codes.first);
                  },
                  errorBuilder: (context, error, child) => const Center(
                      child: Padding(
                          padding: EdgeInsets.all(24),
                          child: Text(
                              'Caméra indisponible. Autorisez-la dans les réglages ou saisissez le code ci-dessous.'))))),
          Padding(
              padding: const EdgeInsets.all(16),
              child: Column(children: [
                Semantics(
                    liveRegion: true,
                    child: Text(_working ? 'Vérification…' : _feedback,
                        style: TextStyle(
                            color: _error
                                ? Colors.red.shade800
                                : Colors.green.shade800,
                            fontWeight: FontWeight.w600))),
                const SizedBox(height: 12),
                TextField(
                    controller: _manual,
                    decoration: const InputDecoration(
                        labelText: 'Code ou lien QR · saisie de secours',
                        border: OutlineInputBorder()),
                    onSubmitted: _working ? null : _scan),
                Row(children: [
                  TextButton(
                      onPressed: _working ? null : () => _scan(_manual.text),
                      child: const Text('Vérifier le code')),
                  const Spacer(),
                  FilledButton(
                      onPressed: _working ? null : () => Navigator.pop(context),
                      child: const Text('Terminer'))
                ]),
              ])),
        ])),
      );
}

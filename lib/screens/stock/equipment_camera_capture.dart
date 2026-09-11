import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

/// Shared live camera view for equipment evidence. Unlike ImagePicker's web
/// implementation this opens getUserMedia in Chrome, so Camera and Gallery
/// are genuinely two distinct actions.
class EquipmentCameraCapture extends StatefulWidget {
  const EquipmentCameraCapture({super.key});

  @override
  State<EquipmentCameraCapture> createState() => _EquipmentCameraCaptureState();
}

class _EquipmentCameraCaptureState extends State<EquipmentCameraCapture> {
  CameraController? _controller;
  String? _error;
  bool _taking = false;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) throw StateError('Aucune caméra disponible');
      final preferred = cameras.firstWhere(
        (camera) => camera.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );
      final controller = CameraController(
        preferred,
        ResolutionPreset.medium,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() => _controller = controller);
    } catch (error) {
      if (mounted) setState(() => _error = '$error');
    }
  }

  Future<void> _capture() async {
    final controller = _controller;
    if (controller == null || _taking) return;
    setState(() => _taking = true);
    try {
      final image = await controller.takePicture();
      final bytes = await image.readAsBytes();
      if (mounted) Navigator.pop(context, bytes);
    } finally {
      if (mounted) setState(() => _taking = false);
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          title: const Text('Prendre une photo'),
          backgroundColor: Colors.black,
          foregroundColor: Colors.white,
        ),
        body: _error != null
            ? Center(
                child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text('Caméra indisponible : $_error',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white))))
            : _controller == null
                ? const Center(
                    child: CircularProgressIndicator(color: Colors.white))
                : Column(children: [
                    Expanded(child: Center(child: CameraPreview(_controller!))),
                    SafeArea(
                        child: Padding(
                            padding: const EdgeInsets.all(22),
                            child: FloatingActionButton.large(
                                onPressed: _taking ? null : _capture,
                                backgroundColor: Colors.white,
                                foregroundColor: Colors.black,
                                child: _taking
                                    ? const CircularProgressIndicator()
                                    : const Icon(Icons.camera_alt, size: 34))))
                  ]),
      );
}

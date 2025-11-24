import 'dart:io';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'package:path_provider/path_provider.dart';

/// Écran de capture photo avec détection de visage
class FaceCameraScreen extends StatefulWidget {
  const FaceCameraScreen({super.key});

  @override
  State<FaceCameraScreen> createState() => _FaceCameraScreenState();
}

class _FaceCameraScreenState extends State<FaceCameraScreen> {
  CameraController? _cameraController;
  bool _isInitialized = false;
  bool _isFaceDetected = false;
  bool _isProcessing = false;
  String? _errorMessage;

  final FaceDetector _faceDetector = FaceDetector(
    options: FaceDetectorOptions(
      enableContours: false,
      enableClassification: false,
      enableLandmarks: false,
      enableTracking: false,
      minFaceSize: 0.15, // Le visage doit occuper au moins 15% de l'image
      performanceMode: FaceDetectorMode.fast,
    ),
  );

  @override
  void initState() {
    super.initState();
    _initializeCamera();
  }

  @override
  void dispose() {
    _cameraController?.dispose();
    _faceDetector.close();
    super.dispose();
  }

  /// Initialiser la caméra
  Future<void> _initializeCamera() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        setState(() {
          _errorMessage = 'Aucune caméra disponible sur cet appareil';
        });
        return;
      }

      // Trouver la caméra frontale
      final frontCamera = cameras.firstWhere(
        (camera) => camera.lensDirection == CameraLensDirection.front,
        orElse: () => cameras.first,
      );

      _cameraController = CameraController(
        frontCamera,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );

      await _cameraController!.initialize();

      if (mounted) {
        setState(() {
          _isInitialized = true;
        });

        // Démarrer la détection de visage en continu
        _startFaceDetection();
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Erreur d\'initialisation de la caméra: $e';
      });
    }
  }

  /// Démarrer la détection de visage en continu
  void _startFaceDetection() {
    if (_cameraController == null || !_cameraController!.value.isInitialized) {
      return;
    }

    // Détecter un visage toutes les 500ms
    Future.delayed(const Duration(milliseconds: 500), () async {
      if (!mounted || _isProcessing) return;

      try {
        setState(() => _isProcessing = true);

        final image = await _cameraController!.takePicture();
        final inputImage = InputImage.fromFilePath(image.path);
        final faces = await _faceDetector.processImage(inputImage);

        // Nettoyer le fichier temporaire
        await File(image.path).delete();

        if (mounted) {
          setState(() {
            _isFaceDetected = faces.isNotEmpty;
            _isProcessing = false;
          });

          // Continuer la détection
          _startFaceDetection();
        }
      } catch (e) {
        if (mounted) {
          setState(() => _isProcessing = false);
          _startFaceDetection();
        }
      }
    });
  }

  /// Capturer la photo
  Future<void> _capturePhoto() async {
    if (_cameraController == null || !_cameraController!.value.isInitialized) {
      return;
    }

    if (!_isFaceDetected) {
      _showError('Veuillez positionner votre visage dans le cadre');
      return;
    }

    try {
      setState(() => _isProcessing = true);

      // Prendre la photo
      final image = await _cameraController!.takePicture();

      // Vérifier une dernière fois qu'il y a un visage
      final inputImage = InputImage.fromFilePath(image.path);
      final faces = await _faceDetector.processImage(inputImage);

      if (faces.isEmpty) {
        await File(image.path).delete();
        _showError('Aucun visage détecté. Veuillez réessayer.');
        setState(() => _isProcessing = false);
        return;
      }

      // Copier dans un dossier permanent temporaire
      final Directory tempDir = await getTemporaryDirectory();
      final String fileName = 'profile_photo_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final String newPath = '${tempDir.path}/$fileName';
      final File newImage = await File(image.path).copy(newPath);

      // Retourner le fichier
      if (mounted) {
        Navigator.of(context).pop(newImage);
      }
    } catch (e) {
      _showError('Erreur lors de la capture: $e');
      setState(() => _isProcessing = false);
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.red,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          'Photo de profil',
          style: TextStyle(color: Colors.white),
        ),
      ),
      body: _errorMessage != null
          ? _buildErrorView()
          : !_isInitialized
              ? _buildLoadingView()
              : _buildCameraView(),
    );
  }

  Widget _buildErrorView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.error_outline,
              size: 64,
              color: Colors.red,
            ),
            const SizedBox(height: 16),
            Text(
              _errorMessage!,
              style: const TextStyle(color: Colors.white),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Retour'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLoadingView() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(color: Colors.white),
          SizedBox(height: 16),
          Text(
            'Initialisation de la caméra...',
            style: TextStyle(color: Colors.white),
          ),
        ],
      ),
    );
  }

  Widget _buildCameraView() {
    final size = MediaQuery.of(context).size;
    final cameraAspectRatio = _cameraController!.value.aspectRatio;

    return Stack(
      children: [
        // Aperçu caméra
        SizedBox(
          width: size.width,
          height: size.height,
          child: FittedBox(
            fit: BoxFit.cover,
            child: SizedBox(
              width: size.width,
              height: size.width * cameraAspectRatio,
              child: CameraPreview(_cameraController!),
            ),
          ),
        ),

        // Overlay avec cercle de guidage
        CustomPaint(
          size: size,
          painter: FaceOverlayPainter(
            isFaceDetected: _isFaceDetected,
          ),
        ),

        // Instructions en haut
        Positioned(
          top: 20,
          left: 0,
          right: 0,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            margin: const EdgeInsets.symmetric(horizontal: 24),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.7),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              children: [
                Icon(
                  _isFaceDetected ? Icons.check_circle : Icons.face,
                  color: _isFaceDetected ? Colors.green : Colors.white,
                  size: 32,
                ),
                const SizedBox(height: 8),
                Text(
                  _isFaceDetected
                      ? 'Visage détecté !'
                      : 'Positionnez votre visage dans le cercle',
                  style: TextStyle(
                    color: _isFaceDetected ? Colors.green : Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),

        // Bouton de capture en bas
        Positioned(
          bottom: 40,
          left: 0,
          right: 0,
          child: Center(
            child: GestureDetector(
              onTap: _isProcessing ? null : _capturePhoto,
              child: Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: _isFaceDetected && !_isProcessing
                      ? Colors.white
                      : Colors.grey,
                  border: Border.all(
                    color: Colors.white,
                    width: 4,
                  ),
                ),
                child: _isProcessing
                    ? const Padding(
                        padding: EdgeInsets.all(20.0),
                        child: CircularProgressIndicator(
                          strokeWidth: 3,
                        ),
                      )
                    : Icon(
                        Icons.camera_alt,
                        size: 40,
                        color: _isFaceDetected ? Colors.black : Colors.white,
                      ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Painter pour l'overlay de guidage du visage
class FaceOverlayPainter extends CustomPainter {
  final bool isFaceDetected;

  FaceOverlayPainter({required this.isFaceDetected});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..color = isFaceDetected ? Colors.green : Colors.white.withOpacity(0.8);

    // Dessiner un cercle au centre
    final center = Offset(size.width / 2, size.height / 2 - 50);
    final radius = size.width * 0.35;

    canvas.drawCircle(center, radius, paint);

    // Ajouter un overlay sombre autour du cercle
    final overlayPaint = Paint()
      ..color = Colors.black.withOpacity(0.5);

    final path = Path()
      ..addRect(Rect.fromLTWH(0, 0, size.width, size.height))
      ..addOval(Rect.fromCircle(center: center, radius: radius))
      ..fillType = PathFillType.evenOdd;

    canvas.drawPath(path, overlayPaint);
  }

  @override
  bool shouldRepaint(FaceOverlayPainter oldDelegate) {
    return oldDelegate.isFaceDetected != isFaceDetected;
  }
}

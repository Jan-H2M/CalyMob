import 'dart:io';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

/// Écran de capture photo avec vérification que le visage est bien positionné
class FaceCameraScreen extends StatefulWidget {
  const FaceCameraScreen({super.key});

  @override
  State<FaceCameraScreen> createState() => _FaceCameraScreenState();
}

class _FaceCameraScreenState extends State<FaceCameraScreen> {
  CameraController? _cameraController;
  bool _isInitialized = false;
  bool _isProcessing = false;
  String? _errorMessage;
  File? _capturedPhoto;
  bool _showConfirmation = false;

  @override
  void initState() {
    super.initState();
    _initializeCamera();
  }

  @override
  void dispose() {
    _cameraController?.dispose();
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
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Erreur d\'initialisation de la caméra: $e';
      });
    }
  }

  /// Capturer la photo
  Future<void> _capturePhoto() async {
    if (_cameraController == null || !_cameraController!.value.isInitialized) {
      return;
    }

    try {
      setState(() => _isProcessing = true);

      // Prendre la photo
      final image = await _cameraController!.takePicture();

      // Copier dans un dossier permanent temporaire
      final Directory tempDir = await getTemporaryDirectory();
      final String fileName = 'profile_photo_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final String newPath = '${tempDir.path}/$fileName';
      final File newImage = await File(image.path).copy(newPath);

      // Afficher l'écran de confirmation
      setState(() {
        _capturedPhoto = newImage;
        _showConfirmation = true;
        _isProcessing = false;
      });
    } catch (e) {
      _showError('Erreur lors de la capture: $e');
      setState(() => _isProcessing = false);
    }
  }

  /// Confirmer la photo et la retourner
  void _confirmPhoto() {
    if (_capturedPhoto != null && mounted) {
      Navigator.of(context).pop(_capturedPhoto);
    }
  }

  /// Reprendre une nouvelle photo
  void _retakePhoto() {
    setState(() {
      _capturedPhoto = null;
      _showConfirmation = false;
    });
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
        title: Text(
          _showConfirmation ? 'Vérifier la photo' : 'Photo de profil',
          style: const TextStyle(color: Colors.white),
        ),
      ),
      body: _errorMessage != null
          ? _buildErrorView()
          : !_isInitialized
              ? _buildLoadingView()
              : _showConfirmation
                  ? _buildConfirmationView()
                  : _buildCameraView(),
    );
  }

  Widget _buildConfirmationView() {
    return Column(
      children: [
        // Photo preview met cirkel overlay
        Expanded(
          child: Stack(
            children: [
              // Photo
              Center(
                child: Image.file(
                  _capturedPhoto!,
                  fit: BoxFit.cover,
                  width: double.infinity,
                  height: double.infinity,
                ),
              ),
              // Overlay met cirkel
              CustomPaint(
                size: MediaQuery.of(context).size,
                painter: FaceOverlayPainter(),
              ),
            ],
          ),
        ),

        // Vraag aan gebruiker
        Container(
          padding: const EdgeInsets.all(20),
          color: Colors.black,
          child: Column(
            children: [
              const Icon(
                Icons.help_outline,
                color: Colors.orange,
                size: 32,
              ),
              const SizedBox(height: 12),
              const Text(
                'Est-ce que votre visage est bien visible\ndans le cercle ?',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'Votre photo doit montrer clairement votre visage\npour être reconnu par les autres membres.',
                style: TextStyle(
                  color: Colors.grey[400],
                  fontSize: 14,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),

              // Boutons
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  // Reprendre
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _retakePhoto,
                      icon: const Icon(Icons.refresh, color: Colors.white),
                      label: const Text(
                        'Reprendre',
                        style: TextStyle(color: Colors.white),
                      ),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: Colors.white),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  // Confirmer
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _confirmPhoto,
                      icon: const Icon(Icons.check, color: Colors.white),
                      label: const Text(
                        'Oui, confirmer',
                        style: TextStyle(color: Colors.white),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
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
          painter: FaceOverlayPainter(),
        ),

        // Instructions en haut
        Positioned(
          top: 20,
          left: 0,
          right: 0,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            margin: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.75),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              children: [
                const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.diversity_3,
                      color: Colors.lightBlueAccent,
                      size: 28,
                    ),
                    SizedBox(width: 8),
                    Text(
                      'Who\'s Who Calypso',
                      style: TextStyle(
                        color: Colors.lightBlueAccent,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                const Text(
                  'Positionnez votre visage dans le cercle',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Votre photo permet aux nouveaux membres de vous reconnaître, '
                  'et à vous de les reconnaître aussi ! '
                  'C\'est l\'esprit Calypso : convivial et accueillant 🤿',
                  style: TextStyle(
                    color: Colors.grey[300],
                    fontSize: 13,
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
                  color: !_isProcessing ? Colors.white : Colors.grey,
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
                    : const Icon(
                        Icons.camera_alt,
                        size: 40,
                        color: Colors.black,
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
  FaceOverlayPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..color = Colors.white.withOpacity(0.8);

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
    return false;
  }
}

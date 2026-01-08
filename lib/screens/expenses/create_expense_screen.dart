import 'dart:io';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:cunning_document_scanner/cunning_document_scanner.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../config/firebase_config.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../../providers/expense_provider.dart';
import '../../providers/member_provider.dart';
import '../../utils/date_formatter.dart';

/// Écran de création d'une demande de remboursement
class CreateExpenseScreen extends StatefulWidget {
  const CreateExpenseScreen({Key? key}) : super(key: key);

  @override
  State<CreateExpenseScreen> createState() => _CreateExpenseScreenState();
}

class _CreateExpenseScreenState extends State<CreateExpenseScreen> {
  final _formKey = GlobalKey<FormState>();
  final _montantController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _imagePicker = ImagePicker();

  DateTime _selectedDate = DateTime.now();
  List<File> _selectedPhotos = [];
  bool _isSubmitting = false;

  @override
  void dispose() {
    _montantController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _pickImageFromCamera() async {
    try {
      final XFile? photo = await _imagePicker.pickImage(
        source: ImageSource.camera,
        maxWidth: 1920,
        maxHeight: 1080,
        imageQuality: 85,
      );

      if (photo != null) {
        setState(() {
          _selectedPhotos.add(File(photo.path));
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur lors de la prise de photo: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _pickImageFromGallery() async {
    try {
      final List<XFile> photos = await _imagePicker.pickMultiImage(
        maxWidth: 1920,
        maxHeight: 1080,
        imageQuality: 85,
      );

      if (photos.isNotEmpty) {
        setState(() {
          _selectedPhotos.addAll(photos.map((photo) => File(photo.path)));
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur lors de la sélection: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _removePhoto(int index) {
    setState(() {
      _selectedPhotos.removeAt(index);
    });
  }

  /// Compresse une image pour réduire sa taille
  Future<File?> _compressImage(File file) async {
    try {
      final dir = await getTemporaryDirectory();
      final targetPath = '${dir.path}/compressed_${DateTime.now().millisecondsSinceEpoch}.jpg';

      final result = await FlutterImageCompress.compressAndGetFile(
        file.absolute.path,
        targetPath,
        quality: 70,
        minWidth: 1200,
        minHeight: 1600,
      );

      if (result != null) {
        return File(result.path);
      }
      return file; // Retourne l'original si la compression échoue
    } catch (e) {
      debugPrint('Erreur compression: $e');
      return file; // Retourne l'original en cas d'erreur
    }
  }

  Future<void> _scanDocument() async {
    try {
      // cunning_document_scanner uses native iOS VisionKit / Android ML Kit
      // Returns List<String> with file paths on both platforms
      debugPrint('🔍 Scanner: Starting document scan...');

      final List<String>? scannedPaths = await CunningDocumentScanner.getPictures(
        isGalleryImportAllowed: true,
      );

      debugPrint('🔍 Scanner: Result: $scannedPaths');

      if (scannedPaths != null && scannedPaths.isNotEmpty) {
        debugPrint('🔍 Scanner: Found ${scannedPaths.length} scanned pages');

        // Compress each scanned image
        final List<File> compressedFiles = [];
        for (final path in scannedPaths) {
          debugPrint('🔍 Scanner: Processing path: $path');
          final originalFile = File(path);

          if (await originalFile.exists()) {
            final compressedFile = await _compressImage(originalFile);
            if (compressedFile != null) {
              compressedFiles.add(compressedFile);
              debugPrint('🔍 Scanner: Added compressed file: ${compressedFile.path}');
            }
          } else {
            debugPrint('🔍 Scanner: File does not exist at path: $path');
          }
        }

        debugPrint('🔍 Scanner: Total files to add: ${compressedFiles.length}');
        setState(() {
          _selectedPhotos.addAll(compressedFiles);
        });
        debugPrint('🔍 Scanner: Total photos now: ${_selectedPhotos.length}');
      } else {
        debugPrint('🔍 Scanner: No documents scanned (user cancelled or empty result)');
      }
    } catch (e, stackTrace) {
      debugPrint('🔍 Scanner: Error: $e');
      debugPrint('🔍 Scanner: Stack trace: $stackTrace');
      if (mounted) {
        // Check if user cancelled
        final errorMsg = e.toString().toLowerCase();
        if (errorMsg.contains('cancel') || errorMsg.contains('user')) {
          // User cancelled - no error message needed
          return;
        }

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur lors du scan: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _selectDate() async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: ColorScheme.light(
              primary: AppColors.middenblauw,
              onPrimary: Colors.white,
              surface: Colors.white,
              onSurface: Colors.black,
            ),
          ),
          child: child!,
        );
      },
    );

    if (picked != null && picked != _selectedDate) {
      setState(() {
        _selectedDate = picked;
      });
    }
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    // Note: Photos sont optionnelles (web browser ne supporte pas toujours la caméra)
    // if (_selectedPhotos.isEmpty) {
    //   ScaffoldMessenger.of(context).showSnackBar(
    //     const SnackBar(
    //       content: Text('⚠️ Veuillez ajouter au moins un justificatif'),
    //       backgroundColor: Colors.orange,
    //     ),
    //   );
    //   return;
    // }

    setState(() {
      _isSubmitting = true;
    });

    try {
      final authProvider = context.read<AuthProvider>();
      final expenseProvider = context.read<ExpenseProvider>();
      final memberProvider = context.read<MemberProvider>();
      final clubId = FirebaseConfig.defaultClubId;
      final userId = authProvider.currentUser?.uid ?? '';
      // Haal naam uit MemberProvider (displayName), fallback naar auth displayName of email
      final userName = memberProvider.displayName.isNotEmpty
          ? memberProvider.displayName
          : (authProvider.displayName ?? authProvider.currentUser?.email ?? 'Utilisateur');

      final montant = double.parse(_montantController.text.trim());
      final description = _descriptionController.text.trim();

      await expenseProvider.createExpense(
        clubId: clubId,
        userId: userId,
        userName: userName,
        montant: montant,
        description: description,
        dateDepense: _selectedDate,
        photoFiles: _selectedPhotos,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Demande créée avec succès'),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  Widget _buildRoundButton({
    required IconData icon,
    required String label,
    required VoidCallback? onPressed,
  }) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        FloatingActionButton(
          heroTag: label,
          onPressed: onPressed,
          backgroundColor: AppColors.middenblauw,
          child: Icon(icon, color: Colors.white),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: const TextStyle(
            fontSize: 12,
            color: Colors.white,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        image: DecorationImage(
          image: AssetImage(AppAssets.backgroundFull),
          fit: BoxFit.cover,
        ),
      ),
      child: Scaffold(
        backgroundColor: Colors.transparent,
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          title: const Text('Nouvelle demande', style: TextStyle(color: Colors.white)),
          backgroundColor: Colors.transparent,
          elevation: 0,
          iconTheme: const IconThemeData(color: Colors.white),
        ),
        body: SafeArea(
          child: GestureDetector(
            onTap: () => FocusScope.of(context).unfocus(),
            child: LayoutBuilder(
              builder: (context, constraints) {
                return SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      minHeight: constraints.maxHeight - 32, // Account for padding
                    ),
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.lichtblauw.withOpacity(0.3),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppColors.lichtblauw.withOpacity(0.5)),
                      ),
                      child: Form(
                        key: _formKey,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Montant
                            TextFormField(
                              controller: _montantController,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              decoration: InputDecoration(
                                hintText: 'Montant (€)',
                                prefixIcon: Icon(Icons.euro, color: AppColors.middenblauw),
                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                                filled: true,
                                fillColor: Colors.white,
                              ),
                              validator: (value) {
                                if (value == null || value.isEmpty) {
                                  return 'Le montant est requis';
                                }
                                final montant = double.tryParse(value.trim());
                                if (montant == null || montant <= 0) {
                                  return 'Montant invalide';
                                }
                                return null;
                              },
                            ),

                            const SizedBox(height: 12),

                            // Description
                            TextFormField(
                              controller: _descriptionController,
                              maxLines: 2,
                              textInputAction: TextInputAction.done,
                              onFieldSubmitted: (_) => FocusScope.of(context).unfocus(),
                              decoration: InputDecoration(
                                hintText: 'Description de la dépense',
                                prefixIcon: Icon(Icons.description, color: AppColors.middenblauw),
                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                                filled: true,
                                fillColor: Colors.white,
                              ),
                              validator: (value) {
                                if (value == null || value.trim().isEmpty) {
                                  return 'La description est requise';
                                }
                                if (value.trim().length < 5) {
                                  return 'Description trop courte (min 5 caractères)';
                                }
                                return null;
                              },
                            ),

                            const SizedBox(height: 12),

                            // Date de la dépense
                            InkWell(
                              onTap: _selectDate,
                              borderRadius: BorderRadius.circular(12),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: Colors.grey.shade400),
                                ),
                                child: Row(
                                  children: [
                                    Icon(Icons.calendar_today, color: AppColors.middenblauw),
                                    const SizedBox(width: 12),
                                    Text(
                                      DateFormatter.formatMedium(_selectedDate),
                                      style: const TextStyle(fontSize: 16),
                                    ),
                                  ],
                                ),
                              ),
                            ),

                            const SizedBox(height: 24),

                            // Section Justificatifs - 3 round buttons
                            const Text(
                              'Justificatifs',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 16),

                            // Three round buttons: Scan, Photo, Gallery
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                              children: [
                                // Scan button (not available on web)
                                if (!kIsWeb)
                                  _buildRoundButton(
                                    icon: Icons.document_scanner,
                                    label: 'Scanner',
                                    onPressed: _isSubmitting ? null : _scanDocument,
                                  ),
                                // Photo button
                                _buildRoundButton(
                                  icon: Icons.camera_alt,
                                  label: 'Photo',
                                  onPressed: _isSubmitting ? null : _pickImageFromCamera,
                                ),
                                // Gallery button
                                _buildRoundButton(
                                  icon: Icons.photo_library,
                                  label: 'Galerie',
                                  onPressed: _isSubmitting ? null : _pickImageFromGallery,
                                ),
                              ],
                            ),

                            const SizedBox(height: 16),

                            // Photos preview (disabled on web - Image.file not supported)
                            if (_selectedPhotos.isNotEmpty && !kIsWeb) ...[
                              Text(
                                '${_selectedPhotos.length} photo(s) sélectionnée(s)',
                                style: const TextStyle(
                                  fontSize: 14,
                                  color: Colors.white70,
                                ),
                              ),
                              const SizedBox(height: 8),
                              GridView.builder(
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: 3,
                                  crossAxisSpacing: 8,
                                  mainAxisSpacing: 8,
                                ),
                                itemCount: _selectedPhotos.length,
                                itemBuilder: (context, index) {
                                  return Stack(
                                    children: [
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(8),
                                        child: Image.file(
                                          _selectedPhotos[index],
                                          width: double.infinity,
                                          height: double.infinity,
                                          fit: BoxFit.cover,
                                        ),
                                      ),
                                      Positioned(
                                        top: 4,
                                        right: 4,
                                        child: InkWell(
                                          onTap: () => _removePhoto(index),
                                          child: Container(
                                            padding: const EdgeInsets.all(4),
                                            decoration: const BoxDecoration(
                                              color: Colors.red,
                                              shape: BoxShape.circle,
                                            ),
                                            child: const Icon(
                                              Icons.close,
                                              color: Colors.white,
                                              size: 16,
                                            ),
                                          ),
                                        ),
                                      ),
                                    ],
                                  );
                                },
                              ),
                              const SizedBox(height: 24),
                            ] else if (_selectedPhotos.isNotEmpty && kIsWeb) ...[
                              // Web: show text only (no image preview)
                              Text(
                                '${_selectedPhotos.length} photo(s) sélectionnée(s)',
                                style: const TextStyle(
                                  fontSize: 14,
                                  color: Colors.white70,
                                ),
                              ),
                              const SizedBox(height: 24),
                            ],

                            // Submit button - round blue
                            Center(
                              child: FloatingActionButton.extended(
                                onPressed: _isSubmitting ? null : _handleSubmit,
                                backgroundColor: AppColors.middenblauw,
                                icon: _isSubmitting
                                    ? const SizedBox(
                                        width: 20,
                                        height: 20,
                                        child: CircularProgressIndicator(
                                          color: Colors.white,
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : const Icon(Icons.send, color: Colors.white),
                                label: Text(
                                  _isSubmitting ? 'Envoi...' : 'Soumettre',
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';

/// Widget pour sélectionner des pièces jointes (images et PDFs)
class AttachmentPicker extends StatelessWidget {
  final Function(File file, String type) onAttachmentSelected;

  const AttachmentPicker({
    super.key,
    required this.onAttachmentSelected,
  });

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.attach_file),
      onPressed: () => _showPickerOptions(context),
      tooltip: 'Ajouter une pièce jointe',
    );
  }

  void _showPickerOptions(BuildContext context) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Padding(
                padding: EdgeInsets.only(bottom: 16),
                child: Text(
                  'Ajouter une pièce jointe',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.blue.shade100,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(Icons.camera_alt, color: Colors.blue.shade700),
                ),
                title: const Text('Prendre une photo'),
                subtitle: const Text('Utiliser la camera'),
                onTap: () {
                  Navigator.pop(context);
                  _pickFromCamera(context);
                },
              ),
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.green.shade100,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(Icons.photo_library, color: Colors.green.shade700),
                ),
                title: const Text('Choisir une image'),
                subtitle: const Text('Depuis la galerie'),
                onTap: () {
                  Navigator.pop(context);
                  _pickFromGallery(context);
                },
              ),
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.red.shade100,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(Icons.picture_as_pdf, color: Colors.red.shade700),
                ),
                title: const Text('Choisir un PDF'),
                subtitle: const Text('Document PDF'),
                onTap: () {
                  Navigator.pop(context);
                  _pickPdf(context);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pickFromCamera(BuildContext context) async {
    try {
      final ImagePicker picker = ImagePicker();
      final XFile? image = await picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 80,
        maxWidth: 1920,
        maxHeight: 1920,
      );

      if (image != null) {
        onAttachmentSelected(File(image.path), 'image');
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur camera: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _pickFromGallery(BuildContext context) async {
    try {
      final ImagePicker picker = ImagePicker();
      final XFile? image = await picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 80,
        maxWidth: 1920,
        maxHeight: 1920,
      );

      if (image != null) {
        onAttachmentSelected(File(image.path), 'image');
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur galerie: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _pickPdf(BuildContext context) async {
    try {
      FilePickerResult? result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf'],
      );

      if (result != null && result.files.single.path != null) {
        onAttachmentSelected(File(result.files.single.path!), 'pdf');
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur sélection PDF: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}

/// Widget pour afficher les pièces jointes en attente d'envoi
class PendingAttachmentPreview extends StatelessWidget {
  final File file;
  final String type;
  final VoidCallback onRemove;

  const PendingAttachmentPreview({
    super.key,
    required this.file,
    required this.type,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(right: 8),
      child: Stack(
        children: [
          if (type == 'image')
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.file(
                file,
                width: 60,
                height: 60,
                fit: BoxFit.cover,
              ),
            )
          else
            Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                color: Colors.red.shade100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                Icons.picture_as_pdf,
                color: Colors.red.shade700,
                size: 30,
              ),
            ),
          Positioned(
            top: -4,
            right: -4,
            child: GestureDetector(
              onTap: onRemove,
              child: Container(
                padding: const EdgeInsets.all(2),
                decoration: const BoxDecoration(
                  color: Colors.red,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.close,
                  size: 14,
                  color: Colors.white,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

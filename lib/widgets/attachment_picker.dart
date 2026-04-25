import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import '../services/camera_permission_service.dart';

/// Widget pour sélectionner des pièces jointes (images, vidéos et PDFs)
class AttachmentPicker extends StatelessWidget {
  final Function(File file, String type) onAttachmentSelected;
  final VoidCallback? onCreatePoll;
  static const int _maxFileSizeBytes = 50 * 1024 * 1024;
  static const double _menuWidth = 220;
  static const List<String> _videoExtensions = [
    'mp4',
    'mov',
    'm4v',
    'avi',
    'mkv',
    'webm',
  ];

  const AttachmentPicker({
    super.key,
    required this.onAttachmentSelected,
    this.onCreatePoll,
  });

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.add_circle_outline_rounded),
      onPressed: () => _showPickerOptions(context),
      tooltip: onCreatePoll != null
          ? 'Ajouter un média, un document ou un sondage'
          : 'Ajouter une pièce jointe',
    );
  }

  void _showPickerOptions(BuildContext context) {
    final buttonBox = context.findRenderObject() as RenderBox?;
    final overlay =
        Overlay.of(context).context.findRenderObject() as RenderBox?;
    if (buttonBox == null || overlay == null) return;

    final buttonTopLeft =
        buttonBox.localToGlobal(Offset.zero, ancestor: overlay);
    final buttonRect = buttonTopLeft & buttonBox.size;
    final maxLeft = overlay.size.width - _menuWidth - 12;
    final left = (buttonRect.left - 4)
        .clamp(12.0, maxLeft > 12 ? maxLeft : 12)
        .toDouble();
    final bottom = overlay.size.height - buttonRect.top + 6;

    showGeneralDialog(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Fermer',
      barrierColor: Colors.black.withValues(alpha: 0.025),
      transitionDuration: const Duration(milliseconds: 140),
      pageBuilder: (dialogContext, _, __) {
        final actions = [
          _PickerActionData(
            label: 'Photos & vidéos',
            icon: Icons.photo_library_outlined,
            accent: Colors.blue,
            onTap: () => _pickMediaFromLibrary(context),
          ),
          _PickerActionData(
            label: 'Document',
            icon: Icons.insert_drive_file_outlined,
            accent: Colors.indigo,
            onTap: () => _pickPdf(context),
          ),
          _PickerActionData(
            label: 'Appareil photo',
            icon: Icons.photo_camera_outlined,
            accent: Colors.green,
            onTap: () => _pickFromCamera(context),
          ),
          _PickerActionData(
            label: 'Vidéo',
            icon: Icons.videocam_outlined,
            accent: Colors.deepOrange,
            onTap: () => _pickVideoFromCamera(context),
          ),
          if (onCreatePoll != null)
            _PickerActionData(
              label: 'Sondage',
              icon: Icons.poll_outlined,
              accent: Colors.amber.shade800,
              onTap: onCreatePoll!,
            ),
        ];

        return Stack(
          children: [
            Positioned(
              left: left,
              bottom: bottom,
              width: _menuWidth,
              child: SafeArea(
                minimum: const EdgeInsets.only(bottom: 8),
                child: _AttachmentActionCard(
                  actions: actions,
                  onSelect: (action) {
                    Navigator.of(dialogContext).pop();
                    Future<void>.microtask(action.onTap);
                  },
                ),
              ),
            ),
          ],
        );
      },
      transitionBuilder: (dialogContext, animation, secondaryAnimation, child) {
        final curved = CurvedAnimation(
          parent: animation,
          curve: Curves.easeOutCubic,
          reverseCurve: Curves.easeInCubic,
        );

        return FadeTransition(
          opacity: curved,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0, 0.11),
              end: Offset.zero,
            ).animate(curved),
            child: child,
          ),
        );
      },
    );
  }

  Future<void> _pickMediaFromLibrary(BuildContext context) async {
    try {
      // Utilise image_picker pour ouvrir la vraie galerie Photos (iOS)
      // au lieu de l'app Files. Permet la sélection multiple de photos
      // et vidéos en une seule fois.
      final ImagePicker picker = ImagePicker();
      final List<XFile> mediaFiles = await picker.pickMultipleMedia(
        imageQuality: 85,
      );

      if (mediaFiles.isEmpty) return;

      for (final media in mediaFiles) {
        if (!context.mounted) return;
        final extension = media.path.split('.').last.toLowerCase();
        final type =
            _videoExtensions.contains(extension) ? 'video' : 'image';
        await _handlePickedFile(context, File(media.path), type);
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur sélection média: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _pickFromCamera(BuildContext context) async {
    try {
      // Vérifier/demander la permission caméra avant d'ouvrir le picker
      final hasPermission =
          await CameraPermissionService.handlePermissionWithDialog(context);
      if (!hasPermission || !context.mounted) return;

      final ImagePicker picker = ImagePicker();
      final XFile? image = await picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 80,
        maxWidth: 1920,
        maxHeight: 1920,
      );

      if (image != null) {
        if (!context.mounted) return;
        await _handlePickedFile(context, File(image.path), 'image');
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

  Future<void> _pickPdf(BuildContext context) async {
    try {
      FilePickerResult? result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf'],
      );

      if (result != null && result.files.single.path != null) {
        if (!context.mounted) return;
        await _handlePickedFile(
          context,
          File(result.files.single.path!),
          'pdf',
        );
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

  Future<void> _pickVideoFromCamera(BuildContext context) async {
    try {
      // Vérifier/demander la permission caméra avant d'ouvrir le picker
      final hasPermission =
          await CameraPermissionService.handlePermissionWithDialog(context);
      if (!hasPermission || !context.mounted) return;

      final ImagePicker picker = ImagePicker();
      final XFile? video = await picker.pickVideo(
        source: ImageSource.camera,
        maxDuration: const Duration(minutes: 5),
      );

      if (video != null) {
        if (!context.mounted) return;
        await _handlePickedFile(context, File(video.path), 'video');
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur vidéo: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _handlePickedFile(
    BuildContext context,
    File file,
    String type,
  ) async {
    final fileSize = await file.length();
    if (fileSize > _maxFileSizeBytes) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Le fichier dépasse 50 MB.'),
            backgroundColor: Colors.red,
          ),
        );
      }
      return;
    }

    onAttachmentSelected(file, type);
  }
}

class _AttachmentActionCard extends StatelessWidget {
  final List<_PickerActionData> actions;
  final ValueChanged<_PickerActionData> onSelect;

  const _AttachmentActionCard({
    required this.actions,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFFDFDFE),
      elevation: 10,
      borderRadius: BorderRadius.circular(26),
      clipBehavior: Clip.antiAlias,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(26),
          border: Border.all(color: Colors.black.withValues(alpha: 0.045)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.14),
              blurRadius: 22,
              offset: const Offset(0, 12),
              spreadRadius: -4,
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var index = 0; index < actions.length; index++)
                _AttachmentActionRow(
                  action: actions[index],
                  showDivider: index < actions.length - 1,
                  onTap: () => onSelect(actions[index]),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AttachmentActionRow extends StatelessWidget {
  final _PickerActionData action;
  final bool showDivider;
  final VoidCallback onTap;

  const _AttachmentActionRow({
    required this.action,
    required this.showDivider,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          border: showDivider
              ? Border(
                  bottom: BorderSide(
                    color: Colors.black.withValues(alpha: 0.045),
                  ),
                )
              : null,
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          child: Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: action.accent.withValues(alpha: 0.13),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: Icon(action.icon, color: action.accent, size: 18),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  action.label,
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w500,
                    letterSpacing: -0.1,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PickerActionData {
  final String label;
  final IconData icon;
  final Color accent;
  final VoidCallback onTap;

  const _PickerActionData({
    required this.label,
    required this.icon,
    required this.accent,
    required this.onTap,
  });
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
          else if (type == 'video')
            Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                color: Colors.purple.shade100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                Icons.play_circle_fill,
                color: Colors.purple.shade700,
                size: 32,
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

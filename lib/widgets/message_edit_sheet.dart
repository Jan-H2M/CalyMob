import 'dart:io';
import 'package:flutter/material.dart';
import '../models/session_message.dart' show MessageAttachment;
import 'attachment_picker.dart';

/// Een lokaal toegevoegde file die nog naar Firebase Storage moet geüpload worden.
class MessageEditNewFile {
  final File file;
  final String type; // 'image' | 'video' | 'pdf'

  const MessageEditNewFile({required this.file, required this.type});
}

/// Resultaat van het editen van een bericht.
///
/// - [text]: De nieuwe tekst.
/// - [keptAttachments]: De bestaande attachments die de gebruiker heeft bewaard.
///   Attachments die hier niet meer in staan moeten door de caller worden
///   verwijderd uit Firebase Storage.
/// - [newFiles]: Lokale files die nieuw toegevoegd zijn — nog te uploaden door
///   de caller.
class MessageEditResult {
  final String text;
  final List<MessageAttachment> keptAttachments;
  final List<MessageEditNewFile> newFiles;

  const MessageEditResult({
    required this.text,
    required this.keptAttachments,
    required this.newFiles,
  });

  /// Handige record-representatie voor iteratie in callers.
  List<({File file, String type})> get newFileTuples =>
      newFiles.map((n) => (file: n.file, type: n.type)).toList();
}

/// Toont een bottom sheet waarmee een gebruiker zijn eigen bericht kan bewerken.
///
/// Returnt een [MessageEditResult] of `null` als de gebruiker annuleert.
Future<MessageEditResult?> showMessageEditSheet(
  BuildContext context, {
  required String initialText,
  List<MessageAttachment> initialAttachments = const [],
  bool allowAttachmentEdit = true,
}) {
  return showModalBottomSheet<MessageEditResult>(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (sheetContext) => _MessageEditSheet(
      initialText: initialText,
      initialAttachments: initialAttachments,
      allowAttachmentEdit: allowAttachmentEdit,
    ),
  );
}

class _MessageEditSheet extends StatefulWidget {
  final String initialText;
  final List<MessageAttachment> initialAttachments;
  final bool allowAttachmentEdit;

  const _MessageEditSheet({
    required this.initialText,
    required this.initialAttachments,
    required this.allowAttachmentEdit,
  });

  @override
  State<_MessageEditSheet> createState() => _MessageEditSheetState();
}

class _MessageEditSheetState extends State<_MessageEditSheet> {
  late final TextEditingController _controller;
  late List<MessageAttachment> _keptAttachments;
  final List<MessageEditNewFile> _newFiles = [];

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialText);
    _keptAttachments = List.of(widget.initialAttachments);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _removeExistingAttachment(int index) {
    setState(() => _keptAttachments.removeAt(index));
  }

  void _removeNewFile(int index) {
    setState(() => _newFiles.removeAt(index));
  }

  void _addNewFile(File file, String type) {
    setState(() => _newFiles.add(MessageEditNewFile(file: file, type: type)));
  }

  bool get _hasContent =>
      _controller.text.trim().isNotEmpty ||
      _keptAttachments.isNotEmpty ||
      _newFiles.isNotEmpty;

  void _submit() {
    final text = _controller.text.trim();
    Navigator.of(context).pop(
      MessageEditResult(
        text: text,
        keptAttachments: _keptAttachments,
        newFiles: List.of(_newFiles),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    final hasAttachmentSection = widget.allowAttachmentEdit ||
        _keptAttachments.isNotEmpty ||
        _newFiles.isNotEmpty;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Grip
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const Text(
                'Modifier le message',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 12),

              // Text field
              TextField(
                controller: _controller,
                autofocus: true,
                textCapitalization: TextCapitalization.sentences,
                maxLines: null,
                minLines: 3,
                decoration: InputDecoration(
                  hintText: 'Votre message...',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 12,
                  ),
                ),
                onChanged: (_) => setState(() {}),
              ),

              if (hasAttachmentSection) ...[
                const SizedBox(height: 16),
                Row(
                  children: [
                    const Text(
                      'Pièces jointes',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Colors.black87,
                      ),
                    ),
                    const Spacer(),
                    if (widget.allowAttachmentEdit)
                      AttachmentPicker(onAttachmentSelected: _addNewFile),
                  ],
                ),
                const SizedBox(height: 8),
                if (_keptAttachments.isEmpty && _newFiles.isEmpty)
                  Text(
                    'Aucune pièce jointe',
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.grey.shade600,
                    ),
                  )
                else
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (int i = 0; i < _keptAttachments.length; i++)
                        _ExistingAttachmentChip(
                          attachment: _keptAttachments[i],
                          onRemove: widget.allowAttachmentEdit
                              ? () => _removeExistingAttachment(i)
                              : null,
                        ),
                      for (int i = 0; i < _newFiles.length; i++)
                        _NewFileChip(
                          file: _newFiles[i].file,
                          type: _newFiles[i].type,
                          onRemove: () => _removeNewFile(i),
                        ),
                    ],
                  ),
              ],

              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Annuler'),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: _hasContent ? _submit : null,
                    child: const Text('Enregistrer'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ExistingAttachmentChip extends StatelessWidget {
  final MessageAttachment attachment;
  final VoidCallback? onRemove;

  const _ExistingAttachmentChip({
    required this.attachment,
    required this.onRemove,
  });

  IconData get _icon {
    if (attachment.isImage) return Icons.image_outlined;
    if (attachment.isVideo) return Icons.videocam_outlined;
    if (attachment.isPdf) return Icons.picture_as_pdf_outlined;
    return Icons.insert_drive_file_outlined;
  }

  @override
  Widget build(BuildContext context) {
    return Chip(
      avatar: Icon(_icon, size: 18, color: Colors.blue.shade700),
      label: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 160),
        child: Text(
          attachment.filename,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 12),
        ),
      ),
      onDeleted: onRemove,
      deleteIcon: onRemove == null ? null : const Icon(Icons.close, size: 16),
      backgroundColor: Colors.blue.shade50,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: Colors.blue.shade100),
      ),
    );
  }
}

class _NewFileChip extends StatelessWidget {
  final File file;
  final String type;
  final VoidCallback onRemove;

  const _NewFileChip({
    required this.file,
    required this.type,
    required this.onRemove,
  });

  IconData get _icon {
    switch (type) {
      case 'image':
        return Icons.image_outlined;
      case 'video':
        return Icons.videocam_outlined;
      case 'pdf':
        return Icons.picture_as_pdf_outlined;
      default:
        return Icons.insert_drive_file_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = file.path.split(Platform.pathSeparator).last;
    return Chip(
      avatar: Icon(_icon, size: 18, color: Colors.green.shade700),
      label: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 160),
        child: Text(
          name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 12),
        ),
      ),
      onDeleted: onRemove,
      deleteIcon: const Icon(Icons.close, size: 16),
      backgroundColor: Colors.green.shade50,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: Colors.green.shade100),
      ),
    );
  }
}

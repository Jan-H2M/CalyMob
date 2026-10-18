import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../config/app_colors.dart';
import '../../models/bug_report_screenshot.dart';
import '../../services/bug_resolution_feedback_service.dart';

class BugResolutionFeedbackScreen extends StatefulWidget {
  const BugResolutionFeedbackScreen({
    super.key,
    required this.clubId,
    required this.reportId,
    required this.feedbackId,
  });

  final String clubId;
  final String reportId;
  final String feedbackId;

  @override
  State<BugResolutionFeedbackScreen> createState() =>
      _BugResolutionFeedbackScreenState();
}

class _BugResolutionFeedbackScreenState
    extends State<BugResolutionFeedbackScreen> {
  final _text = TextEditingController();
  final _picker = ImagePicker();
  final List<BugReportScreenshot> _screenshots = [];
  bool _sending = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _pickScreenshot() async {
    if (_screenshots.length >= maxBugReportScreenshots) return;
    final picked = await _picker.pickImage(source: ImageSource.gallery);
    if (picked == null) return;
    final bytes = await picked.readAsBytes();
    if (!mounted) return;
    setState(() => _screenshots.add(BugReportScreenshot(
          bytes: Uint8List.fromList(bytes),
          page: 'resolution_feedback',
          capturedAt: DateTime.now(),
        )));
  }

  Future<void> _respond(bool works) async {
    if (!works && _text.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Décrivez ce qui ne fonctionne toujours pas.'),
      ));
      return;
    }
    setState(() => _sending = true);
    try {
      await BugResolutionFeedbackService().respond(
        clubId: widget.clubId,
        reportId: widget.reportId,
        feedbackId: widget.feedbackId,
        works: works,
        text: _text.text,
        screenshots: _screenshots,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(works
            ? 'Merci pour votre confirmation !'
            : 'Merci, le signalement est repassé en cours.'),
      ));
      Navigator.of(context).pop();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Impossible d’envoyer votre réponse pour le moment.'),
      ));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Votre signalement est résolu')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text(
              'La correction est disponible dans la dernière version de CalyMob. Pouvez-vous tester et nous dire si tout fonctionne ?',
              style: TextStyle(fontSize: 16),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _sending ? null : () => _respond(true),
              icon: const Icon(Icons.check_circle_outline),
              label: const Text('Ça fonctionne'),
            ),
            const SizedBox(height: 24),
            const Text('Toujours un problème ?',
                style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            TextField(
              controller: _text,
              minLines: 4,
              maxLines: 8,
              decoration: const InputDecoration(
                labelText: 'Expliquez ce qui ne fonctionne pas',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed:
                  _sending || _screenshots.length >= maxBugReportScreenshots
                      ? null
                      : _pickScreenshot,
              icon: const Icon(Icons.add_photo_alternate_outlined),
              label: Text('Ajouter une capture (${_screenshots.length}/5)'),
            ),
            if (_screenshots.isNotEmpty)
              Wrap(
                spacing: 8,
                children: List.generate(
                    _screenshots.length,
                    (index) => Chip(
                          label: Text('Capture ${index + 1}'),
                          onDeleted: _sending
                              ? null
                              : () =>
                                  setState(() => _screenshots.removeAt(index)),
                        )),
              ),
            const SizedBox(height: 8),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.error),
              onPressed: _sending ? null : () => _respond(false),
              child: const Text('Toujours un problème'),
            ),
          ],
        ),
      );
}

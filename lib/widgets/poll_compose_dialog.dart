import 'package:flutter/material.dart';
import '../models/poll.dart';

Future<Poll?> showPollComposerDialog(BuildContext context) {
  return showDialog<Poll>(
    context: context,
    builder: (_) => const _PollComposeDialog(),
  );
}

class _PollComposeDialog extends StatefulWidget {
  const _PollComposeDialog();

  @override
  State<_PollComposeDialog> createState() => _PollComposeDialogState();
}

class _PollComposeDialogState extends State<_PollComposeDialog> {
  final TextEditingController _questionController = TextEditingController();
  final List<TextEditingController> _optionControllers = [
    TextEditingController(),
    TextEditingController(),
  ];
  bool _allowMultiple = false;

  @override
  void dispose() {
    _questionController.dispose();
    for (final controller in _optionControllers) {
      controller.dispose();
    }
    super.dispose();
  }

  void _submit() {
    final question = _questionController.text.trim();
    final options = _optionControllers
        .map((controller) => controller.text.trim())
        .where((text) => text.isNotEmpty)
        .toList();

    if (question.isEmpty || options.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Ajoutez une question et au moins deux options.'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    final now = DateTime.now().millisecondsSinceEpoch;
    Navigator.of(context).pop(
      Poll(
        question: question,
        allowMultiple: _allowMultiple,
        options: [
          for (var i = 0; i < options.length; i++)
            PollOption(
              id: 'option_${now}_$i',
              text: options[i],
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Créer un sondage'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _questionController,
              decoration: const InputDecoration(
                labelText: 'Question',
                border: OutlineInputBorder(),
              ),
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: 12),
            for (var i = 0; i < _optionControllers.length; i++) ...[
              TextField(
                controller: _optionControllers[i],
                decoration: InputDecoration(
                  labelText: 'Option ${i + 1}',
                  border: const OutlineInputBorder(),
                ),
                textCapitalization: TextCapitalization.sentences,
              ),
              const SizedBox(height: 10),
            ],
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () {
                  setState(() {
                    _optionControllers.add(TextEditingController());
                  });
                },
                icon: const Icon(Icons.add),
                label: const Text('Ajouter une option'),
              ),
            ),
            SwitchListTile(
              value: _allowMultiple,
              onChanged: (value) => setState(() => _allowMultiple = value),
              contentPadding: EdgeInsets.zero,
              title: const Text('Autoriser plusieurs réponses'),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Annuler'),
        ),
        ElevatedButton(
          onPressed: _submit,
          child: const Text('Créer'),
        ),
      ],
    );
  }
}

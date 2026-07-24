import 'package:flutter/material.dart';

/// Canonical composition of the historical manual dive form.
///
/// The owning flow supplies the existing field widgets, controllers and
/// callbacks. The children come from the single historical-form builder.
class LogbookDiveForm extends StatelessWidget {
  final List<Widget> children;

  const LogbookDiveForm({
    super.key,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: children,
    );
  }
}

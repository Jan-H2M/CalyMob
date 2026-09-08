import 'dart:ui' show SemanticsRole;

import 'package:flutter/material.dart';

class CommunicationFilterSemantics extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Widget child;

  const CommunicationFilterSemantics({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      role: SemanticsRole.tab,
      selected: selected,
      label: 'Filtre $label',
      excludeSemantics: true,
      onTap: onTap,
      child: child,
    );
  }
}

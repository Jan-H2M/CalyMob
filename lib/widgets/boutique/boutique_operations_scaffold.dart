import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../config/app_colors.dart';

/// Operations pages have a light body, unlike the ocean-backed shop pages.
/// Keep navigation visible even when the app-wide AppBar is transparent/white.
/// The normal Navigator still owns back navigation, including loading/errors.
class BoutiqueOperationsScaffold extends StatelessWidget {
  final String title;
  final Widget body;
  final List<Widget>? actions;

  const BoutiqueOperationsScaffold({
    super.key,
    required this.title,
    required this.body,
    this.actions,
  });

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: Text(title),
          centerTitle: false,
          backgroundColor: AppColors.donkerblauw,
          foregroundColor: Colors.white,
          iconTheme: const IconThemeData(color: Colors.white),
          actionsIconTheme: const IconThemeData(color: Colors.white),
          surfaceTintColor: Colors.transparent,
          systemOverlayStyle: SystemUiOverlayStyle.light,
          actions: actions,
        ),
        body: body,
      );
}

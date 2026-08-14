import 'package:flutter/material.dart';

import 'config/app_colors.dart';
import 'screens/stock/material_finance_mockup_screen.dart';

void main() {
  runApp(const _Com059MockupApp());
}

class _Com059MockupApp extends StatelessWidget {
  const _Com059MockupApp();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'COM-059 Flutter mock-up',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.middenblauw,
          brightness: Brightness.light,
        ),
        useMaterial3: true,
      ),
      home: MaterialFinanceMockupScreen(
        studentPreview: Uri.base.queryParameters['view'] == 'student',
      ),
    );
  }
}

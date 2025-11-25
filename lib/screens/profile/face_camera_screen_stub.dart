import 'dart:io';
import 'package:flutter/material.dart';

/// Stub version of FaceCameraScreen for web platform
/// Camera features are not available on web
class FaceCameraScreen extends StatelessWidget {
  const FaceCameraScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          'Photo de profil',
          style: TextStyle(color: Colors.white),
        ),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.no_photography,
                size: 64,
                color: Colors.orange,
              ),
              const SizedBox(height: 16),
              const Text(
                'Fonctionnalité non disponible',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              const Text(
                'La capture photo avec détection de visage n\'est pas disponible sur le web.\n\nVeuillez utiliser l\'application mobile pour cette fonctionnalité.',
                style: TextStyle(color: Colors.white70),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Retour'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

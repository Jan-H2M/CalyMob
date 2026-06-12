/// Carnet de Formation — External proof capture screen.
///
/// Opened by a student when they want to declare an exercise that was done
/// with a non-Calypso monitor (other club, vacation, stage). They upload a
/// photo of the signed card/logbook, enter the external monitor's name and
/// the manager will review.
///
/// Saves to `exercise_claims` with validation_mode='external_monitor' and
/// status='waiting_external_review'.
///
/// Spec : `CARNET_DE_FORMATION_TECH.md` v2.1 §11 (mockup 09).

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class ExternalProofCaptureScreen extends StatefulWidget {
  final String? exerciseCode; // pre-fill if opened from a context

  const ExternalProofCaptureScreen({super.key, this.exerciseCode});

  @override
  State<ExternalProofCaptureScreen> createState() =>
      _ExternalProofCaptureScreenState();
}

class _ExternalProofCaptureScreenState
    extends State<ExternalProofCaptureScreen> {
  final _exerciseCtrl = TextEditingController();
  final _contextCtrl = TextEditingController();
  final _monitorNameCtrl = TextEditingController();
  final _monitorClubCtrl = TextEditingController();
  final _monitorQualCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  bool _photoAttached =
      false; // stub — real implementation hooks to Firebase Storage
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    if (widget.exerciseCode != null) _exerciseCtrl.text = widget.exerciseCode!;
  }

  @override
  void dispose() {
    _exerciseCtrl.dispose();
    _contextCtrl.dispose();
    _monitorNameCtrl.dispose();
    _monitorClubCtrl.dispose();
    _monitorQualCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final keyboardInset = MediaQuery.viewInsetsOf(context).bottom;

    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _header(),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                  children: [
                    _sectionTitle('EXERCICE'),
                    _whiteCard(
                        child: TextField(
                      controller: _exerciseCtrl,
                      decoration: const InputDecoration(
                        hintText: 'Ex: P3.OR',
                        border: InputBorder.none,
                      ),
                    )),
                    const SizedBox(height: 12),
                    _sectionTitle('LIEU / CONTEXTE'),
                    _whiteCard(
                        child: TextField(
                      controller: _contextCtrl,
                      decoration: const InputDecoration(
                        hintText: 'Ex: Zeeland · Oosterschelde · stage 3 jours',
                        border: InputBorder.none,
                      ),
                    )),
                    const SizedBox(height: 12),
                    _sectionTitle('MONITOR EXTERNE'),
                    _whiteCard(
                        child: TextField(
                      controller: _monitorNameCtrl,
                      decoration: const InputDecoration(
                        hintText: 'Nom',
                        border: InputBorder.none,
                      ),
                    )),
                    const SizedBox(height: 6),
                    _whiteCard(
                        child: TextField(
                      controller: _monitorClubCtrl,
                      decoration: const InputDecoration(
                        hintText: 'Club',
                        border: InputBorder.none,
                      ),
                    )),
                    const SizedBox(height: 6),
                    _whiteCard(
                        child: TextField(
                      controller: _monitorQualCtrl,
                      decoration: const InputDecoration(
                        hintText: 'Qualification (ex: 4° encadrant Lifras)',
                        border: InputBorder.none,
                      ),
                    )),
                    const SizedBox(height: 12),
                    _sectionTitle('PHOTO'),
                    _photoPicker(),
                    const SizedBox(height: 12),
                    _sectionTitle('NOTE'),
                    _whiteCard(
                        child: TextField(
                      controller: _notesCtrl,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        hintText: '4 plongées orientation, signé par J. Moreau',
                        border: InputBorder.none,
                      ),
                    )),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: AnimatedPadding(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        padding: EdgeInsets.only(bottom: keyboardInset),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: ElevatedButton(
              onPressed: _submitting ? null : _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.oranje,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                minimumSize: const Size.fromHeight(48),
              ),
              child: _submitting
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2.4,
                      ),
                    )
                  : const Text('Envoyer pour contrôle'),
            ),
          ),
        ),
      ),
    );
  }

  Widget _header() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 12, 8, 12),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white, size: 26),
            onPressed: () => Navigator.pop(context),
          ),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Preuve externe',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  'Pour un exercice fait hors Calypso',
                  style: TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String s) => Padding(
        padding: const EdgeInsets.only(bottom: 6, left: 2),
        child: Text(
          s,
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.85),
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.2,
          ),
        ),
      );

  Widget _whiteCard({required Widget child}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.96),
          borderRadius: BorderRadius.circular(14),
        ),
        child: child,
      );

  Widget _photoPicker() {
    return InkWell(
      onTap: () {
        // TODO phase 5+: integrate image_picker + Firebase Storage upload.
        setState(() => _photoAttached = !_photoAttached);
      },
      borderRadius: BorderRadius.circular(14),
      child: Container(
        height: 140,
        decoration: BoxDecoration(
          color: _photoAttached
              ? const Color(0xFFE2F4E5)
              : const Color(0xFF1C2742),
          borderRadius: BorderRadius.circular(14),
          border: _photoAttached
              ? Border.all(color: const Color(0xFF4CAF50), width: 1.5)
              : null,
        ),
        alignment: Alignment.center,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              _photoAttached ? Icons.check_circle : Icons.camera_alt_outlined,
              color: _photoAttached
                  ? const Color(0xFF2E7D32)
                  : const Color(0xFF9DB4D9),
              size: 36,
            ),
            const SizedBox(height: 6),
            Text(
              _photoAttached
                  ? 'Photo attachée'
                  : 'Touchez pour ajouter une photo',
              style: TextStyle(
                color: _photoAttached
                    ? const Color(0xFF2E7D32)
                    : const Color(0xFF9DB4D9),
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (_exerciseCtrl.text.trim().isEmpty ||
        _monitorNameCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Exercice et monitor externe sont obligatoires')),
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      const clubId = FirebaseConfig.defaultClubId;
      final auth = context.read<AuthProvider>();
      final mp = context.read<MemberProvider>();
      final userId = auth.currentUser?.uid;
      if (userId == null) throw 'Session non identifiée';

      final db = FirebaseFirestore.instance;
      await db
          .collection('clubs')
          .doc(clubId)
          .collection('exercise_claims')
          .add({
        'member_id': userId,
        'member_name': '${mp.prenom ?? ''} ${mp.nom ?? ''}'.trim(),
        'exercise_id': _exerciseCtrl.text.trim(),
        'exercise_code': _exerciseCtrl.text.trim(),
        'context_type': 'manual',
        'declared_by': userId,
        'declared_at': FieldValue.serverTimestamp(),
        'validation_mode': 'external_monitor',
        'external_monitor': {
          'name': _monitorNameCtrl.text.trim(),
          if (_monitorClubCtrl.text.trim().isNotEmpty)
            'club': _monitorClubCtrl.text.trim(),
          if (_monitorQualCtrl.text.trim().isNotEmpty)
            'qualification': _monitorQualCtrl.text.trim(),
          if (_contextCtrl.text.trim().isNotEmpty)
            'encountered_at': _contextCtrl.text.trim(),
        },
        'evidence': _photoAttached
            ? [
                {
                  'id': 'evidence_1',
                  'type': 'signed_card_photo',
                  'status': 'uploaded',
                  // storage_path / download_url to be filled by real picker integration
                }
              ]
            : [],
        'declaration_notes': _notesCtrl.text.trim(),
        'status': 'waiting_external_review',
        'created_at': FieldValue.serverTimestamp(),
        'updated_at': FieldValue.serverTimestamp(),
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Preuve envoyée — le responsable contrôlera')),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur : $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

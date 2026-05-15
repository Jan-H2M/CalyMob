import 'dart:math' as math;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../providers/operation_provider.dart';
import '../../providers/event_message_provider.dart';
import '../../widgets/loading_widget.dart';
import '../../utils/date_formatter.dart';
import '../../utils/currency_formatter.dart';
import '../../utils/tariff_utils.dart';
import '../../utils/permission_helper.dart';
import '../../services/profile_service.dart';
import '../../services/lifras_service.dart';
import '../../services/operation_service.dart';
import '../../services/payment_service.dart';
import '../../models/operation.dart';
import '../../models/member_profile.dart';
import '../../models/exercice_lifras.dart';
import '../../models/participant_operation.dart';
import '../../models/tariff.dart';
import '../../models/event_message.dart';
import '../../models/supplement.dart';
import '../../widgets/participant_payment_card.dart';
import '../../widgets/scanner_modal_sheet.dart';
import '../../widgets/documents_accordion.dart';
import 'add_guest_dialog.dart';
import 'edit_my_inscription_dialog.dart';
import 'register_with_guests_dialog.dart';
import 'edit_event_screen.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_linkify/flutter_linkify.dart';
import '../../models/member_observation.dart';
import '../../services/member_observation_service.dart';
import 'palanquee_screen.dart';
import '../../config/firebase_config.dart';
import '../../widgets/observation_bottom_sheet.dart';
import 'event_discussion_screen.dart';
import '../training/monitor_planning_screen.dart';

/// Écran de détail d'une opération avec bouton inscription
class OperationDetailScreen extends StatefulWidget {
  final String operationId;
  final String clubId;

  const OperationDetailScreen({
    Key? key,
    required this.operationId,
    required this.clubId,
  }) : super(key: key);

  @override
  State<OperationDetailScreen> createState() => _OperationDetailScreenState();
}

class _OperationDetailScreenState extends State<OperationDetailScreen>
    with WidgetsBindingObserver {
  final ProfileService _profileService = ProfileService();
  final LifrasService _lifrasService = LifrasService();
  final OperationService _operationService = OperationService();

  MemberProfile? _userProfile;
  MemberProfile? _organisateurProfile;
  List<ExerciceLIFRAS> _availableExercices = [];
  Map<String, ExerciceLIFRAS> _allExercicesMap = {};
  Map<String, Map<String, MemberObservation>> _exerciceObservations =
      {}; // memberId -> exerciceCode -> observation
  List<String> _selectedExercices = [];
  bool _isLoadingExercices = false;
  ParticipantOperation? _userInscription;

  /// Cache van basis-info (avatar URL + niveau-code) per Membre-id voor
  /// alle deelnemers van het huidige event. Wordt in 1 batch opgehaald
  /// (whereIn op chunks van 30) zodra de participants-lijst geladen is,
  /// zodat we per tile geen extra Firestore-reads doen. `null` als waarde
  /// betekent: opgevraagd maar geen Membre-doc gevonden (bv. legacy id).
  final Map<String, _MemberInfo?> _memberInfoCache = {};
  bool _memberInfoLoading = false;
  String? _memberInfoLoadedForOperation;

  /// Check if the current user is the creator (organisateur) of the event.
  /// Uses the new `creator_user_id` field when present; falls back to
  /// `organisateur_id` for legacy events created before that field existed.
  bool _isCurrentUserCreator(Operation operation) {
    final authProvider = context.read<AuthProvider>();
    final currentUserId = authProvider.currentUser?.uid;
    if (currentUserId == null) return false;
    final creatorId = operation.creatorUserId ?? operation.organisateurId;
    return creatorId != null && creatorId == currentUserId;
  }

  /// Check if the current user can edit the responsable (and other event
  /// settings). Admins can always edit; otherwise only the original creator.
  bool _canEditEvent(Operation operation) {
    if (_isCurrentUserCreator(operation)) return true;
    final memberProvider = context.read<MemberProvider>();
    final role = memberProvider.appRole?.toLowerCase();
    return role == 'admin' || role == 'superadmin';
  }

  /// Check if the current user is the responsable (organisateur) currently
  /// assigned to the event. Distinct from `_isCurrentUserCreator`, which
  /// matches the original creator stamped at creation time.
  bool _isCurrentUserResponsable(Operation operation) {
    final authProvider = context.read<AuthProvider>();
    final currentUserId = authProvider.currentUser?.uid;
    if (currentUserId == null) return false;
    return operation.organisateurId != null &&
        operation.organisateurId == currentUserId;
  }

  /// Check if user can manage palanquées (creator, current responsable, or encadrant).
  ///
  /// Granting access to the current responsable matters when an event has been
  /// reassigned: `creator_user_id` is stamped once at creation and never
  /// changes, so without this fallback a reassigned responsable would lose
  /// palanquée and evaluation rights even though they're now in charge.
  bool _canManagePalanquees(Operation operation) {
    if (_isCurrentUserCreator(operation)) return true;
    if (_isCurrentUserResponsable(operation)) return true;
    final memberProvider = context.read<MemberProvider>();
    final statuten = memberProvider.clubStatuten;
    final normalised = statuten.map((s) => s.toLowerCase().trim()).toList();
    return normalised.contains('encadrant') ||
        normalised.contains('encadrants');
  }

  /// Check if operation date is today or in the past
  bool _isOperationTodayOrPast(Operation operation) {
    if (operation.dateDebut == null) return false;
    final today = DateTime(
      DateTime.now().year,
      DateTime.now().month,
      DateTime.now().day,
    );
    final operationDate = DateTime(
      operation.dateDebut!.year,
      operation.dateDebut!.month,
      operation.dateDebut!.day,
    );
    return operationDate.isBefore(today) ||
        operationDate.isAtSameMomentAs(today);
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadOperation();
      _loadUserProfile();
    });
  }

  @override
  void dispose() {
    super.dispose();
  }

  Future<void> _loadOperation() async {
    final authProvider = context.read<AuthProvider>();
    final userId = authProvider.currentUser?.uid ?? '';

    await context.read<OperationProvider>().selectOperation(
          widget.clubId,
          widget.operationId,
          userId,
        );

    // Load organiser profile (for phone number display)
    _loadOrganisateurProfile();

    // Load user's inscription to get selected exercices
    _loadUserInscription();
  }

  Future<void> _loadOrganisateurProfile() async {
    final operation = context.read<OperationProvider>().selectedOperation;
    final orgId = operation?.organisateurId;
    if (orgId == null || orgId.isEmpty) return;

    final profile = await _profileService.getProfile(widget.clubId, orgId);
    if (mounted) {
      setState(() {
        _organisateurProfile = profile;
      });
    }
  }

  Future<void> _loadUserProfile() async {
    final authProvider = context.read<AuthProvider>();
    final userId = authProvider.currentUser?.uid ?? '';

    final profile = await _profileService.getProfile(widget.clubId, userId);
    if (mounted) {
      setState(() {
        _userProfile = profile;
      });
      // Load exercices after profile is loaded
      _loadExercices();
      // Load complete exercise catalog for displaying other participants's choices
      _loadAllExercices();
      // Load exercise observations for event
      _loadExerciceObservations();
    }
  }

  Future<void> _loadUserInscription() async {
    final authProvider = context.read<AuthProvider>();
    final userId = authProvider.currentUser?.uid ?? '';

    final inscription = await _operationService.getUserInscription(
      clubId: widget.clubId,
      operationId: widget.operationId,
      userId: userId,
    );

    if (mounted && inscription != null) {
      setState(() {
        _userInscription = inscription;
        _selectedExercices = List<String>.from(inscription.exercices);
      });
    }
  }

  Future<void> _loadExercices() async {
    if (_userProfile?.plongeurCode == null) return;

    setState(() {
      _isLoadingExercices = true;
    });

    // Map plongeur_code to the TARGET niveau (exercises to reach the NEXT level)
    // e.g. 4* member → loads AM exercises (not P4)
    final targetNiveau = _targetNiveauForCode(_userProfile!.plongeurCode);
    if (targetNiveau != null) {
      final exercices = await _lifrasService.getExercicesByNiveau(
        widget.clubId,
        targetNiveau,
      );

      if (mounted) {
        setState(() {
          _availableExercices = exercices;
          _isLoadingExercices = false;
        });
      }
    } else {
      setState(() {
        _isLoadingExercices = false;
      });
    }
  }

  /// Returns the LIFRAS niveau of exercises a member needs to reach their NEXT level.
  /// e.g. plongeurCode '4' or '4*' → NiveauLIFRAS.am (exercises to become AM)
  NiveauLIFRAS? _targetNiveauForCode(String? code) {
    if (code == null) return null;
    // Normalize: strip trailing '*' so '4*' == '4'
    final normalized = code.replaceAll('*', '').trim().toUpperCase();
    switch (normalized) {
      case 'NB': return NiveauLIFRAS.nb;  // NB → do NB exercises → become 1*
      case '1':  return NiveauLIFRAS.p2;  // 1* → do P2 exercises → become 2*
      case '2':  return NiveauLIFRAS.p3;  // 2* → do P3 exercises → become 3*
      case '3':  return NiveauLIFRAS.p4;  // 3* → do P4 exercises → become 4*
      case '4':  return NiveauLIFRAS.am;  // 4* → do AM exercises → become AM
      case 'AM': return NiveauLIFRAS.mc;  // AM → do MC exercises → become MC
      case 'MC': return NiveauLIFRAS.mf;  // MC → do MF exercises → become MF
      default:   return null;
    }
  }

  Future<void> _loadAllExercices() async {
    try {
      final allExercices = await _lifrasService.getAllExercices(widget.clubId);
      if (mounted) {
        setState(() {
          _allExercicesMap = {for (var ex in allExercices) ex.id: ex};
        });
      }
    } catch (e) {
      debugPrint('Error loading all exercises: $e');
    }
  }

  Future<void> _saveExercices() async {
    final authProvider = context.read<AuthProvider>();
    final userId = authProvider.currentUser?.uid ?? '';

    try {
      await _operationService.updateExercices(
        clubId: widget.clubId,
        operationId: widget.operationId,
        userId: userId,
        exercices: _selectedExercices,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Exercices enregistrés'),
            backgroundColor: Colors.green,
          ),
        );
        // Refresh participants list
        _loadOperation();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _handleRegister() async {
    final authProvider = context.read<AuthProvider>();
    final memberProvider = context.read<MemberProvider>();
    final operationProvider = context.read<OperationProvider>();
    final operation = operationProvider.selectedOperation;

    final userId = authProvider.currentUser?.uid ?? '';
    final userEmail = authProvider.currentUser?.email ?? '';

    // Calculate base price for display
    final basePrice = _userProfile != null
        ? TariffUtils.computeRegistrationPrice(
            operation: operation!,
            profile: _userProfile!,
          )
        : operation!.prixMembre ?? 0.0;

    // ───────────────────────────────────────────────────────────────────
    // Path 0: Guests-enabled flow.
    // Event has allow_guests=true. Show the unified
    // RegisterWithGuestsDialog that lets the member register themselves
    // AND add multiple guests in one go, with one aggregated QR payment.
    // Works for both paid events (with is_guest_tariff entries) and free
    // events (no tariff at all → guests are added with prix=0).
    // Used for ALL users (admin & member) when the event opts in.
    // ───────────────────────────────────────────────────────────────────
    if (operation.allowGuests) {
      await _handleRegisterWithGuestsFlow(
        operation: operation,
        basePrice: basePrice,
        userId: userId,
        userEmail: userEmail,
        memberProvider: memberProvider,
        operationProvider: operationProvider,
      );
      return;
    }

    // If operation has supplements, show supplement selection dialog
    if (operation.supplements.isNotEmpty) {
      final result = await showDialog<Map<String, dynamic>>(
        context: context,
        builder: (context) => _SupplementSelectionDialog(
          operationTitle: operation.titre,
          supplements: operation.supplements,
          basePrice: basePrice,
        ),
      );

      if (result == null) return; // User cancelled

      final totalPrice = basePrice + (result['supplementTotal'] as double);

      if (mounted) {
        try {
          // Register first
          await operationProvider.registerToOperation(
            clubId: widget.clubId,
            operationId: widget.operationId,
            userId: userId,
            userName: userEmail,
            memberProfile: _userProfile,
            selectedSupplements:
                result['supplements'] as List<SelectedSupplement>,
            supplementTotal: result['supplementTotal'] as double,
          );

          // Refresh participant list after registration
          await operationProvider.reloadParticipants(
              widget.clubId, widget.operationId);

          if (mounted) {
            await _loadUserInscription();

            // If there's a price, show payment options dialog.
            // Skip when priceTbd — the organiser will bill later.
            if (totalPrice > 0 && !operation.priceTbd && _userInscription != null) {
              await _showPaymentOptionsDialog(
                operation: operation,
                amount: totalPrice,
                participantId: _userInscription!.id,
                memberEmail: userEmail,
                memberFirstName: memberProvider.prenom ?? '',
                memberLastName: memberProvider.nom ?? '',
              );
            } else {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Inscription réussie !'),
                  backgroundColor: Colors.green,
                ),
              );
            }
          }
        } catch (e) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(e.toString()),
                backgroundColor: Colors.red,
              ),
            );
          }
        }
      }
    } else {
      // No supplements - simple confirmation dialog
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Confirmer l\'inscription'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Voulez-vous vous inscrire à "${operation.titre}" ?'),
              if (basePrice > 0) ...[
                const SizedBox(height: 12),
                Text(
                  'Prix: ${basePrice.toStringAsFixed(2)} €',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Annuler'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('S\'inscrire'),
            ),
          ],
        ),
      );

      if (confirmed == true && mounted) {
        try {
          await operationProvider.registerToOperation(
            clubId: widget.clubId,
            operationId: widget.operationId,
            userId: userId,
            userName: userEmail,
            memberProfile: _userProfile,
          );

          // Refresh participant list after registration
          await operationProvider.reloadParticipants(
              widget.clubId, widget.operationId);

          if (mounted) {
            await _loadUserInscription();

            // If there's a price, show payment options dialog.
            // Skip when priceTbd — the organiser will bill later.
            if (basePrice > 0 && !operation.priceTbd && _userInscription != null) {
              await _showPaymentOptionsDialog(
                operation: operation,
                amount: basePrice,
                participantId: _userInscription!.id,
                memberEmail: userEmail,
                memberFirstName: memberProvider.prenom ?? '',
                memberLastName: memberProvider.nom ?? '',
              );
            } else {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Inscription réussie !'),
                  backgroundColor: Colors.green,
                ),
              );
            }
          }
        } catch (e) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(e.toString()),
                backgroundColor: Colors.red,
              ),
            );
          }
        }
      }
    }
  }

  /// Combined registration flow for events that allow guests.
  ///
  /// Shows [RegisterWithGuestsDialog] which lets the member register
  /// themselves and optionally add one or more guests in a single
  /// dialog. On submit:
  ///   1. Register the member (parent inscription).
  ///   2. Add each guest with parent_inscription_id linked to the
  ///      member's inscription so the cloud function aggregates them
  ///      into one QR.
  ///   3. Show the payment options dialog with the grand total. The
  ///      Cloud Function `aggregatePaymentForInscription` recomputes
  ///      the server-side total as a safety net.
  Future<void> _handleRegisterWithGuestsFlow({
    required Operation operation,
    required double basePrice,
    required String userId,
    required String userEmail,
    required MemberProvider memberProvider,
    required OperationProvider operationProvider,
  }) async {
    // Build display name and initials for the dialog header.
    final prenom = memberProvider.prenom ?? '';
    final nom = memberProvider.nom ?? '';
    final displayName = ('$prenom $nom').trim().isNotEmpty
        ? ('$prenom $nom').trim()
        : userEmail;
    String initials = '';
    if (prenom.isNotEmpty) initials += prenom[0];
    if (nom.isNotEmpty) initials += nom[0];
    if (initials.isEmpty && userEmail.isNotEmpty) {
      initials = userEmail[0].toUpperCase();
    }
    initials = initials.toUpperCase();

    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      barrierDismissible: false,
      builder: (context) => RegisterWithGuestsDialog(
        operation: operation,
        memberBasePrice: basePrice,
        guestTariffs: _guestTariffs,
        memberDisplayName: displayName,
        memberInitials: initials,
        memberRoleLabel: _userProfile?.fonctionDefaut,
      ),
    );

    if (result == null || !mounted) return;

    final totalPrice = result['totalPrice'] as double;
    final selectedSupplements =
        (result['supplements'] as List).cast<SelectedSupplement>();
    final supplementTotal = result['supplementTotal'] as double;
    final guestsList =
        (result['guests'] as List).cast<Map<String, dynamic>>();

    try {
      // 1. Register the member themselves
      await operationProvider.registerToOperation(
        clubId: widget.clubId,
        operationId: widget.operationId,
        userId: userId,
        userName: userEmail,
        memberProfile: _userProfile,
        selectedSupplements: selectedSupplements.isNotEmpty
            ? selectedSupplements
            : null,
        supplementTotal:
            selectedSupplements.isNotEmpty ? supplementTotal : null,
      );
      await operationProvider.reloadParticipants(
          widget.clubId, widget.operationId);
      if (!mounted) return;
      await _loadUserInscription();
      if (_userInscription == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
                "Inscription faite mais impossible de récupérer la référence pour les invités"),
            backgroundColor: Colors.orange,
          ),
        );
        return;
      }

      // 2. Add each guest, linked to the member's parent inscription.
      final authProvider = context.read<AuthProvider>();
      for (final g in guestsList) {
        final guestSupps = (g['supplements'] as List?)
                ?.cast<SelectedSupplement>() ??
            const <SelectedSupplement>[];
        final guestSuppTotal = (g['supplementTotal'] as num?)?.toDouble();
        await operationProvider.addGuestToOperation(
          clubId: widget.clubId,
          operationId: widget.operationId,
          operationTitle: operation.titre ?? 'Événement',
          guestPrenom: g['prenom'] as String,
          guestNom: g['nom'] as String,
          prix: g['prix'] as double,
          addedByUserId: authProvider.currentUser?.uid ?? userId,
          addedByUserName: displayName,
          parentInscriptionId: _userInscription!.id,
          tariffId: g['tariffId'] as String?,
          selectedSupplements: guestSupps.isNotEmpty ? guestSupps : null,
          supplementTotal:
              (guestSuppTotal != null && guestSuppTotal > 0)
                  ? guestSuppTotal
                  : null,
        );
      }

      if (!mounted) return;

      // 3. Payment options dialog with grand total.
      // (skip when priceTbd — organiser will bill later)
      if (totalPrice > 0 && !operation.priceTbd) {
        await _showPaymentOptionsDialog(
          operation: operation,
          amount: totalPrice,
          participantId: _userInscription!.id,
          memberEmail: userEmail,
          memberFirstName: prenom,
          memberLastName: nom,
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(guestsList.isEmpty
                ? 'Inscription réussie !'
                : 'Inscription réussie avec ${guestsList.length} invité${guestsList.length > 1 ? "s" : ""} !'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString()),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  /// Shows dialog with payment options after successful registration
  Future<void> _showPaymentOptionsDialog({
    required dynamic operation,
    required double amount,
    required String participantId,
    required String memberEmail,
    required String memberFirstName,
    required String memberLastName,
  }) async {
    final payNow = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            Icon(Icons.check_circle, color: Colors.green, size: 28),
            const SizedBox(width: 12),
            const Expanded(child: Text('Inscription réussie !')),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.lichtblauw.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(Icons.euro, color: AppColors.middenblauw, size: 24),
                  const SizedBox(width: 12),
                  Text(
                    'Montant à payer: ${amount.toStringAsFixed(2)} €',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: AppColors.middenblauw,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Button 1: Pay now (green)
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context, true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green.shade600,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.all(16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.email_outlined, size: 22),
                        const SizedBox(width: 8),
                        const Text(
                          'Payer maintenant',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Recevez un QR code par email pour payer via votre app bancaire\n(ou virement manuel avec la communication exacte)',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.white.withOpacity(0.9),
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 12),

            // Button 2: Pay later (grey/blue)
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context, false),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blueGrey.shade100,
                  foregroundColor: Colors.blueGrey.shade800,
                  padding: const EdgeInsets.all(16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.schedule,
                            size: 22, color: Colors.blueGrey.shade700),
                        const SizedBox(width: 8),
                        Text(
                          'Payer plus tard',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                            color: Colors.blueGrey.shade800,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Payez sur place lors de l\'événement',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.blueGrey.shade600,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );

    final operationProvider = context.read<OperationProvider>();

    if (payNow == true && mounted) {
      // Set status to qr_email_sent and send email
      await _operationService.updatePaymentStatus(
        clubId: widget.clubId,
        operationId: widget.operationId,
        participantId: participantId,
        status: 'qr_email_sent',
      );
      await _sendPaymentEmail(
        operation: operation,
        amount: amount,
        participantId: participantId,
        memberEmail: memberEmail,
        memberFirstName: memberFirstName,
        memberLastName: memberLastName,
      );
      // Refresh participant list to show updated payment status
      await operationProvider.reloadParticipants(
          widget.clubId, widget.operationId);
    } else if (payNow == false && mounted) {
      // Set status to qr_on_site (will pay at the event)
      await _operationService.updatePaymentStatus(
        clubId: widget.clubId,
        operationId: widget.operationId,
        participantId: participantId,
        status: 'qr_on_site',
      );
      // Refresh participant list to show updated payment status
      await operationProvider.reloadParticipants(
          widget.clubId, widget.operationId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Vous pourrez payer sur place lors de l\'événement'),
            backgroundColor: Colors.blueGrey,
          ),
        );
      }
    }
  }

  /// Sends the EPC QR code payment email
  Future<void> _sendPaymentEmail({
    required dynamic operation,
    required double amount,
    required String participantId,
    required String memberEmail,
    required String memberFirstName,
    required String memberLastName,
  }) async {
    // Show loading
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const AlertDialog(
        content: Row(
          children: [
            CircularProgressIndicator(),
            SizedBox(width: 20),
            Text('Envoi de l\'email...'),
          ],
        ),
      ),
    );

    try {
      final paymentService = PaymentService();
      await paymentService.sendPaymentQrEmail(
        clubId: widget.clubId,
        operationId: widget.operationId,
        participantId: participantId,
        memberEmail: memberEmail,
        memberFirstName: memberFirstName,
        memberLastName: memberLastName,
        amount: amount,
        operationTitle: operation.titre ?? 'Événement',
        operationNumber: operation.eventNumber,
        operationDate: operation.dateDebut,
      );

      if (mounted) {
        Navigator.pop(context); // Close loading dialog

        // Show success dialog
        await showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: Row(
              children: [
                Icon(Icons.mark_email_read, color: Colors.green, size: 28),
                const SizedBox(width: 12),
                const Expanded(child: Text('Email envoyé !')),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Un email avec le QR code de paiement a été envoyé à :',
                  style: TextStyle(color: Colors.grey.shade700),
                ),
                const SizedBox(height: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.email, size: 16, color: Colors.grey.shade600),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          memberEmail,
                          style: const TextStyle(fontWeight: FontWeight.w500),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.lichtblauw.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                        color: AppColors.lichtblauw.withOpacity(0.3)),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.info_outline,
                          size: 18, color: AppColors.middenblauw),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Ouvrez l\'email et scannez le QR code avec votre application bancaire pour effectuer le virement.',
                          style: TextStyle(
                            fontSize: 13,
                            color: AppColors.middenblauw,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            actions: [
              ElevatedButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Compris'),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        Navigator.pop(context); // Close loading dialog

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur lors de l\'envoi: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  /// Shows the participant payment card for organizers to collect payment
  Future<void> _showParticipantPaymentCard({
    required ParticipantOperation participant,
    required dynamic operation,
  }) async {
    // First, load bank settings from Firestore
    try {
      final bankDoc = await FirebaseFirestore.instance
          .collection('clubs')
          .doc(widget.clubId)
          .collection('settings')
          .doc('bank')
          .get();

      if (!bankDoc.exists) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                  'Configuration bancaire non trouvée. Veuillez configurer l\'IBAN dans CalyCompta.'),
              backgroundColor: Colors.orange,
            ),
          );
        }
        return;
      }

      final bankData = bankDoc.data()!;
      final iban = bankData['iban'] as String?;
      final beneficiaryName = bankData['beneficiaryName'] as String?;
      final bic = bankData['bic'] as String?;

      if (iban == null ||
          iban.isEmpty ||
          beneficiaryName == null ||
          beneficiaryName.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('IBAN ou nom du bénéficiaire non configuré.'),
              backgroundColor: Colors.orange,
            ),
          );
        }
        return;
      }

      if (!mounted) return;

      final operationProvider = context.read<OperationProvider>();

      // Aggregate amount: if this participant has linked guests, sum their
      // totalPrix into the parent's QR (single grouped payment).
      final allP = operationProvider.selectedOperationParticipants;
      final linkedGuests = allP
          .where((p) =>
              p.isGuest && p.parentInscriptionId == participant.id)
          .toList();
      final aggregatedAmount = participant.totalPrix +
          linkedGuests.fold<double>(0.0, (sum, g) => sum + g.totalPrix);

      final result = await showParticipantPaymentCard(
        context: context,
        participantFirstName: participant.membrePrenom ?? '',
        participantLastName: participant.membreNom ?? '',
        participantEmail:
            null, // Email not available on participant, QR code shown on screen
        amount: aggregatedAmount,
        eventTitle: operation.titre ?? 'Événement',
        eventNumber: operation.eventNumber,
        eventId: widget.operationId,
        eventDate: operation.dateDebut,
        clubIban: iban,
        beneficiaryName: beneficiaryName,
        bic: bic,
        onMarkAsPaid: () async {
          // Mark participant as paid in Firestore
          await _operationService.markParticipantAsPaid(
            clubId: widget.clubId,
            operationId: widget.operationId,
            participantId: participant.id,
          );
          // Also mark linked guests as paid — they ride on this QR.
          for (final g in linkedGuests) {
            await _operationService.markParticipantAsPaid(
              clubId: widget.clubId,
              operationId: widget.operationId,
              participantId: g.id,
            );
          }
          // Refresh participant list
          await operationProvider.reloadParticipants(
              widget.clubId, widget.operationId);
        },
      );

      if (result == true && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Paiement enregistré !'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _handleUnregister() async {
    final authProvider = context.read<AuthProvider>();
    final operationProvider = context.read<OperationProvider>();
    final operation = operationProvider.selectedOperation;
    final userId = authProvider.currentUser?.uid ?? '';

    // Find guests this user brought along
    final myInscriptionId = _userInscription?.id;
    final allParticipants = operationProvider.selectedOperationParticipants;
    final myGuests = (myInscriptionId != null)
        ? allParticipants
            .where((p) =>
                p.isGuest && p.parentInscriptionId == myInscriptionId)
            .toList()
        : <ParticipantOperation>[];

    // Decide flow based on whether the member has guests + an organisateur
    String? guestAction; // null=cancel, 'delete', 'transfer'
    if (myGuests.isNotEmpty) {
      final hasOrganiser = operation?.organisateurId != null &&
          operation!.organisateurId!.isNotEmpty &&
          operation.organisateurId != userId;
      guestAction = await _askGuestsHandlingChoice(
        guestCount: myGuests.length,
        hasOrganiser: hasOrganiser,
        organiserName: operation?.organisateurNom,
      );
      if (guestAction == null) return; // user cancelled
    } else {
      // Plain confirmation when no guests
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Confirmer la désinscription'),
          content: Text(
              'Voulez-vous vous désinscrire de "${operation?.titre}" ?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Annuler'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              child: const Text('Se désinscrire',
                  style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
    }

    if (!mounted) return;

    try {
      // 1. Handle the guests first, before deleting the parent inscription.
      if (guestAction == 'delete' && myInscriptionId != null) {
        await _operationService.deleteGuestsForParentInscription(
          clubId: widget.clubId,
          operationId: widget.operationId,
          parentInscriptionId: myInscriptionId,
        );
      } else if (guestAction == 'transfer' &&
          myInscriptionId != null &&
          operation?.organisateurId != null) {
        // Find organisateur's inscription. If they have one, link guests
        // to it. Otherwise null out the parent and let guests be orphans.
        final organisateurInscription =
            await _operationService.findInscriptionForUser(
          clubId: widget.clubId,
          operationId: widget.operationId,
          userId: operation!.organisateurId!,
        );
        await _operationService.transferGuestsToParent(
          clubId: widget.clubId,
          operationId: widget.operationId,
          oldParentInscriptionId: myInscriptionId,
          newParentInscriptionId: organisateurInscription?.id,
          newParentUserId: operation.organisateurId,
          newParentDisplayName: operation.organisateurNom,
        );
      }

      // 2. Now delete the member's own inscription
      await operationProvider.unregisterFromOperation(
        clubId: widget.clubId,
        operationId: widget.operationId,
        userId: userId,
      );

      await operationProvider.reloadParticipants(
          widget.clubId, widget.operationId);

      if (mounted) {
        final msg = guestAction == 'delete'
            ? 'Désinscription réussie (vos ${myGuests.length} invité${myGuests.length > 1 ? "s ont" : " a"} été retiré${myGuests.length > 1 ? "s" : ""})'
            : guestAction == 'transfer'
                ? 'Désinscription réussie (vos ${myGuests.length} invité${myGuests.length > 1 ? "s sont" : " est"} maintenant sous l\'organisateur)'
                : 'Désinscription réussie';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(msg),
            backgroundColor: Colors.orange,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString()),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  /// Handle editing the current user's inscription (supplements, guests).
  ///
  /// The [EditMyInscriptionDialog] handles ALL writes internally via
  /// [OperationService.updateMyInscription]. This method only processes
  /// the dialog result for post-save UI (refund confirmation, QR payment).
  Future<void> _handleEditInscription() async {
    if (_userInscription == null) return;
    final operationProvider = context.read<OperationProvider>();
    final operation = operationProvider.selectedOperation;
    if (operation == null) return;

    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => EditMyInscriptionDialog(
        operation: operation,
        currentInscription: _userInscription!,
        userProfile: _userProfile!,
      ),
    );

    if (result == null || !mounted) return;

    // Dialog already saved — just refresh local state
    await _loadUserInscription();
    if (!mounted) return;

    final delta = result['delta'] as double;
    // refundCreated is true iff the backend will/did create a demande de
    // remboursement: either the parent was already paid, or the user
    // explicitly claimed they had paid (forceRefundClaim).
    final refundCreated = (result['refundCreated'] as bool?) ?? false;
    // requiresPaymentVerification is true when the user claimed
    // "déjà payé" but the inscription wasn't yet marked paid — admin
    // must validate against the bank statement before refunding.
    final requiresVerification =
        (result['requiresPaymentVerification'] as bool?) ?? false;

    if (delta > 0) {
      final authProvider = context.read<AuthProvider>();
      final memberProvider = context.read<MemberProvider>();
      await _showPaymentOptionsDialog(
        operation: operation,
        amount: delta,
        participantId: _userInscription!.id,
        memberEmail: authProvider.currentUser?.email ?? '',
        memberFirstName: memberProvider.prenom ?? '',
        memberLastName: memberProvider.nom ?? '',
      );
    } else if (delta < 0) {
      // Three cases, driven by the flags from the dialog:
      //   1. refundCreated && !requiresVerification: parent was paid →
      //      normal refund flow, demande in 'soumis' status.
      //   2. refundCreated && requiresVerification: user claimed they
      //      paid by transfer that's not yet imported → demande in
      //      'a_verifier_paiement' status; we tell them honestly the
      //      admin must validate first.
      //   3. !refundCreated: user said "pas encore payé" or never paid →
      //      no demande created; the new total is simply lower.
      if (refundCreated) {
        await showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: Row(
              children: [
                Icon(Icons.account_balance,
                    color: Colors.orange.shade700, size: 28),
                const SizedBox(width: 12),
                const Expanded(child: Text('Demande de remboursement')),
              ],
            ),
            content: Text(
              requiresVerification
                  ? 'Une demande de remboursement de ${(-delta).toStringAsFixed(2)} € a été créée, '
                      'en attente de validation du paiement.\n\n'
                      'L\'organisateur vérifiera votre paiement sur le relevé bancaire avant de procéder au remboursement.'
                  : 'Une demande de remboursement de ${(-delta).toStringAsFixed(2)} € a été créée.\n\n'
                      'L\'organisateur traitera votre remboursement manuellement.',
            ),
            actions: [
              ElevatedButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Compris'),
              ),
            ],
          ),
        );
      } else {
        // Not yet paid → nothing to refund. Confirm save and explain.
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Modifications enregistrées — montant à payer réduit de '
              '${(-delta).toStringAsFixed(2)} €.',
            ),
            backgroundColor: Colors.green,
          ),
        );
      }
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Modifications enregistrées'),
          backgroundColor: Colors.green,
        ),
      );
    }
  }

  /// Asks the user what to do with their guests when they unregister.
  /// Returns 'delete', 'transfer' or null (cancel).
  Future<String?> _askGuestsHandlingChoice({
    required int guestCount,
    required bool hasOrganiser,
    String? organiserName,
  }) async {
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Vous avez amené des invités'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Vous avez inscrit $guestCount invité${guestCount > 1 ? "s" : ""}. Que souhaitez-vous faire ?',
            ),
            const SizedBox(height: 12),
            const Text(
              '• Tout annuler : vous et vos invités êtes désinscrits.',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 6),
            if (hasOrganiser)
              Text(
                "• Garder mes invités : ils restent inscrits sous ${organiserName ?? "l'organisateur"} qui s'occupera du paiement.",
                style: const TextStyle(fontSize: 13),
              )
            else
              const Text(
                "• Garder mes invités : pas possible — aucun organisateur défini.",
                style: TextStyle(fontSize: 13, color: Colors.grey),
              ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, null),
            child: const Text('Annuler'),
          ),
          if (hasOrganiser)
            TextButton(
              onPressed: () => Navigator.pop(context, 'transfer'),
              child: const Text("Garder mes invités"),
            ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, 'delete'),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text(
              'Tout annuler',
              style: TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }

  /// Check if current user can scan attendance
  bool get _canScan {
    if (_userProfile == null) {
      debugPrint('🔍 _canScan: profile is null');
      return false;
    }
    final result = PermissionHelper.canScan(
      _userProfile!.clubStatuten,
      fonctionDefaut: _userProfile!.fonctionDefaut,
    );
    debugPrint(
        '🔍 _canScan: clubStatuten=${_userProfile!.clubStatuten}, fonctionDefaut=${_userProfile!.fonctionDefaut}, result=$result');
    return result;
  }

  /// Tariffs from the current operation that are marked as guest tariffs
  /// (i.e. members can pick them when adding an invité).
  List<Tariff> get _guestTariffs {
    final operation = context.read<OperationProvider>().selectedOperation;
    if (operation == null) return const [];
    return operation.eventTariffs.where((t) => t.isGuestTariff).toList();
  }

  /// True when the current user is allowed to add a guest to this operation.
  ///
  /// Two paths:
  ///  1. Admin / encadrant / organisateur (existing behaviour, gated by
  ///     [_canScan]). Can always add a guest, free price.
  ///  2. Any regular member when the event has opted-in via
  ///     `allow_guests=true` AND the event has at least one tariff
  ///     marked `is_guest_tariff=true`. The price is locked to the picked
  ///     tariff. If the member is also registered, the new guest inscription
  ///     is linked to the member's parent inscription so payment can be
  ///     aggregated into a single QR; otherwise the guest is unlinked and
  ///     pays separately.
  bool get _canAddGuest {
    if (_canScan) return true;
    final operation = context.read<OperationProvider>().selectedOperation;
    if (operation == null) return false;
    if (!operation.allowGuests) return false;
    if (_guestTariffs.isEmpty) return false;
    // Capacity check: don't allow more guests when the event is at capacity
    if (operation.capaciteMax != null) {
      final currentCount =
          context.read<OperationProvider>().selectedOperationParticipants.length;
      if (currentCount >= operation.capaciteMax!) return false;
    }
    return true;
  }

  /// Show dialog to add a guest to this operation.
  ///
  /// When the current user is a regular member (not an admin/encadrant) AND
  /// is themselves already registered, the new guest inscription is linked
  /// to their own inscription via `parent_inscription_id` so the payment QR
  /// can be aggregated. If the member isn't registered, the guest is added
  /// unlinked and will pay separately.
  Future<void> _showAddGuestDialog() async {
    final tariffs = _guestTariffs;

    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => AddGuestDialog(
        availableGuestTariffs: _canScan ? const [] : tariffs,
      ),
    );

    if (result != null && mounted) {
      final authProvider = context.read<AuthProvider>();
      final operationProvider = context.read<OperationProvider>();
      final operation = operationProvider.selectedOperation;

      if (operation == null) return;

      // Member-driven flow: link the new guest to the member's own inscription.
      // Admin/encadrant flow stays unlinked (parentInscriptionId = null) to
      // preserve the existing legacy behaviour.
      final isMemberDrivenFlow = !_canScan && _userInscription != null;
      final parentInscriptionId =
          isMemberDrivenFlow ? _userInscription!.id : null;
      final tariffId = result['tariffId'] as String?;

      try {
        await operationProvider.addGuestToOperation(
          clubId: widget.clubId,
          operationId: widget.operationId,
          operationTitle: operation.titre ?? 'Événement',
          guestPrenom: result['prenom'] as String,
          guestNom: result['nom'] as String,
          prix: result['prix'] as double,
          addedByUserId: authProvider.currentUser?.uid ?? '',
          addedByUserName: authProvider.displayName ?? 'Admin',
          parentInscriptionId: parentInscriptionId,
          tariffId: tariffId,
        );

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content:
                  Text('Invité ${result['prenom']} ${result['nom']} ajouté'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Erreur: $e'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
  }

  /// Open scanner modal for this event
  void _openScanner() async {
    final operationProvider = context.read<OperationProvider>();
    final operation = operationProvider.selectedOperation;

    await ScannerModalSheet.show(
      context: context,
      clubId: widget.clubId,
      operationId: widget.operationId,
      operationTitle: operation?.titre ?? 'Événement',
      isPiscine: false,
      eventEndDate: operation?.dateFin ?? operation?.dateDebut,
    );

    // Refresh participants list after closing scanner
    if (mounted) {
      _loadOperation();
    }
  }

  @override
  Widget build(BuildContext context) {
    final operationProvider = context.watch<OperationProvider>();
    final operation = operationProvider.selectedOperation;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text('Détail événement',
            style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          // Edit button - visible to the original creator and to admins
          if (operation != null && _canEditEvent(operation))
            IconButton(
              icon: const Icon(Icons.edit, color: Colors.white, size: 22),
              tooltip: 'Modifier l\'événement',
              onPressed: () async {
                final result = await Navigator.push<bool>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => EditEventScreen(
                      operation: operation,
                      clubId: widget.clubId,
                    ),
                  ),
                );
                // Refresh si des changements ont été enregistrés
                if (result == true && mounted) {
                  _loadOperation();
                }
              },
            ),
          // Scanner button — hidden for dive events (auto-presence on payment).
          // For sorties, presence still needs to be marked manually so we
          // keep the scanner there.
          if (operation?.categorie != 'plongee')
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: IconButton(
                onPressed: _openScanner,
                iconSize: 40,
                icon: const Icon(Icons.qr_code_scanner, color: Colors.white),
                tooltip: 'Scanner présence',
              ),
            ),
        ],
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.bubbles,
        opacity: 0.7,
        child: SafeArea(
          child: Consumer<OperationProvider>(
            builder: (context, operationProvider, child) {
              final operation = operationProvider.selectedOperation;

              if (operationProvider.isLoading || operation == null) {
                return const LoadingWidget(message: 'Chargement...');
              }

              final participantCount =
                  operationProvider.getParticipantCount(operation.id);
              final isRegistered =
                  operationProvider.isUserRegistered(operation.id);
              final isOpen = operation.statut == 'ouvert';
              final isFull = operation.capaciteMax != null &&
                  participantCount >= operation.capaciteMax!;
              final canRegister = isOpen && !isFull && !isRegistered;

              // Get user's inscription to check payment status and price
              final userInscription = _userInscription;
              final isPaid = userInscription?.paye ?? false;

              // Calculate price based on user function if not already inscribed
              // If inscribed, use the total price (base + supplements); otherwise calculate from tariffs
              double inscriptionPrice;
              if (userInscription != null) {
                // Use the total price stored in the inscription (includes supplements)
                inscriptionPrice = userInscription.totalPrix;
              } else if (_userProfile != null) {
                // Calculate price based on user's function
                inscriptionPrice = TariffUtils.computeRegistrationPrice(
                  operation: operation,
                  profile: _userProfile!,
                );
              } else {
                // Fallback to legacy prixMembre
                inscriptionPrice = operation.prixMembre ?? 0.0;
              }

              return Column(
                children: [
                  Expanded(
                    child: RefreshIndicator(
                      onRefresh: () async {
                        // Force reload participants and operation data
                        await operationProvider.reloadParticipants(
                          widget.clubId,
                          widget.operationId,
                        );
                      },
                      color: AppColors.primary,
                      child: SingleChildScrollView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Titre
                            Text(
                              operation.titre,
                              style: const TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),

                            const SizedBox(height: 16),

                            // Compact header: Date + Lieu sur la même ligne
                            _buildCompactHeader(operation),

                            // Responsable sortie + téléphone
                            Builder(builder: (_) {
                              final responsableNom = (operation.organisateurNom != null && operation.organisateurNom!.isNotEmpty)
                                  ? operation.organisateurNom!
                                  : _organisateurProfile?.fullName;
                              if (responsableNom == null || responsableNom.isEmpty) return const SizedBox.shrink();
                              return Padding(
                                padding: const EdgeInsets.only(top: 8),
                                child: Row(
                                  children: [
                                    const Icon(Icons.person, size: 18, color: Colors.white70),
                                    const SizedBox(width: 6),
                                    Flexible(
                                      child: Text(
                                        'Responsable : $responsableNom',
                                        style: const TextStyle(fontSize: 14, color: Colors.white),
                                      ),
                                    ),
                                    if (_organisateurProfile?.phoneNumber != null &&
                                        _organisateurProfile!.phoneNumber!.isNotEmpty) ...[
                                      const SizedBox(width: 12),
                                      GestureDetector(
                                        onTap: () => launchUrl(
                                          Uri.parse('tel:${_organisateurProfile!.phoneNumber!}'),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            const Icon(Icons.phone, size: 16, color: Colors.white70),
                                            const SizedBox(width: 4),
                                            Text(
                                              _organisateurProfile!.phoneNumber!,
                                              style: const TextStyle(
                                                fontSize: 13,
                                                color: Colors.white,
                                                decoration: TextDecoration.underline,
                                                decorationColor: Colors.white70,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              );
                            }),

                            const SizedBox(height: 12),

                            // Prix + Niveau utilisateur
                            _buildPriceAndLevel(operation),

                            const SizedBox(height: 16),

                            // Description accordion
                            if (operation.description != null &&
                                operation.description!.isNotEmpty) ...[
                              _buildDescriptionAccordion(operation),
                              const SizedBox(height: 12),
                            ],

                            // Documents accordion (uploaded via CalyCompta)
                            if (operation
                                .documentsJustificatifs.isNotEmpty) ...[
                              DocumentsAccordion(
                                documents: operation.documentsJustificatifs,
                                initiallyExpanded: false,
                              ),
                              const SizedBox(height: 12),
                            ],

                            // 1. Communication accordion (message de l'organisateur)
                            if (operation.communication != null &&
                                operation.communication!.isNotEmpty) ...[
                              _buildCommunicationAccordion(operation),
                              const SizedBox(height: 12),
                            ],

                            // 2. Discussion (shared modern event chat)
                            _buildDiscussionCard(operation),
                            const SizedBox(height: 12),

                            // 3. Inscribed members accordion (closed by default)
                            _buildInscribedMembersAccordion(operationProvider),
                            const SizedBox(height: 12),

                            // 4. Palanquées button (plongee events).
                            // Visible to all members; canEdit is gated inside
                            // _buildPalanqueeButton so non-managers (who don't
                            // pass _canManagePalanquees) automatically land on
                            // the read-only view inside PalanqueeScreen.
                            if (operation.categorie == 'plongee' &&
                                operationProvider
                                    .selectedOperationParticipants.isNotEmpty) ...[
                              if (_canManagePalanquees(operation)) ...[
                                _buildPrepareExercisesButton(operationProvider),
                                const SizedBox(height: 12),
                              ],
                              _buildPalanqueeButton(operationProvider),
                              const SizedBox(height: 12),
                            ],

                            // 5. Course selection (only if registered AND plongee event) - exercises last
                            if (isRegistered &&
                                operation.categorie == 'plongee') ...[
                              _buildCourseSelection(operationProvider),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),

                  // Bottom buttons section
                  _buildBottomButtons(
                    operation: operation,
                    isRegistered: isRegistered,
                    canRegister: canRegister,
                    isOpen: isOpen,
                    isFull: isFull,
                    isPaid: isPaid,
                    inscriptionPrice: inscriptionPrice,
                    userInscription: userInscription,
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  /// Compact header: Date + Lieu on same line
  Widget _buildCompactHeader(operation) {
    final deadline = operation.effectiveDeadline as DateTime?;
    final deadlinePassed =
        deadline != null && DateTime.now().isAfter(deadline);
    return Row(
      children: [
        // Date + uur — gebruikt formatDayMonth (zonder jaar) zodat de
        // header op smalle schermen niet wraps. Het jaar staat sowieso
        // ergens anders in de detail-content.
        if (operation.dateDebut != null) ...[
          const Icon(Icons.calendar_today, size: 18, color: Colors.white70),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              '${DateFormatter.formatDayMonth(operation.dateDebut!)} '
              '${DateFormatter.formatTime(operation.dateDebut!)}',
              style: const TextStyle(fontSize: 14, color: Colors.white),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],

        // Separator
        if (operation.dateDebut != null && deadline != null) ...[
          const SizedBox(width: 16),
          const Text('|', style: TextStyle(color: Colors.white54)),
          const SizedBox(width: 16),
        ],

        // Date butoir d'inscription — toont aan het lid tot wanneer hij
        // nog kan inschrijven / wijzigen / uitschrijven via CalyMob.
        // Wordt rood/oranje getekend wanneer de deadline gepasseerd is.
        if (deadline != null) ...[
          Icon(
            Icons.lock_clock,
            size: 18,
            color: deadlinePassed
                ? Colors.orangeAccent
                : Colors.white70,
          ),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              deadlinePassed
                  ? 'Clôturé'
                  : 'Inscr. avant '
                      '${DateFormatter.formatDayMonthShort(deadline)} '
                      '${DateFormatter.formatTime(deadline)}',
              style: TextStyle(
                fontSize: 13,
                color: deadlinePassed
                    ? Colors.orangeAccent
                    : Colors.white,
                fontWeight: deadlinePassed
                    ? FontWeight.w600
                    : FontWeight.normal,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ],
    );
  }

  /// Price + user's function. The 'Niveau' marker was removed from the
  /// header — it was visually unreadable on the light gradient and
  /// duplicated info available elsewhere.
  Widget _buildPriceAndLevel(operation) {
    // Calculate the user's price based on their function
    double? userPrice;
    String? userFunction;
    if (_userProfile != null) {
      userPrice = TariffUtils.computeRegistrationPrice(
        operation: operation,
        profile: _userProfile!,
      );
      userFunction = TariffUtils.getFunctionLabel(_userProfile!);
    }

    // Display price: use calculated price if available, else legacy prixMembre
    final displayPrice = userPrice ?? operation.prixMembre;

    return Row(
      children: [
        // Prix à confirmer (organiser hasn't set a price yet)
        if (operation.priceTbd) ...[
          const Icon(Icons.hourglass_empty, size: 18, color: Colors.white70),
          const SizedBox(width: 6),
          const Text(
            'Prix à confirmer',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ]
        // Prix (personnalisé selon fonction)
        else if (displayPrice != null && displayPrice > 0) ...[
          const Icon(Icons.euro, size: 18, color: Colors.white70),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              CurrencyFormatter.format(displayPrice),
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          // Show function if different from default
          if (userFunction != null && userFunction != 'Membre') ...[
            const SizedBox(width: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: AppColors.lichtblauw.withOpacity(0.3),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                userFunction,
                style: const TextStyle(
                  fontSize: 10,
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ] else if (displayPrice == null || displayPrice == 0) ...[
          const Icon(Icons.check_circle_outline,
              size: 18, color: Colors.white70),
          const SizedBox(width: 6),
          const Text(
            'Gratuit',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ],

        // (Niveau-blok verwijderd — overbodig in de header en de styling
        // op een lichte achtergrond was slecht leesbaar. Niveau wordt
        // elders getoond waar het functioneel relevant is.)
      ],
    );
  }

  /// Description accordion with preview text and info document
  Widget _buildDescriptionAccordion(operation) {
    final description = operation.description ?? '';
    final hasInfoDocument = operation.infoDocument != null;

    // Get preview: first line or first ~60 chars
    String preview = description.split('\n').first;
    if (preview.length > 60) {
      preview = '${preview.substring(0, 57)}...';
    }

    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.lichtblauw.withOpacity(0.5)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: ExpansionTile(
          initiallyExpanded: false, // Closed by default
          backgroundColor: AppColors.lichtblauw.withOpacity(0.2),
          collapsedBackgroundColor: Colors.white.withOpacity(0.9),
          tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          leading: Icon(Icons.info_outline, color: AppColors.middenblauw),
          title: Row(
            children: [
              Expanded(
                child: Text(
                  preview,
                  style: TextStyle(
                    fontSize: 14,
                    color: AppColors.donkerblauw,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              // Show document indicator if info document exists
              if (hasInfoDocument) ...[
                const SizedBox(width: 8),
                Icon(
                  Icons.attach_file,
                  size: 16,
                  color: AppColors.middenblauw,
                ),
              ],
            ],
          ),
          children: [
            Container(
              width: double.infinity,
              color: Colors.white.withOpacity(0.95),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Description text (with clickable links)
                  Linkify(
                    onOpen: (link) async {
                      final uri = Uri.parse(link.url);
                      if (await canLaunchUrl(uri)) {
                        await launchUrl(uri,
                            mode: LaunchMode.externalApplication);
                      }
                    },
                    text: description,
                    style: TextStyle(
                      fontSize: 14,
                      color: AppColors.donkerblauw,
                      height: 1.5,
                    ),
                    linkStyle: TextStyle(
                      fontSize: 14,
                      color: Colors.blue,
                      decoration: TextDecoration.underline,
                      height: 1.5,
                    ),
                  ),
                  // Info document link (if exists)
                  if (hasInfoDocument) ...[
                    const SizedBox(height: 12),
                    const Divider(),
                    const SizedBox(height: 8),
                    InkWell(
                      onTap: () async {
                        final uri = Uri.parse(operation.infoDocument!.url);
                        if (await canLaunchUrl(uri)) {
                          await launchUrl(uri,
                              mode: LaunchMode.externalApplication);
                        }
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(
                          color: AppColors.lichtblauw.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                              color: AppColors.lichtblauw.withOpacity(0.5)),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              operation.infoDocument!.isPdf
                                  ? Icons.picture_as_pdf
                                  : Icons.image,
                              color: operation.infoDocument!.isPdf
                                  ? Colors.red.shade700
                                  : AppColors.middenblauw,
                              size: 24,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    operation.infoDocument!.nomAffichage,
                                    style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w500,
                                      color: AppColors.donkerblauw,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  Text(
                                    operation.infoDocument!.formattedSize,
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: Colors.grey[600],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Icon(
                              Icons.open_in_new,
                              color: Colors.grey[400],
                              size: 18,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Communication accordion
  Widget _buildCommunicationAccordion(operation) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.lichtblauw.withOpacity(0.5)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: ExpansionTile(
          initiallyExpanded: true, // Open by default
          backgroundColor: AppColors.lichtblauw.withOpacity(0.2),
          collapsedBackgroundColor: Colors.white.withOpacity(0.9),
          tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          leading: Icon(Icons.campaign, color: AppColors.middenblauw),
          title: Text(
            'Communication',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: AppColors.donkerblauw,
            ),
          ),
          children: [
            Container(
              width: double.infinity,
              color: Colors.white.withOpacity(0.95),
              padding: const EdgeInsets.all(16),
              child: Linkify(
                onOpen: (link) async {
                  final uri = Uri.parse(link.url);
                  if (await canLaunchUrl(uri)) {
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                  }
                },
                text: operation.communication ?? '',
                style: TextStyle(
                  fontSize: 14,
                  color: AppColors.donkerblauw,
                  height: 1.5,
                ),
                linkStyle: TextStyle(
                  fontSize: 14,
                  color: Colors.blue,
                  decoration: TextDecoration.underline,
                  height: 1.5,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openDiscussionScreen(Operation operation) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => EventDiscussionScreen(
          clubId: widget.clubId,
          operationId: widget.operationId,
          operationTitle: operation.titre,
        ),
      ),
    );
  }

  Widget _buildDiscussionCard(Operation operation) {
    final messageProvider = context.watch<EventMessageProvider>();

    return StreamBuilder<List<EventMessage>>(
      stream: messageProvider.watchMessages(widget.clubId, widget.operationId),
      builder: (context, snapshot) {
        final messages = snapshot.data ?? [];
        final lastMessage = messages.isNotEmpty ? messages.last : null;
        final previewText = _buildDiscussionPreview(lastMessage);

        return Container(
          decoration: BoxDecoration(
            border:
                Border.all(color: AppColors.lichtblauw.withValues(alpha: 0.5)),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Material(
            color: Colors.white.withValues(alpha: 0.9),
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: () => _openDiscussionScreen(operation),
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                child: Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: AppColors.lichtblauw.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(
                        Icons.chat_bubble_outline_rounded,
                        color: AppColors.middenblauw,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  'Discussion',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.donkerblauw,
                                  ),
                                ),
                              ),
                              if (messages.isNotEmpty)
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 4,
                                  ),
                                  decoration: BoxDecoration(
                                    color: AppColors.lichtblauw
                                        .withValues(alpha: 0.2),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(
                                    '${messages.length}',
                                    style: const TextStyle(
                                      color: AppColors.middenblauw,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            previewText,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 13,
                              height: 1.35,
                              color: Colors.grey.shade700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Icon(Icons.chevron_right, color: Colors.grey.shade500),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  String _buildDiscussionPreview(EventMessage? lastMessage) {
    if (lastMessage == null) {
      return 'Ouvrir la discussion complète';
    }

    final author = lastMessage.senderName.trim().isEmpty
        ? 'Membre'
        : lastMessage.senderName.trim();

    if (lastMessage.message.trim().isNotEmpty) {
      return '$author: ${lastMessage.message.trim()}';
    }

    if (lastMessage.attachments.isNotEmpty) {
      final hasVideo = lastMessage.attachments.any((a) => a.isVideo);
      final hasImage = lastMessage.attachments.any((a) => a.isImage);
      final attachmentLabel = hasVideo
          ? 'a envoyé une vidéo'
          : hasImage
              ? 'a envoyé une photo'
              : 'a envoyé un document';
      return '$author $attachmentLabel';
    }

    if (lastMessage.poll != null) {
      return '$author a partagé un sondage';
    }

    return 'Ouvrir la discussion complète';
  }

  /// Sorts participants so each guest appears directly after the member
  /// who invited them (linked via `parent_inscription_id`). Members
  /// without guests keep their original position. Orphan guests
  /// (parent not in the list) are kept where they were.
  List<ParticipantOperation> _sortParticipantsWithGuests(
      List<ParticipantOperation> participants) {
    if (participants.isEmpty) return participants;

    // Group guests by their parent inscription id
    final guestsByParent = <String, List<ParticipantOperation>>{};
    final orphanGuests = <ParticipantOperation>[];
    final nonGuests = <ParticipantOperation>[];

    final allIds = participants.map((p) => p.id).toSet();

    for (final p in participants) {
      if (p.isGuest && p.parentInscriptionId != null &&
          allIds.contains(p.parentInscriptionId)) {
        guestsByParent
            .putIfAbsent(p.parentInscriptionId!, () => [])
            .add(p);
      } else if (p.isGuest) {
        orphanGuests.add(p);
      } else {
        nonGuests.add(p);
      }
    }

    final result = <ParticipantOperation>[];
    for (final p in nonGuests) {
      result.add(p);
      final children = guestsByParent[p.id];
      if (children != null) result.addAll(children);
    }
    // Orphans (guests whose parent isn't in the visible list) at the end
    result.addAll(orphanGuests);
    return result;
  }

  /// Inscribed members accordion (closed by default)
  Widget _buildInscribedMembersAccordion(OperationProvider operationProvider) {
    final rawParticipants = operationProvider.selectedOperationParticipants;
    final participants = _sortParticipantsWithGuests(rawParticipants);
    final authProvider = context.read<AuthProvider>();
    final currentUserId = authProvider.currentUser?.uid ?? '';
    // For plongee events, hide present indicator (no attendance tracking)
    final isPlongeeEvent =
        operationProvider.selectedOperation?.categorie == 'plongee';

    // Trigger batch lookup van avatar + niveau-code zodra we participants
    // hebben. addPostFrameCallback voorkomt setState-tijdens-build.
    if (participants.isNotEmpty &&
        _memberInfoLoadedForOperation != widget.operationId &&
        !_memberInfoLoading) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _loadMemberInfoForParticipants(participants);
        }
      });
    }

    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.lichtblauw.withOpacity(0.5)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: ExpansionTile(
          initiallyExpanded: false, // Closed by default
          backgroundColor: AppColors.lichtblauw.withOpacity(0.2),
          collapsedBackgroundColor: Colors.white.withOpacity(0.9),
          tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          leading: Icon(Icons.group, color: AppColors.middenblauw),
          title: Text(
            'Membres inscrits',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: AppColors.donkerblauw,
            ),
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Refresh button for payment status updates
              GestureDetector(
                onTap: () async {
                  await context.read<OperationProvider>().reloadParticipants(
                        widget.clubId,
                        widget.operationId,
                      );
                },
                child: Container(
                  padding: const EdgeInsets.all(6),
                  margin: const EdgeInsets.only(right: 8),
                  decoration: BoxDecoration(
                    color: AppColors.middenblauw.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    Icons.refresh,
                    size: 20,
                    color: AppColors.middenblauw,
                  ),
                ),
              ),
              // Add guest button (only for admins/encadrants)
              if (_canAddGuest)
                GestureDetector(
                  onTap: _showAddGuestDialog,
                  child: Container(
                    padding: const EdgeInsets.all(6),
                    margin: const EdgeInsets.only(right: 8),
                    decoration: BoxDecoration(
                      color: AppColors.oranje.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      Icons.person_add_alt_1,
                      size: 20,
                      color: AppColors.oranje,
                    ),
                  ),
                ),
              // Participant count badge
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                margin: const EdgeInsets.only(right: 8),
                decoration: BoxDecoration(
                  color: AppColors.lichtblauw.withOpacity(0.5),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '${participants.length}',
                  style: TextStyle(
                    fontSize: 14,
                    color: AppColors.donkerblauw,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const Icon(Icons.expand_more),
            ],
          ),
          children: [
            // Supplement breakdown wordt onderaan getoond — zie de
            // _buildSupplementSummaryStrip-call na de lijst hieronder.
            Container(
              color: Colors.white,
              child: participants.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          Icon(Icons.info_outline, color: Colors.grey[400]),
                          const SizedBox(width: 8),
                          Text(
                            'Aucun inscrit pour le moment',
                            style: TextStyle(color: Colors.grey[500]),
                          ),
                        ],
                      ),
                    )
                  : Column(
                      children: participants.map((participant) {
                        final prenom = participant.membrePrenom ?? '';
                        final nom = participant.membreNom ?? '';
                        // Filter out email addresses from nom
                        final isEmail = nom.contains('@');
                        final displayNom = isEmail ? '' : nom;
                        final displayName = prenom.isNotEmpty
                            ? '$prenom $displayNom'.trim()
                            : (displayNom.isNotEmpty ? displayNom : 'Anonyme');
                        final isCurrentUser =
                            participant.membreId == currentUserId;
                        final isGuest = participant.isGuest;

                        final isPresent = participant.present ?? false;
                        // Organizer can tap on unpaid participants to show payment QR.
                        // Guests with a parent inscription do NOT get their own QR —
                        // their payment rides on the parent's aggregated QR.
                        final hasParent = participant.isGuest &&
                            participant.parentInscriptionId != null &&
                            participant.parentInscriptionId!.isNotEmpty;
                        final canShowPaymentCard = _canAddGuest &&
                            !participant.paye &&
                            participant.totalPrix > 0 &&
                            !hasParent;
                        // Get payment status info for subtitle
                        final paymentInfo = _getPaymentStatusInfo(
                            participant.paymentStatusCategory);

                        return Container(
                          color: isGuest
                              ? AppColors.oranje.withOpacity(0.04)
                              : Colors.transparent,
                          padding: isGuest
                              ? const EdgeInsets.only(left: 24)
                              : EdgeInsets.zero,
                          child: ListTile(
                          onTap: canShowPaymentCard
                              ? () => _showParticipantPaymentCard(
                                    participant: participant,
                                    operation:
                                        operationProvider.selectedOperation!,
                                  )
                              : null,
                          leading: _buildParticipantAvatar(
                            participant: participant,
                            prenom: prenom,
                            displayNom: displayNom,
                            isGuest: isGuest,
                            isCurrentUser: isCurrentUser,
                          ),
                          title: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  displayName,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w500,
                                      fontSize: 15),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              // Guest badge
                              if (isGuest) ...[
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: AppColors.oranje.withOpacity(0.2),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    'invité',
                                    style: TextStyle(
                                      fontSize: 10,
                                      color: AppColors.oranje,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ],
                              // Current user badge
                              if (isCurrentUser && !isGuest) ...[
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color:
                                        AppColors.lichtblauw.withOpacity(0.3),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    'vous',
                                    style: TextStyle(
                                      fontSize: 10,
                                      color: AppColors.donkerblauw,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Payment status text (hide for free events)
                              if (participant.totalPrix > 0)
                                Padding(
                                  padding: const EdgeInsets.only(top: 2),
                                  child: Text(
                                    paymentInfo['text'] as String,
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: paymentInfo['color'] as Color,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                ),
                              // Supplements (if any)
                              if (participant.selectedSupplements.isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: 4),
                                  child: Wrap(
                                    spacing: 4,
                                    runSpacing: 4,
                                    children: participant.selectedSupplements
                                        .where((s) => s.name.isNotEmpty)
                                        .map((s) => Container(
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                      horizontal: 6,
                                                      vertical: 2),
                                              decoration: BoxDecoration(
                                                color: AppColors.oranje
                                                    .withOpacity(0.15),
                                                borderRadius:
                                                    BorderRadius.circular(4),
                                              ),
                                              child: Text(
                                                '${s.name}: ${s.price.toStringAsFixed(2)} €',
                                                style: TextStyle(
                                                  fontSize: 11,
                                                  color: AppColors.oranje
                                                      .withOpacity(0.9),
                                                ),
                                              ),
                                            ))
                                        .toList(),
                                  ),
                                ),
                              // Exercices souhaités (tappable for evaluation by monitors)
                              if (participant.exercices.isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: 4),
                                  child: Wrap(
                                    spacing: 4,
                                    runSpacing: 4,
                                    children: participant.exercices.map((exId) {
                                      final ex = _allExercicesMap[exId];
                                      final code = ex?.code ?? exId;
                                      // Look up observation for this member + exercise
                                      final obs = _exerciceObservations[
                                          participant.membreId]?[code];
                                      final statusColor =
                                          _getObservationColor(obs?.result);
                                      final isMonitor = _canManagePalanquees(
                                        context
                                            .read<OperationProvider>()
                                            .selectedOperation!,
                                      );
                                      return GestureDetector(
                                        onTap: isMonitor
                                            ? () =>
                                                _showExerciseEvaluationSheet(
                                                  memberId:
                                                      participant.membreId,
                                                  memberName:
                                                      '${participant.membrePrenom ?? ''} ${participant.membreNom ?? ''}'
                                                          .trim(),
                                                  exerciceId: exId,
                                                  exerciceCode: code,
                                                  exerciceDescription:
                                                      ex?.description ?? '',
                                                  existingObservation: obs,
                                                )
                                            : null,
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 6, vertical: 2),
                                          decoration: BoxDecoration(
                                            color:
                                                statusColor.withOpacity(0.15),
                                            borderRadius:
                                                BorderRadius.circular(4),
                                            border: Border.all(
                                                color: statusColor
                                                    .withOpacity(0.4),
                                                width: 1),
                                          ),
                                          child: Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              if (obs?.result != null)
                                                Padding(
                                                  padding:
                                                      const EdgeInsets.only(
                                                          right: 3),
                                                  child: Icon(
                                                    _getObservationIcon(
                                                        obs?.result),
                                                    size: 12,
                                                    color: statusColor,
                                                  ),
                                                ),
                                              Text(
                                                code,
                                                style: TextStyle(
                                                  fontSize: 11,
                                                  color: statusColor,
                                                  fontWeight: FontWeight.w600,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      );
                                    }).toList(),
                                  ),
                                ),
                            ],
                          ),
                          trailing: SizedBox(
                            width: 80,
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                // Evaluate participant button (feature-flagged)
                                if (_canManagePalanquees(
                                        operationProvider.selectedOperation!) &&
                                    _isOperationTodayOrPast(
                                        operationProvider.selectedOperation!))
                                  Tooltip(
                                    message: 'Évaluer le participant',
                                    child: IconButton(
                                      icon: Icon(Icons.assessment,
                                          size: 20,
                                          color: AppColors.middenblauw),
                                      onPressed: () =>
                                          _showObservationBottomSheet(
                                        participant: participant,
                                        operation: operationProvider
                                            .selectedOperation!,
                                      ),
                                      padding: EdgeInsets.zero,
                                      constraints: const BoxConstraints(
                                          minWidth: 32, minHeight: 32),
                                    ),
                                  ),
                                // Payment info
                                if (participant.totalPrix > 0) ...[
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: hasParent
                                        ? Container(
                                            padding: const EdgeInsets.symmetric(
                                                horizontal: 6, vertical: 2),
                                            decoration: BoxDecoration(
                                              color: AppColors.oranje
                                                  .withOpacity(0.15),
                                              borderRadius:
                                                  BorderRadius.circular(4),
                                            ),
                                            child: Text(
                                              'payé via parent',
                                              textAlign: TextAlign.center,
                                              style: TextStyle(
                                                fontSize: 10,
                                                color: AppColors.oranje,
                                                fontWeight: FontWeight.w500,
                                              ),
                                            ),
                                          )
                                        : (canShowPaymentCard
                                            ? Icon(Icons.qr_code_2,
                                                size: 22,
                                                color: Colors.blueGrey.shade400)
                                            : _buildPaymentBadge(participant)),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ),
                        );
                      }).toList(),
                    ),
            ),
            // Supplement breakdown — onderaan zodat de lijst van leden
            // niet eerst weggeduwd wordt door de aggregate. Helpt de
            // organisator wanneer hij doorscrolt: 'OK ik heb iedereen
            // gezien, dit zijn de totalen om te bestellen'.
            _buildSupplementSummaryStrip(participants),
          ],
        ),
      ),
    );
  }

  /// Haalt voor alle non-guest deelnemers de avatar-URL + niveau-code op
  /// uit Firestore in 1 batch (whereIn, chunks van 30). Idempotent: roept
  /// niets opnieuw op als de data voor deze operation al gecached is.
  Future<void> _loadMemberInfoForParticipants(
    List<ParticipantOperation> participants,
  ) async {
    if (_memberInfoLoading) return;
    if (_memberInfoLoadedForOperation == widget.operationId) return;

    final ids = participants
        .where((p) => !p.isGuest && p.membreId.isNotEmpty)
        .map((p) => p.membreId)
        .where((id) => !_memberInfoCache.containsKey(id))
        .toSet()
        .toList();
    if (ids.isEmpty) {
      _memberInfoLoadedForOperation = widget.operationId;
      return;
    }

    _memberInfoLoading = true;
    try {
      final fs = FirebaseFirestore.instance;
      // Firestore whereIn limit = 30. Chunken indien nodig.
      for (int i = 0; i < ids.length; i += 30) {
        final chunk = ids.sublist(i, math.min(i + 30, ids.length));
        final snap = await fs
            .collection('clubs/${widget.clubId}/members')
            .where(FieldPath.documentId, whereIn: chunk)
            .get();
        for (final doc in snap.docs) {
          final data = doc.data();
          _memberInfoCache[doc.id] = _MemberInfo(
            photoUrl: (data['photo_url'] as String?)?.trim(),
            plongeurCode: (data['plongeur_code'] as String?)?.trim(),
          );
        }
        // Markeer ontbrekende ids zodat we niet blijven proberen
        final returned = snap.docs.map((d) => d.id).toSet();
        for (final id in chunk) {
          if (!returned.contains(id)) {
            _memberInfoCache[id] = null;
          }
        }
      }
      _memberInfoLoadedForOperation = widget.operationId;
      if (mounted) setState(() {});
    } catch (e) {
      debugPrint('⚠️ Erreur batch lookup member info: $e');
    } finally {
      _memberInfoLoading = false;
    }
  }

  /// Avatar voor een participant — toont de profielfoto wanneer
  /// beschikbaar, anders de eerste letter van de voornaam (oude gedrag).
  /// Een klein blauw badge onderaan rechts toont de niveau-code (P1, P2,
  /// AM, MC, ...) wanneer die op de Membre-doc staat.
  Widget _buildParticipantAvatar({
    required ParticipantOperation participant,
    required String prenom,
    required String displayNom,
    required bool isGuest,
    required bool isCurrentUser,
  }) {
    final info = _memberInfoCache[participant.membreId];
    final hasPhoto = !isGuest &&
        info?.photoUrl != null &&
        info!.photoUrl!.isNotEmpty;
    final niveau = isGuest ? null : info?.plongeurCode;

    final letter = prenom.isNotEmpty
        ? prenom[0].toUpperCase()
        : (displayNom.isNotEmpty ? displayNom[0].toUpperCase() : '?');

    return SizedBox(
      width: 44,
      height: 44,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: isGuest
                ? AppColors.oranje.withOpacity(0.3)
                : (isCurrentUser
                    ? AppColors.lichtblauw.withOpacity(0.5)
                    : AppColors.lichtblauw.withOpacity(0.3)),
            backgroundImage: hasPhoto ? NetworkImage(info.photoUrl!) : null,
            onBackgroundImageError:
                hasPhoto ? (_, __) {} : null,
            child: hasPhoto
                ? null
                : (isGuest
                    ? Icon(Icons.person_outline,
                        size: 20, color: AppColors.oranje)
                    : Text(
                        letter,
                        style: TextStyle(
                          color: isCurrentUser
                              ? AppColors.donkerblauw
                              : AppColors.middenblauw,
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      )),
          ),
          if (niveau != null && niveau.isNotEmpty)
            Positioned(
              bottom: -2,
              right: -4,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                decoration: BoxDecoration(
                  color: AppColors.middenblauw,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.white, width: 1.5),
                ),
                child: Text(
                  niveau,
                  style: const TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                    height: 1.0,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// Aggregate van gekozen supplements over alle deelnemers (members +
  /// invités) — toont bv. "21× Hamburger viande · 3× Hamburger végétarien"
  /// zodat de organisator weet hoeveel van elk te bestellen. Toont niets
  /// wanneer er geen supplementen geselecteerd zijn (geen lege strip).
  Widget _buildSupplementSummaryStrip(List<ParticipantOperation> participants) {
    // Tel per supplement-id (fallback op naam) op hoeveel inschrijvingen
    // hem hebben gekozen. Gebruik de eerst-geziene naam zodat een
    // hernoeming in de catalogus niet voor dubbele rijen zorgt.
    final Map<String, ({String name, int count})> counts = {};
    for (final p in participants) {
      for (final s in p.selectedSupplements) {
        final key = s.id.isNotEmpty ? s.id : s.name;
        final existing = counts[key];
        if (existing != null) {
          counts[key] = (name: existing.name, count: existing.count + 1);
        } else {
          counts[key] = (name: s.name, count: 1);
        }
      }
    }
    if (counts.isEmpty) return const SizedBox.shrink();

    final items = counts.values.toList()
      ..sort((a, b) {
        final byCount = b.count.compareTo(a.count);
        if (byCount != 0) return byCount;
        return a.name.toLowerCase().compareTo(b.name.toLowerCase());
      });

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(
          bottom: BorderSide(color: Colors.grey.shade200),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'SUPPLÉMENTS',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: Colors.grey.shade600,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: items.map((item) {
              return Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '${item.count}×',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: Colors.blue.shade700,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      item.name,
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.blue.shade700,
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  /// Bottom buttons: Payment (if not paid) + Register/Unregister
  Widget _buildBottomButtons({
    required operation,
    required bool isRegistered,
    required bool canRegister,
    required bool isOpen,
    required bool isFull,
    required bool isPaid,
    required double inscriptionPrice,
    ParticipantOperation? userInscription,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        // Gradient from transparent to semi-opaque for ocean theme
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.transparent,
            AppColors.donkerblauw.withOpacity(0.3),
          ],
        ),
      ),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Show payment status badge if paid
            if (isRegistered && isPaid) ...[
              _buildPaymentStatusBadge(userInscription),
              const SizedBox(height: 12),
            ],

            // Show inscription status card (payment mode) if registered but not yet paid
            if (isRegistered && !isPaid && userInscription != null) ...[
              _buildInscriptionStatusCard(
                inscription: userInscription,
                operation: operation,
                inscriptionPrice: inscriptionPrice,
              ),
              const SizedBox(height: 12),
            ],

            // Register/Unregister button
            _buildActionButton(
              isRegistered: isRegistered,
              canRegister: canRegister,
              isOpen: isOpen,
              isFull: isFull,
              operation: operation is Operation ? operation : null,
              userInscription: userInscription,
            ),
          ],
        ),
      ),
    );
  }

  /// Build payment status badge with different states
  Widget _buildPaymentStatusBadge(ParticipantOperation? inscription) {
    if (inscription == null) return const SizedBox.shrink();

    final isAwaitingBank = inscription.isPaidAwaitingBank;
    final isFullyPaid = inscription.isFullyPaid;

    // Determine colors and text based on status
    Color bgColor;
    Color textColor;
    IconData icon;
    String text;

    if (isFullyPaid) {
      // Fully paid - bank transaction matched
      bgColor = Colors.green.shade100;
      textColor = Colors.green.shade700;
      icon = Icons.check_circle;
      text = 'Payé';
    } else if (isAwaitingBank) {
      // Paid via CalyMob but awaiting bank processing
      bgColor = Colors.orange.shade100;
      textColor = Colors.orange.shade700;
      icon = Icons.schedule;
      text = 'Payé via CalyMob\nEn attente de traitement bancaire';
    } else {
      // Fallback - just show paid (legacy data without transaction_matched)
      bgColor = Colors.green.shade100;
      textColor = Colors.green.shade700;
      icon = Icons.check_circle;
      text = 'Inscription payée';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: textColor, size: 20),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              text,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                color: textColor,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Build inscription status card: shows payment mode (on-site or email QR)
  /// for a registered but not-yet-paid participant. Tappable to open options.
  Widget _buildInscriptionStatusCard({
    required ParticipantOperation inscription,
    required dynamic operation,
    required double inscriptionPrice,
  }) {
    final isEmail = inscription.paymentStatus == 'qr_email_sent';

    final Color bgColor = isEmail
        ? Colors.blue.shade50
        : Colors.blueGrey.shade50;
    final Color borderColor = isEmail
        ? Colors.blue.shade200
        : Colors.blueGrey.shade200;
    final Color accentColor = isEmail
        ? Colors.blue.shade700
        : Colors.blueGrey.shade700;
    final IconData icon = isEmail
        ? Icons.mark_email_read_outlined
        : Icons.qr_code_scanner;

    final String title = 'Inscrit';
    final String subtitle = isEmail
        ? 'QR code envoyé par email'
        : 'Paiement sur place via QR code';

    String? timestampLine;
    if (isEmail && inscription.paymentStatusAt != null) {
      final dt = inscription.paymentStatusAt!;
      final dd = dt.day.toString().padLeft(2, '0');
      final mm = dt.month.toString().padLeft(2, '0');
      final hh = dt.hour.toString().padLeft(2, '0');
      final mi = dt.minute.toString().padLeft(2, '0');
      timestampLine = 'le $dd/$mm/${dt.year} à $hh:$mi';
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => _showPaymentOptionsSheet(
          inscription: inscription,
          operation: operation,
          inscriptionPrice: inscriptionPrice,
        ),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: borderColor),
          ),
          child: Row(
            children: [
              Icon(icon, color: accentColor, size: 24),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: accentColor,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 13,
                        color: accentColor.withOpacity(0.85),
                      ),
                    ),
                    if (timestampLine != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        timestampLine,
                        style: TextStyle(
                          fontSize: 11,
                          color: accentColor.withOpacity(0.7),
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              Icon(Icons.more_horiz, color: accentColor.withOpacity(0.6), size: 20),
            ],
          ),
        ),
      ),
    );
  }

  /// Bottom sheet shown when tapping the inscription status card.
  /// Options depend on current payment_status:
  ///  - qr_on_site (or null) → "Recevoir le QR par email"
  ///  - qr_email_sent         → "Renvoyer le QR par email" + "Passer à paiement sur place"
  Future<void> _showPaymentOptionsSheet({
    required ParticipantOperation inscription,
    required dynamic operation,
    required double inscriptionPrice,
  }) async {
    final isEmail = inscription.paymentStatus == 'qr_email_sent';
    final memberProvider = context.read<MemberProvider>();
    final authProvider = context.read<AuthProvider>();
    final memberEmail = authProvider.currentUser?.email ?? '';
    final memberFirstName = memberProvider.prenom ?? '';
    final memberLastName = memberProvider.nom ?? '';

    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetCtx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Handle bar
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Options de paiement',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.bold,
                  color: AppColors.donkerblauw,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                isEmail
                    ? 'Vous avez choisi de recevoir le QR code par email.'
                    : 'Vous avez choisi de payer sur place via QR code.',
                style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
              ),
              const SizedBox(height: 20),

              // Primary action: send / resend QR email
              ElevatedButton.icon(
                onPressed: () async {
                  Navigator.pop(sheetCtx);
                  // CALYMOB-1C: must be the Firestore inscription doc id,
                  // not the auth uid. Inscriptions are created with .add()
                  // so doc.id is auto-generated and not equal to userId.
                  await _operationService.updatePaymentStatus(
                    clubId: widget.clubId,
                    operationId: widget.operationId,
                    participantId: inscription.id,
                    status: 'qr_email_sent',
                  );
                  await _sendPaymentEmail(
                    operation: operation,
                    amount: inscriptionPrice,
                    participantId: inscription.id,
                    memberEmail: memberEmail,
                    memberFirstName: memberFirstName,
                    memberLastName: memberLastName,
                  );
                  if (mounted) {
                    await context
                        .read<OperationProvider>()
                        .reloadParticipants(widget.clubId, widget.operationId);
                  }
                },
                icon: const Icon(Icons.email_outlined),
                label: Text(
                  isEmail
                      ? 'Renvoyer le QR code par email'
                      : 'Recevoir le QR code par email',
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blue.shade600,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),

              // Secondary action (only when currently email): switch to on-site
              if (isEmail) ...[
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: () async {
                    Navigator.pop(sheetCtx);
                    // CALYMOB-1C: pass the inscription doc id, not the auth uid.
                    await _operationService.updatePaymentStatus(
                      clubId: widget.clubId,
                      operationId: widget.operationId,
                      participantId: inscription.id,
                      status: 'qr_on_site',
                    );
                    if (mounted) {
                      await context
                          .read<OperationProvider>()
                          .reloadParticipants(
                              widget.clubId, widget.operationId);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                              'Vous pourrez payer sur place lors de l\'événement'),
                          backgroundColor: Colors.blueGrey,
                        ),
                      );
                    }
                  },
                  icon: Icon(Icons.qr_code_scanner,
                      color: Colors.blueGrey.shade700),
                  label: Text(
                    'Passer à paiement sur place',
                    style: TextStyle(color: Colors.blueGrey.shade800),
                  ),
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(color: Colors.blueGrey.shade300),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ],

              const SizedBox(height: 10),
              TextButton(
                onPressed: () => Navigator.pop(sheetCtx),
                child: Text(
                  'Annuler',
                  style: TextStyle(color: Colors.grey.shade600),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDeadlineBanner(DateTime deadline) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.orange.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.orange.shade200),
      ),
      child: Row(
        children: [
          Icon(Icons.timer, color: Colors.orange.shade700, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Modifications fermées depuis ${DateFormatter.formatShort(deadline)}. Contactez l\'organisateur.',
              style: TextStyle(
                color: Colors.orange.shade900,
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton({
    required bool isRegistered,
    required bool canRegister,
    required bool isOpen,
    required bool isFull,
    Operation? operation,
    ParticipantOperation? userInscription,
  }) {
    if (isRegistered) {
      final deadlinePassed = operation != null &&
          operation.effectiveDeadline != null &&
          DateTime.now().isAfter(operation.effectiveDeadline!);
      final hasSupplements =
          operation != null && operation.supplements.isNotEmpty;
      final allowsGuests = operation != null && operation.allowGuests;
      // Show "Modifier" whenever there's something useful to edit:
      // either supplement toggles OR guest management. Without this OR,
      // events that allow guests but have no supplements (Sortie Laser
      // Game-style) would hide the button and you couldn't add/remove
      // invités via the mobile app.
      final showModifyButton = !deadlinePassed &&
          (hasSupplements || allowsGuests) &&
          userInscription != null;

      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Deadline banner — shown whenever the deadline has passed,
          // since both "Modifier" and "Se désinscrire" become unavailable
          // and the member needs to know to contact the organiser.
          if (deadlinePassed) ...[
            _buildDeadlineBanner(operation!.effectiveDeadline!),
            const SizedBox(height: 12),
          ],

          // Buttons row
          Row(
            children: [
              // "Modifier" button — only when deadline not passed and supplements exist
              if (showModifyButton) ...[
                Expanded(
                  child: SizedBox(
                    height: 50,
                    child: ElevatedButton.icon(
                      onPressed: _handleEditInscription,
                      icon: const Icon(Icons.edit, color: Colors.white),
                      label: const Text('Modifier',
                          style: TextStyle(fontSize: 16, color: Colors.white)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.lichtblauw,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                        elevation: 8,
                        shadowColor: AppColors.lichtblauw.withOpacity(0.5),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
              ],

              // "Se désinscrire" button — disabled after deadline. The
              // Firestore rule blocks the delete anyway; greying out the
              // button mirrors that and avoids a confusing error toast.
              Expanded(
                child: SizedBox(
                  height: 50,
                  child: ElevatedButton.icon(
                    onPressed: deadlinePassed ? null : _handleUnregister,
                    icon: const Icon(Icons.cancel, color: Colors.white),
                    label: const Text('Se désinscrire',
                        style: TextStyle(fontSize: 16, color: Colors.white)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red,
                      disabledBackgroundColor: Colors.grey.shade400,
                      disabledForegroundColor: Colors.white70,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                      elevation: 8,
                      shadowColor: Colors.red.withOpacity(0.5),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      );
    }

    if (!isOpen) {
      return SizedBox(
        width: double.infinity,
        height: 50,
        child: ElevatedButton(
          onPressed: null,
          style: ElevatedButton.styleFrom(
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: const Text('Événement fermé', style: TextStyle(fontSize: 16)),
        ),
      );
    }

    // Deadline passed — registration is closed for members. The
    // Firestore CREATE rule rejects late inscriptions anyway; this UI
    // makes the reason explicit instead of letting the user tap and
    // get a permission-denied toast. Admins (with a valid web session)
    // bypass the rule but they don't go through this mobile screen.
    final deadlinePassed = operation != null &&
        operation.effectiveDeadline != null &&
        DateTime.now().isAfter(operation.effectiveDeadline!);
    if (deadlinePassed) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildDeadlineBanner(operation.effectiveDeadline!),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton(
              onPressed: null,
              style: ElevatedButton.styleFrom(
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
                disabledBackgroundColor: Colors.grey.shade400,
                disabledForegroundColor: Colors.white70,
              ),
              child: const Text('Inscriptions clôturées',
                  style: TextStyle(fontSize: 16)),
            ),
          ),
        ],
      );
    }

    if (isFull) {
      return SizedBox(
        width: double.infinity,
        height: 50,
        child: ElevatedButton(
          onPressed: null,
          style: ElevatedButton.styleFrom(
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child:
              const Text('Événement complet', style: TextStyle(fontSize: 16)),
        ),
      );
    }

    return SizedBox(
      width: double.infinity,
      height: 50,
      child: ElevatedButton.icon(
        onPressed: _handleRegister,
        icon: const Icon(Icons.check_circle, color: Colors.white),
        label: const Text('S\'inscrire',
            style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.white)),
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.middenblauw,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          elevation: 8,
          shadowColor: AppColors.middenblauw.withOpacity(0.5),
        ),
      ),
    );
  }

  /// Button to navigate to palanquée composition screen
  Widget _buildPalanqueeButton(OperationProvider operationProvider) {
    final operation = operationProvider.selectedOperation;
    final participants = operationProvider.selectedOperationParticipants;
    if (operation == null) return const SizedBox.shrink();

    return GestureDetector(
      onTap: () async {
        final authProvider = Provider.of<AuthProvider>(context, listen: false);
        final userId = authProvider.currentUser?.uid ?? '';
        // canEdit must mirror the visibility check on this button: if the user
        // is allowed to see and tap the palanquées entry, they're allowed to
        // edit. Previously this was the stricter `_isCurrentUserCreator`,
        // which left encadrants and reassigned responsables in read-only mode
        // even though they could open the screen — surfaced as "no access".
        final canEdit = _canManagePalanquees(operation);
        final result = await Navigator.push<bool>(
          context,
          MaterialPageRoute(
            builder: (_) => PalanqueeScreen(
              operation: operation,
              participants: participants,
              clubId: widget.clubId,
              userId: userId,
              canEdit: canEdit,
            ),
          ),
        );
        // Refresh si des changements ont été enregistrés
        if (result == true && mounted) {
          _loadOperation();
        }
      },
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Icon(Icons.groups, color: AppColors.primary, size: 22),
            const SizedBox(width: 12),
            const Expanded(
              child: Text(
                'Palanquées',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF1A1A1A),
                ),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.primary.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                '${participants.length}',
                style: TextStyle(
                  color: AppColors.primary,
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Icon(Icons.chevron_right, color: Colors.grey[400], size: 22),
          ],
        ),
      ),
    );
  }

  /// Button to prepare pedagogical roles/exercises for the dive.
  Widget _buildPrepareExercisesButton(OperationProvider operationProvider) {
    final operation = operationProvider.selectedOperation;
    if (operation == null) return const SizedBox.shrink();

    return GestureDetector(
      onTap: () async {
        final result = await Navigator.push<bool>(
          context,
          MaterialPageRoute(
            builder: (_) => MonitorPlanningScreen(operationId: operation.id),
          ),
        );
        if (result == true && mounted) {
          _loadOperation();
        }
      },
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Icon(Icons.fact_check_outlined, color: AppColors.primary, size: 22),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Préparer exercices',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF1A1A1A),
                    ),
                  ),
                  SizedBox(height: 2),
                  Text(
                    'Rôles, exercices ouverts et validations à suivre',
                    style: TextStyle(
                      fontSize: 12,
                      color: Color(0xFF607085),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(Icons.chevron_right, color: Colors.grey[400], size: 22),
          ],
        ),
      ),
    );
  }

  /// Course selection with accordion/dropdown for LIFRAS exercises
  Widget _buildCourseSelection(OperationProvider operationProvider) {
    final userLevel = _userProfile?.plongeurCode;
    final participants = operationProvider.selectedOperationParticipants;
    // Count participants who have selected at least one exercise
    final participantsWithExercises =
        participants.where((p) => p.exercices.isNotEmpty).length;

    if (_isLoadingExercices) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_availableExercices.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.grey.shade100,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Icon(Icons.info_outline, color: Colors.grey[600], size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                userLevel == null
                    ? 'Configurez votre niveau dans votre profil'
                    : 'Aucun exercice disponible pour le niveau $userLevel',
                style: TextStyle(color: Colors.grey[600], fontSize: 14),
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: Colors.blue.shade200),
        borderRadius: BorderRadius.circular(12),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: ExpansionTile(
          initiallyExpanded: false,
          backgroundColor: Colors.blue.shade50,
          collapsedBackgroundColor: Colors.white,
          tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          leading: Icon(Icons.school, color: Colors.blue[700]),
          title: Text(
            'Exercices souhaités',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Colors.grey[800],
            ),
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                margin: const EdgeInsets.only(right: 8),
                decoration: BoxDecoration(
                  color: Colors.blue.shade100,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '$participantsWithExercises',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.blue[700],
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const Icon(Icons.expand_more),
            ],
          ),
          children: [
            Container(
              color: Colors.white,
              child: Column(
                children: [
                  ..._availableExercices.map((exercice) {
                    final isSelected = _selectedExercices.contains(exercice.id);
                    return CheckboxListTile(
                      value: isSelected,
                      onChanged: (value) {
                        setState(() {
                          if (value == true) {
                            _selectedExercices.add(exercice.id);
                          } else {
                            _selectedExercices.remove(exercice.id);
                          }
                        });
                      },
                      title: Text(
                        exercice.code,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      subtitle: Text(
                        exercice.description,
                        style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                      ),
                      controlAffinity: ListTileControlAffinity.leading,
                      activeColor: Colors.blue,
                      dense: true,
                    );
                  }),
                  // Save button inside accordion
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _selectedExercices.isNotEmpty
                            ? _saveExercices
                            : null,
                        icon: const Icon(Icons.save, size: 18),
                        label: Text(
                          _selectedExercices.isEmpty
                              ? 'Sélectionnez des exercices'
                              : 'Enregistrer (${_selectedExercices.length})',
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.blue,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8)),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPaymentBadge(ParticipantOperation participant) {
    // Use paymentStatusCategory for consistent status display
    final category = participant.paymentStatusCategory;
    final IconData icon;
    final Color color;

    switch (category) {
      case 'paid':
        // Volledig betaald en gematcht met banktransactie - groene V
        icon = Icons.check;
        color = Colors.green;
        break;
      case 'pending_bank':
        // Betaald via CalyMob, wacht op bankmatching - oranje V
        icon = Icons.check;
        color = Colors.orange;
        break;
      case 'qr_sent':
        // QR code per email verstuurd - amber envelop
        icon = Icons.email_outlined;
        color = Colors.amber.shade700;
        break;
      case 'on_site':
        // Betaalt ter plaatse - blauwgrijs klok
        icon = Icons.schedule;
        color = Colors.blueGrey;
        break;
      case 'cash':
        // Contant betaald - blauw betaling icoon
        icon = Icons.payments_outlined;
        color = Colors.blue;
        break;
      default:
        // Niet betaald - rode X
        icon = Icons.close;
        color = Colors.red;
    }

    return Icon(
      icon,
      size: 20,
      color: color,
    );
  }

  /// Returns payment status text and color for display
  Map<String, dynamic> _getPaymentStatusInfo(String category) {
    switch (category) {
      case 'paid':
        return {'text': 'Payé', 'color': Colors.green};
      case 'pending_bank':
        return {'text': 'En attente bancaire', 'color': Colors.orange};
      case 'qr_sent':
        return {'text': 'QR envoyé par email', 'color': Colors.amber.shade700};
      case 'on_site':
        return {'text': 'Paiement sur place', 'color': Colors.blueGrey};
      case 'cash':
        return {'text': 'Payé en espèces', 'color': Colors.blue};
      default:
        return {'text': 'Non payé', 'color': Colors.red};
    }
  }

  Future<void> _loadExerciceObservations() async {
    final operation = context.read<OperationProvider>().selectedOperation;
    if (operation == null) return;

    final service = MemberObservationService();
    final stream = service.getObservationsForSession(
      widget.clubId,
      operation.id,
    );

    stream.listen((observations) {
      if (!mounted) return;
      final map = <String, Map<String, MemberObservation>>{};
      for (final obs in observations) {
        if (obs.category == 'exercice_lifras' && obs.exerciceCode != null) {
          map.putIfAbsent(obs.memberId, () => {});
          map[obs.memberId]![obs.exerciceCode!] = obs;
        }
      }
      setState(() {
        _exerciceObservations = map;
      });
    });
  }

  /// Show observation bottom sheet for participant evaluation during plongee (dive operation)
  void _showObservationBottomSheet({
    required ParticipantOperation participant,
    required Operation operation,
  }) {
    final authProvider = context.read<AuthProvider>();
    final memberProvider = context.read<MemberProvider>();
    final currentUserId = authProvider.currentUser?.uid ?? '';
    final currentUserName =
        '${memberProvider.prenom ?? ''} ${memberProvider.nom ?? ''}'.trim();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => ObservationBottomSheet(
        clubId: FirebaseConfig.defaultClubId,
        memberId: participant.membreId,
        memberName:
            '${participant.membrePrenom ?? ''} ${participant.membreNom ?? ''}'
                .trim(),
        memberNiveau: '', // Level not available from ParticipantOperation
        sessionId: operation.id,
        sessionTitle: operation.titre,
        sessionDate: operation.dateDebut ?? DateTime.now(),
        observerId: currentUserId,
        observerName: currentUserName,
        contextType: 'plongee', // Dive operation context
      ),
    );
  }

  void _showExerciseEvaluationSheet({
    required String memberId,
    required String memberName,
    required String exerciceId,
    required String exerciceCode,
    required String exerciceDescription,
    MemberObservation? existingObservation,
  }) {
    final operation = context.read<OperationProvider>().selectedOperation;
    if (operation == null) return;

    final authProvider = context.read<AuthProvider>();
    final memberProvider = context.read<MemberProvider>();
    final currentUserId = authProvider.currentUser?.uid ?? '';
    final currentUserName =
        '${memberProvider.prenom ?? ''} ${memberProvider.nom ?? ''}'.trim();

    String? selectedResult = existingObservation?.result;
    final noteController =
        TextEditingController(text: existingObservation?.note ?? '');

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          return Container(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(ctx).viewInsets.bottom,
            ),
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
            ),
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Handle bar
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.grey[300],
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Title
                  Text(
                    'Évaluer: $exerciceCode',
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '$memberName — $exerciceDescription',
                    style: TextStyle(fontSize: 14, color: Colors.grey[600]),
                  ),
                  const SizedBox(height: 20),

                  // Status buttons
                  Text('Résultat',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Colors.grey[700])),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      _buildResultButton(
                          'acquis', 'Acquis', Colors.green, selectedResult,
                          (val) {
                        setSheetState(() => selectedResult = val);
                      }),
                      const SizedBox(width: 8),
                      _buildResultButton('en_progres', 'En progrès',
                          Colors.orange, selectedResult, (val) {
                        setSheetState(() => selectedResult = val);
                      }),
                      const SizedBox(width: 8),
                      _buildResultButton(
                          'a_revoir', 'À revoir', Colors.red, selectedResult,
                          (val) {
                        setSheetState(() => selectedResult = val);
                      }),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Note field
                  Text('Remarque',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Colors.grey[700])),
                  const SizedBox(height: 8),
                  TextField(
                    controller: noteController,
                    maxLines: 3,
                    decoration: InputDecoration(
                      hintText: 'Ajouter une remarque...',
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12)),
                      contentPadding: const EdgeInsets.all(12),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Save button
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: selectedResult == null
                          ? null
                          : () async {
                              final service = MemberObservationService();

                              if (existingObservation != null) {
                                // Update existing
                                await service.updateObservation(
                                  widget.clubId,
                                  existingObservation.id,
                                  {
                                    'result': selectedResult,
                                    'note': noteController.text.trim(),
                                    'updatedAt': DateTime.now(),
                                  },
                                );
                              } else {
                                // Create new observation
                                final participants = context
                                    .read<OperationProvider>()
                                    .selectedOperationParticipants;

                                final obs = MemberObservation(
                                  id: '',
                                  memberId: memberId,
                                  memberName: memberName,
                                  memberNiveau: '',
                                  contextType: operation.categorie == 'plongee'
                                      ? 'plongee'
                                      : 'piscine',
                                  contextId: operation.id,
                                  contextDate:
                                      operation.dateDebut ?? DateTime.now(),
                                  contextTitle: operation.titre,
                                  category: 'exercice_lifras',
                                  exerciceCode: exerciceCode,
                                  exerciceDescription: exerciceDescription,
                                  result: selectedResult,
                                  note: noteController.text.trim(),
                                  observerId: currentUserId,
                                  observerName: currentUserName,
                                  createdAt: DateTime.now(),
                                );
                                await service.addObservation(
                                    widget.clubId, obs);
                              }

                              if (mounted) Navigator.pop(ctx);
                            },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.teal,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                      child: Text(
                        existingObservation != null
                            ? 'Modifier'
                            : 'Enregistrer',
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildResultButton(String value, String label, Color color,
      String? selected, Function(String) onTap) {
    final isSelected = selected == value;
    return Expanded(
      child: GestureDetector(
        onTap: () => onTap(value),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: isSelected ? color.withOpacity(0.2) : Colors.grey[100],
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: isSelected ? color : Colors.grey[300]!,
              width: isSelected ? 2 : 1,
            ),
          ),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                color: isSelected ? color : Colors.grey[600],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Color _getObservationColor(String? result) {
    switch (result) {
      case 'acquis':
        return Colors.green;
      case 'en_progres':
        return Colors.orange;
      case 'a_revoir':
        return Colors.red;
      default:
        return Colors.teal; // No evaluation yet
    }
  }

  IconData _getObservationIcon(String? result) {
    switch (result) {
      case 'acquis':
        return Icons.check_circle;
      case 'en_progres':
        return Icons.timelapse;
      case 'a_revoir':
        return Icons.replay;
      default:
        return Icons.circle_outlined;
    }
  }
}

/// Dialog for selecting supplements during registration
class _SupplementSelectionDialog extends StatefulWidget {
  final String operationTitle;
  final List<Supplement> supplements;
  final double basePrice;

  const _SupplementSelectionDialog({
    required this.operationTitle,
    required this.supplements,
    required this.basePrice,
  });

  @override
  State<_SupplementSelectionDialog> createState() =>
      _SupplementSelectionDialogState();
}

class _SupplementSelectionDialogState
    extends State<_SupplementSelectionDialog> {
  final Set<String> _selectedIds = {};

  double get _supplementTotal {
    return widget.supplements
        .where((s) => _selectedIds.contains(s.id))
        .fold(0.0, (sum, s) => sum + s.price);
  }

  double get _totalPrice => widget.basePrice + _supplementTotal;

  List<SelectedSupplement> get _selectedSupplements {
    return widget.supplements
        .where((s) => _selectedIds.contains(s.id))
        .map((s) => SelectedSupplement(id: s.id, name: s.name, price: s.price))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Confirmer l\'inscription'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Voulez-vous vous inscrire à "${widget.operationTitle}" ?'),
            const SizedBox(height: 16),

            // Base price
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Prix de base:'),
                Text(
                  '${widget.basePrice.toStringAsFixed(2)} €',
                  style: const TextStyle(fontWeight: FontWeight.w500),
                ),
              ],
            ),

            const SizedBox(height: 16),
            const Divider(),
            const SizedBox(height: 8),

            // Supplements section
            const Text(
              'Suppléments optionnels:',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),

            // Supplement checkboxes
            ...widget.supplements.map((supplement) {
              final isSelected = _selectedIds.contains(supplement.id);
              return CheckboxListTile(
                value: isSelected,
                onChanged: (value) {
                  setState(() {
                    if (value == true) {
                      _selectedIds.add(supplement.id);
                    } else {
                      _selectedIds.remove(supplement.id);
                    }
                  });
                },
                title: Text(supplement.name),
                subtitle: Text('+${supplement.price.toStringAsFixed(2)} €'),
                dense: true,
                contentPadding: EdgeInsets.zero,
              );
            }),

            const SizedBox(height: 8),
            const Divider(),
            const SizedBox(height: 8),

            // Total
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Total:',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                Text(
                  '${_totalPrice.toStringAsFixed(2)} €',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Annuler'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(context, {
            'supplements': _selectedSupplements,
            'supplementTotal': _supplementTotal,
          }),
          child: const Text('S\'inscrire'),
        ),
      ],
    );
  }
}

/// Snapshot van de info die we per Membre cache-en voor de tile-leading
/// in `_buildInscribedMembersAccordion`. Houden we deliberately klein
/// (geen volledige Membre-doc) zodat de cache lichtgewicht blijft.
class _MemberInfo {
  final String? photoUrl;
  final String? plongeurCode;

  const _MemberInfo({this.photoUrl, this.plongeurCode});
}

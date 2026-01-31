import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
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
import '../../models/member_profile.dart';
import '../../models/exercice_lifras.dart';
import '../../models/participant_operation.dart';
import '../../models/event_message.dart';
import '../../models/supplement.dart';
import '../../widgets/participant_payment_card.dart';
import '../../widgets/scanner_modal_sheet.dart';
import 'add_guest_dialog.dart';
import 'package:intl/intl.dart';

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

class _OperationDetailScreenState extends State<OperationDetailScreen> with WidgetsBindingObserver {
  final ProfileService _profileService = ProfileService();
  final LifrasService _lifrasService = LifrasService();
  final OperationService _operationService = OperationService();

  MemberProfile? _userProfile;
  List<ExerciceLIFRAS> _availableExercices = [];
  List<String> _selectedExercices = [];
  bool _isLoadingExercices = false;
  ParticipantOperation? _userInscription;
  final TextEditingController _messageController = TextEditingController();
  bool _isDiscussionExpanded = false;

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
    _messageController.dispose();
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

    // Load user's inscription to get selected exercices
    _loadUserInscription();
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

    final niveau = NiveauLIFRASExtension.fromCode(_userProfile!.plongeurCode);
    if (niveau != null) {
      final exercices = await _lifrasService.getExercicesByNiveau(
        widget.clubId,
        niveau,
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
            selectedSupplements: result['supplements'] as List<SelectedSupplement>,
            supplementTotal: result['supplementTotal'] as double,
          );

          // Refresh participant list after registration
          await operationProvider.reloadParticipants(widget.clubId, widget.operationId);

          if (mounted) {
            await _loadUserInscription();

            // If there's a price, show payment options dialog
            if (totalPrice > 0 && _userInscription != null) {
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
          await operationProvider.reloadParticipants(widget.clubId, widget.operationId);

          if (mounted) {
            await _loadUserInscription();

            // If there's a price, show payment options dialog
            if (basePrice > 0 && _userInscription != null) {
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
                        Icon(Icons.schedule, size: 22, color: Colors.blueGrey.shade700),
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
      await operationProvider.reloadParticipants(widget.clubId, widget.operationId);
    } else if (payNow == false && mounted) {
      // Set status to qr_on_site (will pay at the event)
      await _operationService.updatePaymentStatus(
        clubId: widget.clubId,
        operationId: widget.operationId,
        participantId: participantId,
        status: 'qr_on_site',
      );
      // Refresh participant list to show updated payment status
      await operationProvider.reloadParticipants(widget.clubId, widget.operationId);
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
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
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
                    border: Border.all(color: AppColors.lichtblauw.withOpacity(0.3)),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.info_outline, size: 18, color: AppColors.middenblauw),
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
              content: Text('Configuration bancaire non trouvée. Veuillez configurer l\'IBAN dans CalyCompta.'),
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

      if (iban == null || iban.isEmpty || beneficiaryName == null || beneficiaryName.isEmpty) {
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

      final result = await showParticipantPaymentCard(
        context: context,
        participantFirstName: participant.membrePrenom ?? '',
        participantLastName: participant.membreNom ?? '',
        participantEmail: null, // Email not available on participant, QR code shown on screen
        amount: participant.totalPrix,
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
          // Refresh participant list
          await operationProvider.reloadParticipants(widget.clubId, widget.operationId);
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

    final userId = authProvider.currentUser?.uid ?? '';

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirmer la désinscription'),
        content: Text('Voulez-vous vous désinscrire de "${operationProvider.selectedOperation?.titre}" ?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Se désinscrire', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      try {
        await operationProvider.unregisterFromOperation(
          clubId: widget.clubId,
          operationId: widget.operationId,
          userId: userId,
        );

        // Refresh participant list after unregistration
        await operationProvider.reloadParticipants(widget.clubId, widget.operationId);

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Désinscription réussie'),
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
  }

  /// Check if current user can scan attendance
  bool get _canScan {
    if (_userProfile == null) {
      debugPrint('🔍 _canScan: profile is null');
      return false;
    }
    final result = PermissionHelper.canScan(_userProfile!.clubStatuten);
    debugPrint('🔍 _canScan: clubStatuten=${_userProfile!.clubStatuten}, result=$result');
    return result;
  }

  /// Check if current user can add guests (same permission as scan)
  bool get _canAddGuest => _canScan;

  /// Show dialog to add a guest to this operation
  Future<void> _showAddGuestDialog() async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => const AddGuestDialog(),
    );

    if (result != null && mounted) {
      final authProvider = context.read<AuthProvider>();
      final operationProvider = context.read<OperationProvider>();
      final operation = operationProvider.selectedOperation;

      if (operation == null) return;

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
        );

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Invité ${result['prenom']} ${result['nom']} ajouté'),
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
    );

    // Refresh participants list after closing scanner
    if (mounted) {
      _loadOperation();
    }
  }

  @override
  Widget build(BuildContext context) {
    // Check if this is a plongee event to hide scanner
    final operationProvider = context.watch<OperationProvider>();
    final operation = operationProvider.selectedOperation;
    final isPlongeeEvent = operation?.categorie == 'plongee';
    final showScanner = _canScan && !isPlongeeEvent;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text('Détail événement', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          // Scanner button for authorized users (only for non-plongee events)
          if (showScanner)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: IconButton(
                onPressed: _openScanner,
                iconSize: 40, // Larger but fits in app bar
                icon: const Icon(Icons.qr_code_scanner, color: Colors.white),
                tooltip: 'Scanner présence',
              ),
            ),
        ],
      ),
      body: Stack(
        children: [
          // Ocean background
          Positioned.fill(
            child: Image.asset(
              AppAssets.backgroundFull,
              fit: BoxFit.cover,
            ),
          ),
          // Content
          SafeArea(
            child: Consumer<OperationProvider>(
        builder: (context, operationProvider, child) {
          final operation = operationProvider.selectedOperation;

          if (operationProvider.isLoading || operation == null) {
            return const LoadingWidget(message: 'Chargement...');
          }

          final participantCount = operationProvider.getParticipantCount(operation.id);
          final isRegistered = operationProvider.isUserRegistered(operation.id);
          final isOpen = operation.statut == 'ouvert';
          final isFull = operation.capaciteMax != null && participantCount >= operation.capaciteMax!;
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
                child: SingleChildScrollView(
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

                      const SizedBox(height: 12),

                      // Prix + Niveau utilisateur
                      _buildPriceAndLevel(operation),

                      const SizedBox(height: 16),

                      // Description accordion
                      if (operation.description != null && operation.description!.isNotEmpty) ...[
                        _buildDescriptionAccordion(operation),
                        const SizedBox(height: 12),
                      ],

                      // 1. Communication accordion (message de l'organisateur)
                      if (operation.communication != null && operation.communication!.isNotEmpty) ...[
                        _buildCommunicationAccordion(operation),
                        const SizedBox(height: 12),
                      ],

                      // 2. Discussion accordion (chat entre participants)
                      _buildDiscussionAccordion(isRegistered),
                      // Input field OUTSIDE ExpansionTile for iOS compatibility
                      if (_isDiscussionExpanded && isRegistered)
                        _buildStandaloneMessageInput(),
                      const SizedBox(height: 12),

                      // 3. Inscribed members accordion (closed by default)
                      _buildInscribedMembersAccordion(operationProvider),
                      const SizedBox(height: 12),

                      // 4. Course selection (only if registered AND plongee event) - exercises last
                      if (isRegistered && operation.categorie == 'plongee') ...[
                        _buildCourseSelection(operationProvider),
                      ],
                    ],
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
        ],
      ),
    );
  }

  /// Compact header: Date + Lieu on same line
  Widget _buildCompactHeader(operation) {
    return Row(
      children: [
        // Date
        if (operation.dateDebut != null) ...[
          const Icon(Icons.calendar_today, size: 18, color: Colors.white70),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              DateFormatter.formatLong(operation.dateDebut!),
              style: const TextStyle(fontSize: 14, color: Colors.white),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],

        // Separator
        if (operation.dateDebut != null && operation.lieu != null) ...[
          const SizedBox(width: 16),
          const Text('|', style: TextStyle(color: Colors.white54)),
          const SizedBox(width: 16),
        ],

        // Lieu
        if (operation.lieu != null) ...[
          const Icon(Icons.location_on, size: 18, color: Colors.white70),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              operation.lieu!,
              style: const TextStyle(fontSize: 14, color: Colors.white),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ],
    );
  }

  /// Price + User's function and level (level only for plongee events)
  Widget _buildPriceAndLevel(operation) {
    final userLevel = _userProfile?.plongeurCode;
    final isPlongee = operation.categorie == 'plongee';

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
        // Prix (personnalisé selon fonction)
        if (displayPrice != null && displayPrice > 0) ...[
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
        ],

        // Separator (only show if both price and level are visible)
        if (displayPrice != null && displayPrice > 0 && userLevel != null && isPlongee) ...[
          const SizedBox(width: 16),
          const Text('|', style: TextStyle(color: Colors.white54)),
          const SizedBox(width: 16),
        ],

        // User level (only for plongee events)
        if (userLevel != null && isPlongee) ...[
          Icon(Icons.pool, size: 18, color: AppColors.lichtblauw),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              'Niveau: $userLevel',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.lichtblauw,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ],
    );
  }

  /// Description accordion with preview text
  Widget _buildDescriptionAccordion(operation) {
    final description = operation.description ?? '';
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
          title: Text(
            preview,
            style: TextStyle(
              fontSize: 14,
              color: AppColors.donkerblauw,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          children: [
            Container(
              width: double.infinity,
              color: Colors.white.withOpacity(0.95),
              padding: const EdgeInsets.all(16),
              child: Text(
                description,
                style: TextStyle(
                  fontSize: 14,
                  color: AppColors.donkerblauw,
                  height: 1.5,
                ),
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
              child: Text(
                operation.communication ?? '',
                style: TextStyle(
                  fontSize: 14,
                  color: AppColors.donkerblauw,
                  height: 1.5,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Discussion accordion (chat entre participants)
  Widget _buildDiscussionAccordion(bool isRegistered) {
    final messageProvider = context.watch<EventMessageProvider>();
    final authProvider = context.read<AuthProvider>();
    final operationProvider = context.read<OperationProvider>();
    final currentUserId = authProvider.currentUser?.uid ?? '';
    final totalParticipants = operationProvider.selectedOperationParticipants.length;

    return StreamBuilder<List<EventMessage>>(
      stream: messageProvider.watchMessages(widget.clubId, widget.operationId),
      builder: (context, snapshot) {
        final messages = snapshot.data ?? [];
        final messageCount = messages.length;

        return Container(
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.lichtblauw.withOpacity(0.5)),
            borderRadius: BorderRadius.circular(12),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: ExpansionTile(
              initiallyExpanded: _isDiscussionExpanded,
              onExpansionChanged: (expanded) {
                setState(() {
                  _isDiscussionExpanded = expanded;
                });
                // Mark messages as read when opening discussion
                if (expanded && currentUserId.isNotEmpty) {
                  messageProvider.markAsRead(
                    clubId: widget.clubId,
                    operationId: widget.operationId,
                    userId: currentUserId,
                  );
                }
              },
              backgroundColor: AppColors.lichtblauw.withOpacity(0.2),
              collapsedBackgroundColor: Colors.white.withOpacity(0.9),
              tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              leading: Icon(Icons.chat, color: AppColors.middenblauw),
              title: Text(
                'Discussion',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: AppColors.donkerblauw,
                ),
              ),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (messageCount > 0)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      margin: const EdgeInsets.only(right: 8),
                      decoration: BoxDecoration(
                        color: AppColors.lichtblauw.withOpacity(0.5),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        '$messageCount',
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
                // Messages list only - input is outside ExpansionTile
                Container(
                  color: Colors.white,
                  height: 250,
                  child: Builder(
                    builder: (context) {
                      if (snapshot.connectionState == ConnectionState.waiting) {
                        return const Center(child: CircularProgressIndicator());
                      }

                      if (snapshot.hasError) {
                        return Center(
                          child: Text('Erreur: ${snapshot.error}', style: const TextStyle(color: Colors.red)),
                        );
                      }

                      if (messages.isEmpty) {
                        return Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.chat_bubble_outline, size: 48, color: Colors.grey[400]),
                              const SizedBox(height: 8),
                              Text(
                                'Aucun message',
                                style: TextStyle(color: Colors.grey[600]),
                              ),
                            ],
                          ),
                        );
                      }

                      // Use reverse: true to auto-scroll to bottom (like WhatsApp)
                      return ListView.builder(
                        padding: const EdgeInsets.all(12),
                        reverse: true,
                        itemCount: messages.length,
                        itemBuilder: (context, index) {
                          // Since list is reversed, access messages from the end
                          final message = messages[messages.length - 1 - index];
                          final isOwnMessage = message.senderId == currentUserId;
                          return _buildMessageBubble(message, isOwnMessage, totalParticipants);
                        },
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  /// Info message for non-registered users in discussion
  Widget _buildDiscussionInfoForNonRegistered() {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          Icon(Icons.info_outline, color: Colors.grey[600], size: 18),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'Inscrivez-vous pour participer à la discussion',
              style: TextStyle(fontSize: 13, color: Colors.grey),
            ),
          ),
        ],
      ),
    );
  }

  /// Standalone message input - OUTSIDE ExpansionTile for iOS compatibility
  Widget _buildStandaloneMessageInput() {
    final messageProvider = context.watch<EventMessageProvider>();
    final authProvider = context.read<AuthProvider>();
    final currentUserId = authProvider.currentUser?.uid ?? '';
    final displayName = authProvider.displayName ?? 'Membre';

    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[300]!),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _messageController,
              decoration: InputDecoration(
                hintText: 'Votre message...',
                filled: true,
                fillColor: Colors.grey[100],
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              ),
              textInputAction: TextInputAction.send,
              onSubmitted: (text) => _sendDiscussionMessage(messageProvider, currentUserId, displayName, text),
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            onPressed: () {
              final text = _messageController.text.trim();
              if (text.isNotEmpty) {
                _sendDiscussionMessage(messageProvider, currentUserId, displayName, text);
              }
            },
            icon: const Icon(Icons.send),
            color: AppColors.middenblauw,
          ),
        ],
      ),
    );
  }

  /// Send message helper
  Future<void> _sendDiscussionMessage(
    EventMessageProvider messageProvider,
    String userId,
    String displayName,
    String text,
  ) async {
    if (text.trim().isEmpty) return;

    try {
      await messageProvider.sendMessage(
        clubId: widget.clubId,
        operationId: widget.operationId,
        senderId: userId,
        senderName: displayName,
        message: text.trim(),
      );
      _messageController.clear();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  /// Message bubble for chat - compact style with time on the right
  Widget _buildMessageBubble(EventMessage message, bool isOwnMessage, int totalParticipants) {
    final dateFormat = DateFormat('HH:mm');

    // Check if all participants (except sender) have read the message
    // readBy includes sender, so we compare with totalParticipants
    final readByAll = isOwnMessage && message.readBy.length >= totalParticipants && totalParticipants > 1;

    return Align(
      alignment: isOwnMessage ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 4),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
        decoration: BoxDecoration(
          color: isOwnMessage ? AppColors.lichtblauw.withOpacity(0.4) : Colors.grey[200],
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Flexible(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (!isOwnMessage)
                    Text(
                      message.senderName,
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.donkerblauw),
                    ),
                  Text(message.message, style: const TextStyle(fontSize: 14)),
                ],
              ),
            ),
            const SizedBox(width: 6),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  dateFormat.format(message.createdAt),
                  style: TextStyle(fontSize: 9, color: Colors.grey[500]),
                ),
                if (isOwnMessage) ...[
                  const SizedBox(width: 2),
                  Icon(
                    Icons.done_all,
                    size: 14,
                    color: readByAll ? Colors.green : Colors.grey[400],
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Inscribed members accordion (closed by default)
  Widget _buildInscribedMembersAccordion(OperationProvider operationProvider) {
    final participants = operationProvider.selectedOperationParticipants;
    final authProvider = context.read<AuthProvider>();
    final currentUserId = authProvider.currentUser?.uid ?? '';
    // For plongee events, hide present indicator (no attendance tracking)
    final isPlongeeEvent = operationProvider.selectedOperation?.categorie == 'plongee';

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
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
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
                        final isCurrentUser = participant.membreId == currentUserId;
                        final isGuest = participant.isGuest;

                        final isPresent = participant.present ?? false;
                        // Organizer can tap on unpaid participants to show payment QR
                        final canShowPaymentCard = _canAddGuest && !participant.paye && participant.totalPrix > 0;
                        // Get payment status info for subtitle
                        final paymentInfo = _getPaymentStatusInfo(participant.paymentStatusCategory);

                        return ListTile(
                          onTap: canShowPaymentCard
                              ? () => _showParticipantPaymentCard(
                                    participant: participant,
                                    operation: operationProvider.selectedOperation!,
                                  )
                              : null,
                          leading: CircleAvatar(
                            backgroundColor: isGuest
                                ? AppColors.oranje.withOpacity(0.3)
                                : (isCurrentUser ? AppColors.lichtblauw.withOpacity(0.5) : AppColors.lichtblauw.withOpacity(0.3)),
                            radius: 20,
                            child: isGuest
                                ? Icon(Icons.person_outline, size: 20, color: AppColors.oranje)
                                : Text(
                                    prenom.isNotEmpty ? prenom[0].toUpperCase() : (displayNom.isNotEmpty ? displayNom[0].toUpperCase() : '?'),
                                    style: TextStyle(
                                      color: isCurrentUser ? AppColors.donkerblauw : AppColors.middenblauw,
                                      fontWeight: FontWeight.bold,
                                      fontSize: 16,
                                    ),
                                  ),
                          ),
                          title: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  displayName,
                                  style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 15),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              // Guest badge
                              if (isGuest) ...[
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
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
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: AppColors.lichtblauw.withOpacity(0.3),
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
                              // Payment status text
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
                                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                              decoration: BoxDecoration(
                                                color: AppColors.oranje.withOpacity(0.15),
                                                borderRadius: BorderRadius.circular(4),
                                              ),
                                              child: Text(
                                                '${s.name}: ${s.price.toStringAsFixed(2)} €',
                                                style: TextStyle(
                                                  fontSize: 11,
                                                  color: AppColors.oranje.withOpacity(0.9),
                                                ),
                                              ),
                                            ))
                                        .toList(),
                                  ),
                                ),
                            ],
                          ),
                          trailing: _buildPaymentBadge(participant),
                        );
                      }).toList(),
                    ),
            ),
          ],
        ),
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
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 4,
            offset: const Offset(0, -2),
          ),
        ],
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

            // Register/Unregister button
            _buildActionButton(
              isRegistered: isRegistered,
              canRegister: canRegister,
              isOpen: isOpen,
              isFull: isFull,
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

  Widget _buildActionButton({
    required bool isRegistered,
    required bool canRegister,
    required bool isOpen,
    required bool isFull,
  }) {
    if (isRegistered) {
      return SizedBox(
        width: double.infinity,
        height: 50,
        child: ElevatedButton.icon(
          onPressed: _handleUnregister,
          icon: const Icon(Icons.cancel, color: Colors.white),
          label: const Text('Se désinscrire', style: TextStyle(fontSize: 16, color: Colors.white)),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.red,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
      );
    }

    if (!isOpen) {
      return SizedBox(
        width: double.infinity,
        height: 50,
        child: ElevatedButton(
          onPressed: null,
          style: ElevatedButton.styleFrom(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: const Text('Événement fermé', style: TextStyle(fontSize: 16)),
        ),
      );
    }

    if (isFull) {
      return SizedBox(
        width: double.infinity,
        height: 50,
        child: ElevatedButton(
          onPressed: null,
          style: ElevatedButton.styleFrom(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: const Text('Événement complet', style: TextStyle(fontSize: 16)),
        ),
      );
    }

    return SizedBox(
      width: double.infinity,
      height: 50,
      child: ElevatedButton.icon(
        onPressed: _handleRegister,
        icon: const Icon(Icons.check_circle, color: Colors.white),
        label: const Text('S\'inscrire', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.middenblauw,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
    );
  }

  /// Course selection with accordion/dropdown for LIFRAS exercises
  Widget _buildCourseSelection(OperationProvider operationProvider) {
    final userLevel = _userProfile?.plongeurCode;
    final participants = operationProvider.selectedOperationParticipants;
    // Count participants who have selected at least one exercise
    final participantsWithExercises = participants.where((p) => p.exercices.isNotEmpty).length;

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
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
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
                        onPressed: _selectedExercices.isNotEmpty ? _saveExercices : null,
                        icon: const Icon(Icons.save, size: 18),
                        label: Text(
                          _selectedExercices.isEmpty
                              ? 'Sélectionnez des exercices'
                              : 'Enregistrer (${_selectedExercices.length})',
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.blue,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
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
  State<_SupplementSelectionDialog> createState() => _SupplementSelectionDialogState();
}

class _SupplementSelectionDialogState extends State<_SupplementSelectionDialog> {
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

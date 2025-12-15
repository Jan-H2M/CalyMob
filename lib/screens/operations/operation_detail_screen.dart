import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../../providers/operation_provider.dart';
import '../../providers/payment_provider.dart';
import '../../providers/event_message_provider.dart';
import '../../widgets/loading_widget.dart';
import '../../utils/date_formatter.dart';
import '../../utils/currency_formatter.dart';
import '../../utils/tariff_utils.dart';
import '../../services/profile_service.dart';
import '../../services/lifras_service.dart';
import '../../services/operation_service.dart';
import '../../models/member_profile.dart';
import '../../models/exercice_lifras.dart';
import '../../models/participant_operation.dart';
import '../../models/payment_response.dart';
import '../../models/event_message.dart';
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

class _OperationDetailScreenState extends State<OperationDetailScreen> {
  final ProfileService _profileService = ProfileService();
  final LifrasService _lifrasService = LifrasService();
  final OperationService _operationService = OperationService();

  MemberProfile? _userProfile;
  List<ExerciceLIFRAS> _availableExercices = [];
  List<String> _selectedExercices = [];
  bool _isLoadingExercices = false;
  ParticipantOperation? _userInscription;
  bool _isPaymentProcessing = false;
  final TextEditingController _messageController = TextEditingController();

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
    final operationProvider = context.read<OperationProvider>();

    final userId = authProvider.currentUser?.uid ?? '';
    final userEmail = authProvider.currentUser?.email ?? '';

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirmer l\'inscription'),
        content: Text('Voulez-vous vous inscrire à "${operationProvider.selectedOperation?.titre}" ?'),
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

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Inscription réussie !'),
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

  /// Handle payment button press
  Future<void> _handlePayment(double amount) async {
    if (_userInscription == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Inscription non trouvée'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    final operationProvider = context.read<OperationProvider>();
    final paymentProvider = context.read<PaymentProvider>();
    final operation = operationProvider.selectedOperation;

    if (operation == null) return;

    setState(() {
      _isPaymentProcessing = true;
    });

    try {
      // Create payment request via Ponto
      final paymentUrl = await paymentProvider.createPayment(
        clubId: widget.clubId,
        operationId: widget.operationId,
        participantId: _userInscription!.id,
        amount: amount,
        description: 'Inscription: ${operation.titre}',
      );

      if (paymentUrl != null && paymentUrl.isNotEmpty) {
        // Open Ponto payment page in browser
        final uri = Uri.parse(paymentUrl);
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);

          // Show dialog to start polling after user returns
          if (mounted) {
            _showPaymentStatusDialog(paymentProvider.currentPaymentId!);
          }
        } else {
          throw Exception('Impossible d\'ouvrir la page de paiement');
        }
      } else {
        // No payment URL - show error
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(paymentProvider.errorMessage ?? 'Erreur lors de la création du paiement'),
              backgroundColor: Colors.red,
            ),
          );
        }
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
    } finally {
      if (mounted) {
        setState(() {
          _isPaymentProcessing = false;
        });
      }
    }
  }

  /// Show dialog to check payment status after user returns from payment page
  void _showPaymentStatusDialog(String paymentId) {
    final paymentProvider = context.read<PaymentProvider>();

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Vérification du paiement'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            const Text('Vérification du statut de votre paiement...'),
            const SizedBox(height: 8),
            Text(
              'Cela peut prendre quelques instants.',
              style: TextStyle(fontSize: 12, color: Colors.grey[600]),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              paymentProvider.stopPaymentStatusPolling();
              Navigator.pop(dialogContext);
            },
            child: const Text('Annuler'),
          ),
        ],
      ),
    );

    // Start polling for payment status
    paymentProvider.startPaymentStatusPolling(
      clubId: widget.clubId,
      operationId: widget.operationId,
      participantId: _userInscription!.id,
      paymentId: paymentId,
      onStatusUpdate: (PaymentStatus status) {
        if (status.isCompleted || status.paye) {
          // Payment successful!
          Navigator.pop(context); // Close dialog
          _onPaymentSuccess();
        } else if (status.isFailed || status.isCancelled) {
          // Payment failed
          Navigator.pop(context); // Close dialog
          _onPaymentFailed(status.failureReason);
        }
        // If still pending, continue polling
      },
    );
  }

  void _onPaymentSuccess() {
    // Reload inscription to get updated payment status
    _loadUserInscription();
    _loadOperation();

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Paiement réussi ! Merci.'),
        backgroundColor: Colors.green,
        duration: Duration(seconds: 3),
      ),
    );
  }

  void _onPaymentFailed(String? reason) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(reason ?? 'Le paiement a échoué. Veuillez réessayer.'),
        backgroundColor: Colors.red,
        duration: const Duration(seconds: 4),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text('Détail événement', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
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
          // If inscribed, use the stored price; otherwise calculate from tariffs
          double inscriptionPrice;
          if (userInscription != null) {
            // Use the price stored in the inscription
            inscriptionPrice = userInscription.prix;
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

                      // Description
                      if (operation.description != null && operation.description!.isNotEmpty) ...[
                        Text(
                          operation.description!,
                          style: const TextStyle(
                            fontSize: 15,
                            color: Colors.white70,
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // 1. Communication accordion (message de l'organisateur)
                      if (operation.communication != null && operation.communication!.isNotEmpty) ...[
                        _buildCommunicationAccordion(operation),
                        const SizedBox(height: 12),
                      ],

                      // 2. Discussion accordion (chat entre participants)
                      _buildDiscussionAccordion(isRegistered),
                      const SizedBox(height: 12),

                      // 3. Inscribed members accordion (closed by default)
                      _buildInscribedMembersAccordion(operationProvider),
                      const SizedBox(height: 12),

                      // 4. Course selection (only if registered) - exercises last
                      if (isRegistered) ...[
                        _buildCourseSelection(),
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
          Text(
            DateFormatter.formatLong(operation.dateDebut!),
            style: const TextStyle(fontSize: 14, color: Colors.white),
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
          Expanded(
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

  /// Price + User's function and level
  Widget _buildPriceAndLevel(operation) {
    final userLevel = _userProfile?.plongeurCode;

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
          Text(
            CurrencyFormatter.format(displayPrice),
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: Colors.white,
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
              ),
            ),
          ],
        ],

        // Separator
        if (displayPrice != null && displayPrice > 0 && userLevel != null) ...[
          const SizedBox(width: 16),
          const Text('|', style: TextStyle(color: Colors.white54)),
          const SizedBox(width: 16),
        ],

        // User level
        if (userLevel != null) ...[
          Icon(Icons.pool, size: 18, color: AppColors.lichtblauw),
          const SizedBox(width: 6),
          Text(
            'Niveau: $userLevel',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppColors.lichtblauw,
            ),
          ),
        ],
      ],
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
          subtitle: Text(
            'Message de l\'organisateur',
            style: TextStyle(
              fontSize: 13,
              color: AppColors.middenblauw,
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
    final currentUserId = authProvider.currentUser?.uid ?? '';
    final displayName = authProvider.displayName ?? 'Membre';

    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.lichtblauw.withOpacity(0.5)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: ExpansionTile(
          initiallyExpanded: false,
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
          subtitle: Text(
            isRegistered ? 'Discutez avec les participants' : 'Inscrivez-vous pour participer',
            style: TextStyle(
              fontSize: 13,
              color: AppColors.middenblauw,
            ),
          ),
          children: [
            Container(
              color: Colors.white,
              height: 300, // Fixed height for chat
              child: StreamBuilder<List<EventMessage>>(
                stream: messageProvider.watchMessages(widget.clubId, widget.operationId),
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }

                  if (snapshot.hasError) {
                    return Center(
                      child: Text('Erreur: ${snapshot.error}', style: const TextStyle(color: Colors.red)),
                    );
                  }

                  final messages = snapshot.data ?? [];

                  return Column(
                    children: [
                      // Messages list
                      Expanded(
                        child: messages.isEmpty
                            ? Center(
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
                              )
                            : ListView.builder(
                                padding: const EdgeInsets.all(12),
                                itemCount: messages.length,
                                itemBuilder: (context, index) {
                                  final message = messages[index];
                                  final isOwnMessage = message.senderId == currentUserId;
                                  return _buildMessageBubble(message, isOwnMessage);
                                },
                              ),
                      ),

                      // Input field (only if registered)
                      if (isRegistered)
                        _buildMessageInputField(messageProvider, currentUserId, displayName)
                      else
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.grey[100],
                            border: Border(top: BorderSide(color: Colors.grey[300]!)),
                          ),
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
                        ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Message bubble for chat
  Widget _buildMessageBubble(EventMessage message, bool isOwnMessage) {
    final dateFormat = DateFormat('HH:mm');

    return Align(
      alignment: isOwnMessage ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.65),
        decoration: BoxDecoration(
          color: isOwnMessage ? AppColors.lichtblauw.withOpacity(0.4) : Colors.grey[200],
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!isOwnMessage)
              Text(
                message.senderName,
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
              ),
            Text(message.message, style: const TextStyle(fontSize: 14)),
            const SizedBox(height: 2),
            Text(
              dateFormat.format(message.createdAt),
              style: TextStyle(fontSize: 10, color: Colors.grey[600]),
            ),
          ],
        ),
      ),
    );
  }

  /// Message input field
  Widget _buildMessageInputField(EventMessageProvider messageProvider, String userId, String displayName) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Colors.grey[300]!)),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _messageController,
              decoration: InputDecoration(
                hintText: 'Votre message...',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: BorderSide(color: Colors.grey[300]!),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                isDense: true,
              ),
              textInputAction: TextInputAction.send,
              onSubmitted: (text) async {
                if (text.trim().isNotEmpty) {
                  await messageProvider.sendMessage(
                    clubId: widget.clubId,
                    operationId: widget.operationId,
                    senderId: userId,
                    senderName: displayName,
                    message: text.trim(),
                  );
                  _messageController.clear();
                }
              },
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            onPressed: () async {
              final text = _messageController.text.trim();
              if (text.isNotEmpty) {
                await messageProvider.sendMessage(
                  clubId: widget.clubId,
                  operationId: widget.operationId,
                  senderId: userId,
                  senderName: displayName,
                  message: text,
                );
                _messageController.clear();
              }
            },
            icon: const Icon(Icons.send),
            color: AppColors.middenblauw,
          ),
        ],
      ),
    );
  }

  /// Inscribed members accordion (closed by default)
  Widget _buildInscribedMembersAccordion(OperationProvider operationProvider) {
    final participants = operationProvider.selectedOperationParticipants;
    final authProvider = context.read<AuthProvider>();
    final currentUserId = authProvider.currentUser?.uid ?? '';

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
          subtitle: Text(
            '${participants.length} inscrit(s)',
            style: TextStyle(
              fontSize: 13,
              color: AppColors.middenblauw,
            ),
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
                        final displayName = prenom.isNotEmpty
                            ? '$prenom $nom'.trim()
                            : (nom.isNotEmpty ? nom : 'Anonyme');
                        final isCurrentUser = participant.membreId == currentUserId;

                        return ListTile(
                          leading: CircleAvatar(
                            backgroundColor: isCurrentUser ? AppColors.lichtblauw.withOpacity(0.5) : AppColors.lichtblauw.withOpacity(0.3),
                            radius: 18,
                            child: Text(
                              prenom.isNotEmpty ? prenom[0].toUpperCase() : (nom.isNotEmpty ? nom[0].toUpperCase() : '?'),
                              style: TextStyle(
                                color: isCurrentUser ? AppColors.donkerblauw : AppColors.middenblauw,
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                              ),
                            ),
                          ),
                          title: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  displayName,
                                  style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              if (isCurrentUser) ...[
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
                          trailing: _buildPaymentBadge(participant.paye),
                          dense: true,
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
            // Payment button - show if registered AND not paid yet AND price > 0
            if (isRegistered && !isPaid && inscriptionPrice > 0) ...[
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton.icon(
                  onPressed: _isPaymentProcessing
                      ? null
                      : () => _handlePayment(inscriptionPrice),
                  icon: _isPaymentProcessing
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.payment, color: Colors.white),
                  label: Text(
                    _isPaymentProcessing
                        ? 'Traitement...'
                        : 'Payer ${CurrencyFormatter.format(inscriptionPrice)}',
                    style: const TextStyle(fontSize: 16, color: Colors.white),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.blue,
                    disabledBackgroundColor: Colors.blue.shade300,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],

            // Show "Paid" badge if already paid
            if (isRegistered && isPaid) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.green.shade100,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.check_circle, color: Colors.green.shade700, size: 20),
                    const SizedBox(width: 8),
                    Text(
                      'Inscription payée',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: Colors.green.shade700,
                      ),
                    ),
                  ],
                ),
              ),
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
  Widget _buildCourseSelection() {
    final userLevel = _userProfile?.plongeurCode;

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
          subtitle: Text(
            _selectedExercices.isEmpty
                ? '${_availableExercices.length} exercice(s) disponible(s)'
                : '${_selectedExercices.length} exercice(s) sélectionné(s)',
            style: TextStyle(
              fontSize: 13,
              color: _selectedExercices.isEmpty ? Colors.grey[600] : Colors.blue[700],
            ),
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (userLevel != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  margin: const EdgeInsets.only(right: 8),
                  decoration: BoxDecoration(
                    color: Colors.blue.shade100,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    userLevel,
                    style: TextStyle(
                      fontSize: 12,
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

  Widget _buildPaymentBadge(bool paye) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: paye ? Colors.green.shade100 : Colors.orange.shade100,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            paye ? Icons.check_circle : Icons.pending,
            size: 14,
            color: paye ? Colors.green : Colors.orange,
          ),
          const SizedBox(width: 4),
          Text(
            paye ? 'Payé' : 'En attente',
            style: TextStyle(
              fontSize: 12,
              color: paye ? Colors.green : Colors.orange,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../providers/auth_provider.dart';
import '../../providers/operation_provider.dart';
import '../../providers/payment_provider.dart';
import '../../providers/event_message_provider.dart';
import '../../services/operation_service.dart';
import '../../services/lifras_service.dart';
import '../../services/member_service.dart';
import '../../models/participant_operation.dart';
import '../../models/exercice_lifras.dart';
import '../../models/event_message.dart';
import '../../widgets/loading_widget.dart';
import '../../widgets/exercise_selection_dialog.dart';
import '../../widgets/event_discussion_tab.dart';
import '../../utils/date_formatter.dart';
import '../../utils/currency_formatter.dart';
import '../../utils/pricing_calculator.dart';

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
  String? _memberFunction;
  double? _calculatedPrice;
  ParticipantOperation? _userParticipation;
  List<ParticipantOperation> _participants = [];
  bool _isLoadingParticipants = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadOperation();
      _loadParticipants();
    });
  }

  Future<void> _loadOperation() async {
    final authProvider = context.read<AuthProvider>();
    final userId = authProvider.currentUser?.uid ?? '';

    await context.read<OperationProvider>().selectOperation(
          widget.clubId,
          widget.operationId,
          userId,
        );

    // Charger infos membre et calculer prix
    await _loadMemberPricing(userId);

    // Charger l'inscription de l'utilisateur
    await _loadUserParticipation(userId);
  }

  Future<void> _loadUserParticipation(String userId) async {
    try {
      final operationService = OperationService();
      final participation = await operationService.getUserParticipation(
        widget.clubId,
        widget.operationId,
        userId,
      );

      setState(() {
        _userParticipation = participation;
      });
    } catch (e) {
      debugPrint('❌ Erreur chargement participation: $e');
    }
  }

  Future<void> _loadMemberPricing(String userId) async {
    final operationProvider = context.read<OperationProvider>();
    final operation = operationProvider.selectedOperation;

    if (operation == null) return;

    try {
      // Charger infos membre
      final operationService = OperationService();
      final memberInfo = await operationService.getMemberInfo(widget.clubId, userId);
      final clubStatuten = memberInfo['clubStatuten'] as List<dynamic>?;
      final clubStatutenStrings = clubStatuten?.cast<String>();

      // Calculer fonction et prix
      final function = PricingCalculator.determineMemberFunction(clubStatutenStrings);
      final price = PricingCalculator.calculatePrice(operation, function);

      setState(() {
        _memberFunction = function;
        _calculatedPrice = price;
      });
    } catch (e) {
      debugPrint('❌ Erreur chargement pricing: $e');
    }
  }

  Future<void> _loadParticipants() async {
    setState(() {
      _isLoadingParticipants = true;
    });

    try {
      final operationService = OperationService();
      final participants = await operationService.getParticipants(
        widget.clubId,
        widget.operationId,
      );

      setState(() {
        _participants = participants;
        _isLoadingParticipants = false;
      });

      debugPrint('👥 ${participants.length} participants chargés');
    } catch (e) {
      debugPrint('❌ Erreur chargement participants: $e');
      setState(() {
        _isLoadingParticipants = false;
      });
    }
  }

  Future<void> _handleRegister() async {
    final authProvider = context.read<AuthProvider>();
    final operationProvider = context.read<OperationProvider>();

    final userId = authProvider.currentUser?.uid ?? '';
    final userEmail = authProvider.currentUser?.email ?? '';

    // Step 1: Load member's niveau and available exercises
    List<String>? selectedExerciseIds;

    try {
      // Show loading dialog
      if (!mounted) return;
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => const Center(
          child: CircularProgressIndicator(),
        ),
      );

      // Fetch member niveau
      final memberService = MemberService();
      final niveau = await memberService.getMemberNiveau(widget.clubId, userId);

      // Fetch exercises for member's niveau (EXACT level only)
      final lifrasService = LifrasService();
      final availableExercises = niveau != null
          ? await lifrasService.getExercicesByNiveau(widget.clubId, niveau)
          : <ExerciceLIFRAS>[];

      // Close loading dialog
      if (mounted) Navigator.pop(context);

      // Step 2: Show exercise selection dialog if exercises available
      if (availableExercises.isNotEmpty && mounted) {
        selectedExerciseIds = await showDialog<List<String>>(
          context: context,
          builder: (context) => ExerciseSelectionDialog(
            exercises: availableExercises,
            memberNiveau: niveau,
            initialSelection: const [],
          ),
        );

        // User cancelled exercise selection
        if (selectedExerciseIds == null) return;
      } else {
        // No exercises available, continue without selection
        selectedExerciseIds = [];

        // Optionally show info message if no niveau
        if (niveau == null && mounted) {
          await showDialog(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('Information'),
              content: const Text(
                'Votre niveau de plongée n\'est pas défini.\n\n'
                'Vous pouvez vous inscrire sans exercices. '
                'Contactez un administrateur pour définir votre niveau.',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('OK'),
                ),
              ],
            ),
          );
        }
      }
    } catch (e) {
      // Close loading dialog if open
      if (mounted && Navigator.canPop(context)) {
        Navigator.pop(context);
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('❌ Erreur chargement exercices: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
      return;
    }

    // Step 3: Confirm registration
    if (!mounted) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirmer l\'inscription'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Voulez-vous vous inscrire à "${operationProvider.selectedOperation?.titre}" ?'),
            if (selectedExerciseIds != null && selectedExerciseIds.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                'Avec ${selectedExerciseIds.length} exercice${selectedExerciseIds.length > 1 ? 's' : ''}',
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  color: Colors.blue,
                ),
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
          exercicesLifras: selectedExerciseIds,
        );

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                selectedExerciseIds != null && selectedExerciseIds.isNotEmpty
                    ? '✅ Inscription réussie avec ${selectedExerciseIds.length} exercice${selectedExerciseIds.length > 1 ? 's' : ''} !'
                    : '✅ Inscription réussie !',
              ),
              backgroundColor: Colors.green,
            ),
          );
          // Recharger la liste des participants
          _loadParticipants();
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
              content: Text('✅ Désinscription réussie'),
              backgroundColor: Colors.orange,
            ),
          );
          // Recharger la liste des participants
          _loadParticipants();
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Détail événement', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.blue,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Consumer<OperationProvider>(
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
                        ),
                      ),

                      const SizedBox(height: 12),

                      // Info compacte sur une ligne (Date, Lieu, Prix)
                      Wrap(
                        spacing: 12,
                        runSpacing: 8,
                        children: [
                          // Date
                          if (operation.dateDebut != null)
                            _buildCompactInfoChip(
                              Icons.calendar_today,
                              DateFormatter.formatShort(operation.dateDebut!),
                            ),

                          // Lieu
                          if (operation.lieu != null)
                            _buildCompactInfoChip(
                              Icons.location_on,
                              operation.lieu!,
                            ),

                          // Prix
                          if (_calculatedPrice != null)
                            _buildCompactInfoChip(
                              Icons.euro,
                              CurrencyFormatter.format(_calculatedPrice!),
                            )
                          else if (operation.prixMembre != null)
                            _buildCompactInfoChip(
                              Icons.euro,
                              CurrencyFormatter.format(operation.prixMembre!),
                            ),

                          // Capacité
                          if (operation.capaciteMax != null)
                            _buildCompactInfoChip(
                              Icons.people,
                              '$participantCount / ${operation.capaciteMax}',
                            ),
                        ],
                      ),

                      const SizedBox(height: 12),

                      // Description
                      if (operation.description != null) ...[
                        const Text(
                          'Description',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          operation.description!,
                          style: const TextStyle(fontSize: 16),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // Liste des participants (accordéon)
                      _buildParticipantsList(participantCount),

                      // Discussion (accordéon) - Participants uniquement
                      if (isRegistered)
                        _buildDiscussionAccordion(),
                    ],
                  ),
                ),
              ),

              // Section paiement (si inscrit)
              if (isRegistered && _userParticipation != null)
                _buildPaymentSection(_userParticipation!),

              // Section exercices LIFRAS (si inscrit)
              if (isRegistered && _userParticipation != null)
                _buildExercisesSection(_userParticipation!),

              // Bouton action
              Container(
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
                  child: _buildActionButton(
                    isRegistered: isRegistered,
                    canRegister: canRegister,
                    isOpen: isOpen,
                    isFull: isFull,
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildInfoTile(IconData icon, String title, String value, {String? subtitle}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: Colors.blue),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey[600],
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey[600],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildParticipantsList(int participantCount) {
    if (_isLoadingParticipants) {
      return Card(
        margin: const EdgeInsets.only(bottom: 16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              const SizedBox(width: 16),
              Text(
                'Chargement des participants...',
                style: TextStyle(color: Colors.grey[600]),
              ),
            ],
          ),
        ),
      );
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: ExpansionTile(
        leading: const Icon(Icons.people, color: Colors.blue),
        title: Text(
          'Participants inscrits',
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
        subtitle: Text(
          '$participantCount ${participantCount > 1 ? "personnes inscrites" : "personne inscrite"}',
          style: TextStyle(
            fontSize: 14,
            color: Colors.grey[600],
          ),
        ),
        children: [
          if (_participants.isEmpty)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                'Aucun participant pour le moment',
                style: TextStyle(
                  color: Colors.grey[600],
                  fontStyle: FontStyle.italic,
                ),
              ),
            )
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _participants.length,
              separatorBuilder: (context, index) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final participant = _participants[index];
                // Construire le nom complet: prenom + nom
                final prenom = participant.membrePrenom ?? '';
                final nom = participant.membreNom ?? '';
                final displayName = '$prenom $nom'.trim().isNotEmpty
                    ? '$prenom $nom'.trim()
                    : 'Participant ${index + 1}';

                final hasExercises = participant.exercicesLifras != null &&
                    participant.exercicesLifras!.isNotEmpty;

                // Si pas d'exercices, afficher un ListTile simple
                if (!hasExercises) {
                  return ListTile(
                    dense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    leading: CircleAvatar(
                      backgroundColor: Colors.blue.shade100,
                      radius: 16,
                      child: Text(
                        displayName.isNotEmpty ? displayName[0].toUpperCase() : '?',
                        style: TextStyle(
                          color: Colors.blue.shade900,
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                    ),
                    title: Text(
                      displayName,
                      style: const TextStyle(fontSize: 14),
                    ),
                    trailing: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: participant.paye ? Colors.green.shade50 : Colors.orange.shade50,
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(
                          color: participant.paye ? Colors.green.shade300 : Colors.orange.shade300,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            participant.paye ? Icons.check_circle : Icons.pending,
                            size: 12,
                            color: participant.paye ? Colors.green.shade700 : Colors.orange.shade700,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            participant.paye ? 'Payé' : 'Non payé',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: participant.paye ? Colors.green.shade700 : Colors.orange.shade700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }

                // Si exercices, afficher un ExpansionTile
                return ExpansionTile(
                  tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 0),
                  childrenPadding: const EdgeInsets.only(left: 56, right: 16, bottom: 12),
                  leading: CircleAvatar(
                    backgroundColor: Colors.blue.shade100,
                    radius: 16,
                    child: Text(
                      displayName.isNotEmpty ? displayName[0].toUpperCase() : '?',
                      style: TextStyle(
                        color: Colors.blue.shade900,
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
                          style: const TextStyle(fontSize: 14),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Icon(
                        Icons.school,
                        size: 16,
                        color: Colors.blue.shade700,
                      ),
                    ],
                  ),
                  trailing: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: participant.paye ? Colors.green.shade50 : Colors.orange.shade50,
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(
                        color: participant.paye ? Colors.green.shade300 : Colors.orange.shade300,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          participant.paye ? Icons.check_circle : Icons.pending,
                          size: 12,
                          color: participant.paye ? Colors.green.shade700 : Colors.orange.shade700,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          participant.paye ? 'Payé' : 'Non payé',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: participant.paye ? Colors.green.shade700 : Colors.orange.shade700,
                          ),
                        ),
                      ],
                    ),
                  ),
                  children: [
                    _buildParticipantExercises(participant),
                  ],
                );
              },
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
          backgroundColor: Colors.green,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
    );
  }

  Widget _buildPaymentSection(ParticipantOperation participation) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: participation.paye ? Colors.green.shade50 : Colors.orange.shade50,
        border: Border.all(
          color: participation.paye ? Colors.green : Colors.orange,
          width: 1.5,
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          // Icône statut
          Icon(
            participation.paye ? Icons.check_circle : Icons.pending,
            color: participation.paye ? Colors.green : Colors.orange,
            size: 18,
          ),
          const SizedBox(width: 8),

          // Texte statut
          Expanded(
            child: Text(
              participation.paye ? 'Paiement effectué' : 'En attente de paiement',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: participation.paye ? Colors.green.shade900 : Colors.orange.shade900,
              ),
            ),
          ),

          // Montant
          Text(
            CurrencyFormatter.format(participation.prix),
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
            ),
          ),

          // Bouton payer si non payé
          if (!participation.paye) ...[
            const SizedBox(width: 8),
            ElevatedButton.icon(
              onPressed: () => _handlePayment(participation),
              icon: const Icon(Icons.payment, color: Colors.white, size: 16),
              label: Text(
                'Payer ${CurrencyFormatter.format(participation.prix)}',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1976D2),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _handlePayment(ParticipantOperation participation) async {
    final paymentProvider = context.read<PaymentProvider>();
    final operation = context.read<OperationProvider>().selectedOperation;

    if (operation == null) {
      _showError('Événement non trouvé');
      return;
    }

    // Afficher dialog de confirmation
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirmer le paiement'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Événement : ${operation.titre}'),
            const SizedBox(height: 8),
            Text(
              'Montant : ${CurrencyFormatter.format(participation.prix)}',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            const SizedBox(height: 16),
            const Text(
              'Vous serez redirigé vers votre banque pour effectuer le paiement.',
              style: TextStyle(fontSize: 14, color: Colors.grey),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Continuer'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    // Afficher dialog loading
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const AlertDialog(
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Préparation du paiement...'),
          ],
        ),
      ),
    );

    try {
      // Créer le paiement via PaymentProvider
      final paymentUrl = await paymentProvider.createPayment(
        clubId: widget.clubId,
        operationId: widget.operationId,
        participantId: participation.id,
        amount: participation.prix,
        description: operation.titre,
      );

      if (!mounted) return;
      Navigator.pop(context); // Fermer dialog loading

      if (paymentUrl == null) {
        _showError(paymentProvider.errorMessage ?? 'Erreur de paiement');
        return;
      }

      // Ouvrir URL Noda dans navigateur
      final uri = Uri.parse(paymentUrl);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);

        // Démarrer polling du statut
        paymentProvider.startPaymentStatusPolling(
          paymentProvider.currentPaymentId!,
          (status) {
            if (status.isCompleted) {
              _showSuccess();
              // Rafraîchir les données
              _loadUserParticipation(context.read<AuthProvider>().currentUser?.uid ?? '');
            } else if (status.isFailed) {
              _showError('Le paiement a échoué');
            }
          },
        );

        // Afficher message d'information
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Veuillez compléter le paiement dans votre navigateur'),
              duration: Duration(seconds: 5),
              backgroundColor: Colors.blue,
            ),
          );
        }
      } else {
        _showError('Impossible d\'ouvrir le lien de paiement');
      }
    } catch (e) {
      if (mounted) {
        Navigator.pop(context); // Fermer dialog loading
        _showError('Erreur : $e');
      }
    }
  }

  void _showSuccess() {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('✅ Paiement effectué avec succès !'),
        backgroundColor: Colors.green,
        duration: Duration(seconds: 3),
      ),
    );
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.red,
        duration: const Duration(seconds: 4),
      ),
    );
  }

  /// Section exercices LIFRAS
  Widget _buildExercisesSection(ParticipantOperation participation) {
    final hasExercises = participation.exercicesLifras != null &&
                        participation.exercicesLifras!.isNotEmpty;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.school, color: Colors.blue, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Exercices',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: _handleEditExercises,
                icon: Icon(hasExercises ? Icons.edit : Icons.add, size: 18),
                label: Text(hasExercises ? 'Modifier' : 'Ajouter'),
                style: TextButton.styleFrom(
                  foregroundColor: Colors.blue,
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (hasExercises)
            FutureBuilder<List<ExerciceLIFRAS>>(
              future: LifrasService().getExercicesByIds(
                widget.clubId,
                participation.exercicesLifras!,
              ),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.all(16.0),
                      child: CircularProgressIndicator(),
                    ),
                  );
                }

                if (!snapshot.hasData || snapshot.data!.isEmpty) {
                  return Text(
                    '${participation.exercicesLifras!.length} exercice${participation.exercicesLifras!.length > 1 ? 's' : ''} sélectionné${participation.exercicesLifras!.length > 1 ? 's' : ''}',
                    style: TextStyle(
                      color: Colors.grey[600],
                      fontSize: 14,
                    ),
                  );
                }

                final exercises = snapshot.data!;
                return Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: exercises.map((exercise) => Chip(
                    avatar: CircleAvatar(
                      backgroundColor: _getNiveauColor(exercise.niveau),
                      child: Text(
                        exercise.niveau.code,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    label: Text(
                      exercise.displayName,
                      style: const TextStyle(fontSize: 12),
                    ),
                    backgroundColor: Colors.grey[100],
                  )).toList(),
                );
              },
            )
          else
            Text(
              'Aucun exercice sélectionné',
              style: TextStyle(
                color: Colors.grey[600],
                fontSize: 14,
                fontStyle: FontStyle.italic,
              ),
            ),
        ],
      ),
    );
  }

  /// Gérer l'édition des exercices
  Future<void> _handleEditExercises() async {
    final authProvider = context.read<AuthProvider>();
    final userId = authProvider.currentUser?.uid ?? '';

    List<String>? selectedExerciseIds;

    try {
      // Show loading dialog
      if (!mounted) return;
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => const Center(
          child: CircularProgressIndicator(),
        ),
      );

      // Fetch member niveau
      final memberService = MemberService();
      final niveau = await memberService.getMemberNiveau(widget.clubId, userId);

      // Fetch exercises for member's niveau (EXACT level only)
      final lifrasService = LifrasService();
      final availableExercises = niveau != null
          ? await lifrasService.getExercicesByNiveau(widget.clubId, niveau)
          : <ExerciceLIFRAS>[];

      // Close loading dialog
      if (mounted) Navigator.pop(context);

      // Show exercise selection dialog
      if (availableExercises.isNotEmpty && mounted) {
        selectedExerciseIds = await showDialog<List<String>>(
          context: context,
          builder: (context) => ExerciseSelectionDialog(
            exercises: availableExercises,
            memberNiveau: niveau,
            initialSelection: _userParticipation?.exercicesLifras ?? [],
          ),
        );

        // User cancelled
        if (selectedExerciseIds == null) return;
      } else {
        // No exercises available
        if (mounted) {
          _showError('Aucun exercice disponible pour votre niveau');
        }
        return;
      }
    } catch (e) {
      // Close loading dialog if open
      if (mounted && Navigator.canPop(context)) {
        Navigator.pop(context);
      }

      if (mounted) {
        _showError('Erreur chargement exercices: $e');
      }
      return;
    }

    // Update exercises in Firestore
    if (selectedExerciseIds != null && mounted) {
      try {
        // Show loading
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (context) => const Center(
            child: CircularProgressIndicator(),
          ),
        );

        // Update in Firestore
        await FirebaseFirestore.instance
            .collection('clubs/${widget.clubId}/operations/${widget.operationId}/inscriptions')
            .doc(_userParticipation!.id)
            .update({
          'exercices_lifras': selectedExerciseIds,
          'updated_at': FieldValue.serverTimestamp(),
        });

        // Close loading
        if (mounted) Navigator.pop(context);

        // Reload participation
        await _loadUserParticipation(userId);

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                selectedExerciseIds.isNotEmpty
                    ? '✅ ${selectedExerciseIds.length} exercice${selectedExerciseIds.length > 1 ? 's' : ''} sélectionné${selectedExerciseIds.length > 1 ? 's' : ''}'
                    : '✅ Exercices supprimés',
              ),
              backgroundColor: Colors.green,
            ),
          );
        }
      } catch (e) {
        // Close loading if open
        if (mounted && Navigator.canPop(context)) {
          Navigator.pop(context);
        }

        if (mounted) {
          _showError('Erreur mise à jour exercices: $e');
        }
      }
    }
  }

  Color _getNiveauColor(NiveauLIFRAS niveau) {
    switch (niveau) {
      case NiveauLIFRAS.nb:
        return Colors.grey;
      case NiveauLIFRAS.p2:
        return Colors.blue;
      case NiveauLIFRAS.p3:
        return Colors.green;
      case NiveauLIFRAS.p4:
        return Colors.orange;
      case NiveauLIFRAS.am:
        return Colors.purple;
      case NiveauLIFRAS.mc:
        return Colors.red;
    }
  }

  /// Widget pour afficher les exercices d'un participant
  Widget _buildParticipantExercises(ParticipantOperation participant) {
    if (participant.exercicesLifras == null || participant.exercicesLifras!.isEmpty) {
      return const SizedBox.shrink();
    }

    return FutureBuilder<List<ExerciceLIFRAS>>(
      future: LifrasService().getExercicesByIds(
        widget.clubId,
        participant.exercicesLifras!,
      ),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.all(8.0),
            child: Center(
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          );
        }

        if (!snapshot.hasData || snapshot.data!.isEmpty) {
          return Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              '${participant.exercicesLifras!.length} exercice${participant.exercicesLifras!.length > 1 ? 's' : ''} sélectionné${participant.exercicesLifras!.length > 1 ? 's' : ''}',
              style: TextStyle(
                color: Colors.grey[600],
                fontSize: 12,
                fontStyle: FontStyle.italic,
              ),
            ),
          );
        }

        final exercises = snapshot.data!;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Exercices LIFRAS :',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Colors.grey[700],
              ),
            ),
            const SizedBox(height: 6),
            ...exercises.map((exercise) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: _getNiveauColor(exercise.niveau),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      exercise.niveau.code,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          exercise.displayName,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        if (exercise.description != null && exercise.description!.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(
                              exercise.description!,
                              style: TextStyle(
                                fontSize: 11,
                                color: Colors.grey[600],
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            )),
          ],
        );
      },
    );
  }

  /// Widget pour afficher une info compacte (chip)
  Widget _buildCompactInfoChip(IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.blue.shade50,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.blue.shade200),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: Colors.blue.shade700),
          const SizedBox(width: 6),
          Text(
            text,
            style: TextStyle(
              fontSize: 13,
              color: Colors.blue.shade900,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  /// Accordéon de discussion (participants uniquement)
  Widget _buildDiscussionAccordion() {
    return Card(
      margin: const EdgeInsets.only(top: 12, bottom: 8),
      child: Consumer<EventMessageProvider>(
        builder: (context, messageProvider, child) {
          return StreamBuilder<List<EventMessage>>(
            stream: messageProvider.watchMessages(widget.clubId, widget.operationId),
            builder: (context, snapshot) {
              final messages = snapshot.data ?? [];
              final messageCount = messages.length;

              return ExpansionTile(
                leading: const Icon(Icons.chat_bubble_outline, color: Colors.teal),
                title: const Text(
                  'Discussion',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                subtitle: Text(
                  '$messageCount message${messageCount > 1 ? 's' : ''}',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey[600],
                  ),
                ),
                children: [
                  SizedBox(
                    height: 400,
                    child: EventDiscussionTab(
                      clubId: widget.clubId,
                      operationId: widget.operationId,
                    ),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }
}

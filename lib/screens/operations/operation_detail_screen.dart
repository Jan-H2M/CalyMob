import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/operation_provider.dart';
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

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadOperation();
      _loadUserProfile();
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
                          style: TextStyle(
                            fontSize: 15,
                            color: Colors.grey[700],
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // Course selection (only if registered)
                      if (isRegistered) ...[
                        const Divider(),
                        const SizedBox(height: 8),
                        _buildCourseSelection(),
                      ],

                      const Divider(),
                      const SizedBox(height: 8),

                      // Liste des participants inscrits avec accordion
                      _buildParticipantsListWithAccordion(operationProvider),
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
    );
  }

  /// Compact header: Date + Lieu on same line
  Widget _buildCompactHeader(operation) {
    return Row(
      children: [
        // Date
        if (operation.dateDebut != null) ...[
          Icon(Icons.calendar_today, size: 18, color: Colors.grey[600]),
          const SizedBox(width: 6),
          Text(
            DateFormatter.formatLong(operation.dateDebut!),
            style: TextStyle(fontSize: 14, color: Colors.grey[700]),
          ),
        ],

        // Separator
        if (operation.dateDebut != null && operation.lieu != null) ...[
          const SizedBox(width: 16),
          Text('|', style: TextStyle(color: Colors.grey[400])),
          const SizedBox(width: 16),
        ],

        // Lieu
        if (operation.lieu != null) ...[
          Icon(Icons.location_on, size: 18, color: Colors.grey[600]),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              operation.lieu!,
              style: TextStyle(fontSize: 14, color: Colors.grey[700]),
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
          Icon(Icons.euro, size: 18, color: Colors.grey[600]),
          const SizedBox(width: 6),
          Text(
            CurrencyFormatter.format(displayPrice),
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: Colors.grey[700],
            ),
          ),
          // Show function if different from default
          if (userFunction != null && userFunction != 'Membre') ...[
            const SizedBox(width: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: Colors.green.shade100,
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                userFunction,
                style: TextStyle(
                  fontSize: 10,
                  color: Colors.green.shade700,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        ],

        // Separator
        if (displayPrice != null && displayPrice > 0 && userLevel != null) ...[
          const SizedBox(width: 16),
          Text('|', style: TextStyle(color: Colors.grey[400])),
          const SizedBox(width: 16),
        ],

        // User level
        if (userLevel != null) ...[
          Icon(Icons.pool, size: 18, color: Colors.blue[600]),
          const SizedBox(width: 6),
          Text(
            'Niveau: $userLevel',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: Colors.blue[700],
            ),
          ),
        ],
      ],
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
            // Payment button - show if registered AND not paid yet
            if (isRegistered && !isPaid) ...[
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton.icon(
                  onPressed: null, // Disabled for now
                  icon: const Icon(Icons.payment),
                  label: Text(
                    inscriptionPrice > 0
                        ? 'Payer ${CurrencyFormatter.format(inscriptionPrice)}'
                        : 'Payer',
                    style: const TextStyle(fontSize: 16),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.grey[300],
                    foregroundColor: Colors.grey[600],
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Paiement bientôt disponible',
                style: TextStyle(fontSize: 12, color: Colors.grey[500]),
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
          backgroundColor: Colors.green,
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

  /// Participants list with accordion to show selected exercises
  Widget _buildParticipantsListWithAccordion(OperationProvider operationProvider) {
    final participants = operationProvider.selectedOperationParticipants;
    final authProvider = context.read<AuthProvider>();
    final currentUserId = authProvider.currentUser?.uid ?? '';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.group, color: Colors.blue),
            const SizedBox(width: 8),
            Text(
              'Inscrits (${participants.length})',
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (participants.isEmpty)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.grey.shade100,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Row(
              children: [
                Icon(Icons.info_outline, color: Colors.grey),
                SizedBox(width: 8),
                Text(
                  'Aucun inscrit pour le moment',
                  style: TextStyle(color: Colors.grey),
                ),
              ],
            ),
          )
        else
          Container(
            decoration: BoxDecoration(
              border: Border.all(color: Colors.grey.shade300),
              borderRadius: BorderRadius.circular(12),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: ExpansionPanelList.radio(
                elevation: 0,
                expandedHeaderPadding: EdgeInsets.zero,
                children: participants.asMap().entries.map((entry) {
                  final index = entry.key;
                  final participant = entry.value;
                  // Display firstname + family name
                  final prenom = participant.membrePrenom ?? '';
                  final nom = participant.membreNom ?? '';
                  final displayName = prenom.isNotEmpty
                      ? '$prenom $nom'.trim()
                      : (nom.isNotEmpty ? nom : 'Anonyme');
                  final isCurrentUser = participant.membreId == currentUserId;
                  final hasExercices = participant.exercices.isNotEmpty;

                  return ExpansionPanelRadio(
                    value: index,
                    canTapOnHeader: true,
                    headerBuilder: (context, isExpanded) {
                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: isCurrentUser ? Colors.green.shade100 : Colors.blue.shade100,
                          child: Text(
                            prenom.isNotEmpty ? prenom[0].toUpperCase() : (nom.isNotEmpty ? nom[0].toUpperCase() : '?'),
                            style: TextStyle(
                              color: isCurrentUser ? Colors.green.shade700 : Colors.blue.shade700,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        title: Row(
                          children: [
                            Expanded(
                              child: Text(
                                displayName,
                                style: const TextStyle(fontWeight: FontWeight.w500),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            if (isCurrentUser) ...[
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: Colors.blue.shade100,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  'vous',
                                  style: TextStyle(
                                    fontSize: 10,
                                    color: Colors.blue.shade700,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                        subtitle: hasExercices
                            ? Text(
                                '${participant.exercices.length} exercice(s)',
                                style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                              )
                            : null,
                        trailing: _buildPaymentBadge(participant.paye),
                      );
                    },
                    body: _buildParticipantExercicesList(participant),
                  );
                }).toList(),
              ),
            ),
          ),
      ],
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

  Widget _buildParticipantExercicesList(ParticipantOperation participant) {
    if (participant.exercices.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(16),
        child: Text(
          'Aucun exercice sélectionné',
          style: TextStyle(
            color: Colors.grey[500],
            fontStyle: FontStyle.italic,
          ),
        ),
      );
    }

    return FutureBuilder<List<ExerciceLIFRAS>>(
      future: _lifrasService.getExercicesByIds(widget.clubId, participant.exercices),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          );
        }

        final exercices = snapshot.data ?? [];

        if (exercices.isEmpty) {
          return Container(
            padding: const EdgeInsets.all(16),
            child: Text(
              '${participant.exercices.length} exercice(s)',
              style: TextStyle(color: Colors.grey[600]),
            ),
          );
        }

        return Container(
          padding: const EdgeInsets.only(left: 16, right: 16, bottom: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: exercices.map((ex) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.check, size: 16, color: Colors.green[600]),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            ex.code,
                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                          ),
                          Text(
                            ex.description,
                            style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        );
      },
    );
  }
}

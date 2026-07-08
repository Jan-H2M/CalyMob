import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:lottie/lottie.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../../providers/auth_provider.dart';
import '../../models/member_profile.dart';
import '../../services/profile_service.dart';
import '../../services/member_service.dart';
import '../../utils/permission_helper.dart';
import '../../models/formation_snapshot_doc.dart';
import '../../services/formation_snapshot_reader.dart';
import '../exercises/member_exercises_screen.dart';
import '../formation/student_360_screen.dart';

/// Écran "Who's Who" - Annuaire des membres
class WhoIsWhoScreen extends StatefulWidget {
  const WhoIsWhoScreen({super.key});

  @override
  State<WhoIsWhoScreen> createState() => _WhoIsWhoScreenState();
}

class _WhoIsWhoScreenState extends State<WhoIsWhoScreen>
    with SingleTickerProviderStateMixin {
  final String _clubId = 'calypso';
  final ProfileService _profileService = ProfileService();
  final MemberService _memberService = MemberService();
  final TextEditingController _searchController = TextEditingController();

  String _searchQuery = '';
  String? _filterLevel;
  bool _onlyWithPhotos = false;
  String _sortBy = 'prenom'; // 'prenom' (first name) or 'nom' (last name)
  bool _canManageExercises = false; // Monitor, admin, or super admin
  bool _canSeeFormation = false; // WP-10 : voir l'onglet Formation (tout encadrant)
  bool _showFormation = false; // WP-10 : segment « Membres | Formation »

  // Bubbles animation
  late AnimationController _bubblesController;
  late Animation<double> _bubblesPosition;

  @override
  void initState() {
    super.initState();
    _checkPermissions();

    // Bubbles animation: 35 seconden, van onder naar boven
    _bubblesController = AnimationController(
      duration: const Duration(seconds: 35),
      vsync: this,
    );
    _bubblesPosition = Tween<double>(
      begin: 0.5,  // Start in midden
      end: -0.5,   // Eind boven het scherm
    ).animate(CurvedAnimation(
      parent: _bubblesController,
      curve: Curves.linear,
    ));
    _bubblesController.repeat();
  }

  /// Permission gate voor exercise-management (LIFRAS-validatie).
  /// Vereist admin OF (Encadrant-functie + Moniteur-niveau MC/MF/MN).
  /// Mirrors canValidateLifras() in firestore.rules + fieldMapper.ts.
  Future<void> _checkPermissions() async {
    final userId = context.read<AuthProvider>().currentUser?.uid ?? '';
    if (userId.isEmpty) return;

    final profile = await _profileService.getProfile(_clubId, userId);
    if (profile == null) return;

    final canValidate = PermissionHelper.canValidateLifras(
      clubStatuten: profile.clubStatuten,
      plongeurCode: profile.plongeurCode,
    );

    // Voir la formation = tout encadrant (ou admin/moniteur). La validation
    // pédagogique reste, elle, sous canValidateLifras (_canManageExercises).
    final canSeeFormation =
        canValidate || PermissionHelper.isEncadrant(profile.clubStatuten);

    if (mounted) {
      setState(() {
        _canManageExercises = canValidate;
        _canSeeFormation = canSeeFormation;
      });
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    _bubblesController.dispose();
    super.dispose();
  }

  Future<void> _launchPhone(String phoneNumber) async {
    // Nettoyer le numéro de téléphone (enlever espaces, tirets, etc.)
    final cleanPhone = phoneNumber.replaceAll(RegExp(r'[^\d+]'), '');
    final phoneUrl = Uri.parse('tel:$cleanPhone');

    try {
      if (await canLaunchUrl(phoneUrl)) {
        await launchUrl(phoneUrl);
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Impossible d\'ouvrir l\'application téléphone'),
              backgroundColor: Colors.orange,
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
    }
  }

  Future<void> _launchEmail(String email) async {
    final emailUrl = Uri.parse('mailto:$email');

    try {
      if (await canLaunchUrl(emailUrl)) {
        await launchUrl(emailUrl);
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Impossible d\'ouvrir l\'application email'),
              backgroundColor: Colors.orange,
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
    }
  }

  List<MemberProfile> _filterMembers(List<MemberProfile> members) {
    // Montrer seulement les membres actifs (exclure inactive/deleted)
    var filtered = members.where((m) => m.isActive).toList();

    // Filtre de recherche
    if (_searchQuery.isNotEmpty) {
      filtered = filtered.where((member) {
        final query = _searchQuery.toLowerCase();
        return member.fullName.toLowerCase().contains(query) ||
               member.nom.toLowerCase().contains(query) ||
               member.prenom.toLowerCase().contains(query);
      }).toList();
    }

    // Filtre par niveau
    if (_filterLevel != null) {
      filtered = filtered.where((member) {
        return member.plongeurCode?.toUpperCase() == _filterLevel;
      }).toList();
    }

    // Filtre "avec photo uniquement"
    if (_onlyWithPhotos) {
      filtered = filtered.where((member) => member.hasPhoto).toList();
    }

    // Trier par prénom ou nom
    filtered.sort((a, b) {
      if (_sortBy == 'prenom') {
        final prenomCompare = a.prenom.toLowerCase().compareTo(b.prenom.toLowerCase());
        if (prenomCompare != 0) return prenomCompare;
        return a.nom.toLowerCase().compareTo(b.nom.toLowerCase());
      } else {
        final nomCompare = a.nom.toLowerCase().compareTo(b.nom.toLowerCase());
        if (nomCompare != 0) return nomCompare;
        return a.prenom.toLowerCase().compareTo(b.prenom.toLowerCase());
      }
    });

    return filtered;
  }

  @override
  Widget build(BuildContext context) {
    final currentUserId = context.watch<AuthProvider>().currentUser?.uid ?? '';

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text('Who\'s Who', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: _showFilterDialog,
            tooltip: 'Filtres',
          ),
        ],
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.fish,
        child: SafeArea(
            child: Column(
        children: [
          // WP-10 — segment « Membres | Formation » (tout encadrant).
          if (_canSeeFormation) _buildFormationSegment(),

          // Barre de recherche - glass effect
          ClipRRect(
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.15),
                ),
                child: TextField(
                  controller: _searchController,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    hintText: 'Rechercher un membre...',
                    hintStyle: TextStyle(color: Colors.white.withOpacity(0.7)),
                    prefixIcon: Icon(Icons.search, color: Colors.white.withOpacity(0.9)),
                    suffixIcon: _searchQuery.isNotEmpty
                        ? IconButton(
                            icon: Icon(Icons.clear, color: Colors.white.withOpacity(0.9)),
                            onPressed: () {
                              setState(() {
                                _searchController.clear();
                                _searchQuery = '';
                              });
                            },
                          )
                        : null,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(30),
                      borderSide: BorderSide(color: Colors.white.withOpacity(0.3)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(30),
                      borderSide: BorderSide(color: Colors.white.withOpacity(0.3)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(30),
                      borderSide: BorderSide(color: Colors.white.withOpacity(0.6)),
                    ),
                    filled: true,
                    fillColor: Colors.white.withOpacity(0.1),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                  ),
                  onChanged: (value) {
                    setState(() {
                      _searchQuery = value;
                    });
                  },
                ),
              ),
            ),
          ),

          // Filtres actifs - glass effect
          if (_filterLevel != null || _onlyWithPhotos)
            ClipRRect(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 5, sigmaY: 5),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppColors.primaryLight.withOpacity(0.2),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.filter_alt, size: 16, color: Colors.white.withOpacity(0.9)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Wrap(
                          spacing: 8,
                          children: [
                            if (_filterLevel != null)
                              Chip(
                                label: Text('Niveau: $_filterLevel', style: const TextStyle(color: Colors.white)),
                                backgroundColor: Colors.white.withOpacity(0.2),
                                onDeleted: () {
                                  setState(() {
                                    _filterLevel = null;
                                  });
                                },
                                deleteIcon: const Icon(Icons.close, size: 16, color: Colors.white),
                              ),
                            if (_onlyWithPhotos)
                              Chip(
                                label: const Text('Avec photo', style: TextStyle(color: Colors.white)),
                                backgroundColor: Colors.white.withOpacity(0.2),
                                onDeleted: () {
                                  setState(() {
                                    _onlyWithPhotos = false;
                                  });
                                },
                                deleteIcon: const Icon(Icons.close, size: 16, color: Colors.white),
                              ),
                          ],
                        ),
                      ),
                      TextButton(
                        onPressed: () {
                          setState(() {
                            _filterLevel = null;
                            _onlyWithPhotos = false;
                          });
                        },
                        child: const Text('Réinitialiser', style: TextStyle(color: Colors.white)),
                      ),
                    ],
                  ),
                ),
              ),
            ),

          // Grille des membres (2 colonnes) OU liste Formation (WP-10)
          Expanded(
            child: (_showFormation && _canSeeFormation)
                ? FormationListView(
                    clubId: _clubId,
                    searchQuery: _searchQuery,
                    filterLevel: _filterLevel,
                  )
                : FutureBuilder<List<MemberProfile>>(
              future: _profileService.getAllProfiles(_clubId),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }

                if (snapshot.hasError) {
                  return Center(
                    child: Text('Erreur: ${snapshot.error}'),
                  );
                }

                final allMembers = snapshot.data ?? [];
                final filteredMembers = _filterMembers(allMembers);

                if (filteredMembers.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.person_search,
                          size: 64,
                          color: Colors.white.withOpacity(0.6),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          _searchQuery.isNotEmpty
                              ? 'Aucun membre trouvé pour "$_searchQuery"'
                              : 'Aucun membre correspondant aux filtres',
                          style: TextStyle(color: Colors.white.withOpacity(0.8)),
                        ),
                      ],
                    ),
                  );
                }

                return GridView.builder(
                  padding: const EdgeInsets.all(12),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    childAspectRatio: 0.8,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                  ),
                  itemCount: filteredMembers.length,
                  itemBuilder: (context, index) {
                    final member = filteredMembers[index];
                    final isCurrentUser = member.id == currentUserId;

                    return _buildMemberGridTile(member, isCurrentUser);
                  },
                );
              },
            ),
          ),
        ],
      ),
        ),
      ),
    );
  }

  // WP-10 — bascule Membres / Formation.
  Widget _buildFormationSegment() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 2),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(30),
          border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
        ),
        child: Row(
          children: [
            _segmentButton('Membres', !_showFormation,
                () => setState(() => _showFormation = false)),
            _segmentButton('Formation', _showFormation,
                () => setState(() => _showFormation = true)),
          ],
        ),
      ),
    );
  }

  Widget _segmentButton(String label, bool active, VoidCallback onTap) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: active
                ? Colors.white.withValues(alpha: 0.92)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(30),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              color: active ? AppColors.donkerblauw : Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMemberGridTile(MemberProfile member, bool isCurrentUser) {
    return GestureDetector(
      onTap: () => _showMemberDetails(member, isCurrentUser),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.15),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: Colors.white.withOpacity(0.3),
                width: 1.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.1),
                  blurRadius: 10,
                  spreadRadius: 1,
                ),
              ],
            ),
            child: LayoutBuilder(
              builder: (context, constraints) {
                // Bereken de foto grootte: breedte minus padding, vierkant
                final photoSize = constraints.maxWidth - 16; // 8px padding aan elke kant
                return Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Photo - vaste vierkante grootte
                    Padding(
                      padding: const EdgeInsets.all(8),
                      child: Stack(
                        children: [
                          Container(
                            width: photoSize,
                            height: photoSize,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.white.withOpacity(0.2),
                            ),
                            child: ClipOval(
                              child: member.hasPhoto && member.consentInternalPhoto
                                  ? CachedNetworkImage(
                                      imageUrl: member.photoUrl!,
                                      fit: BoxFit.cover,
                                      width: photoSize,
                                      height: photoSize,
                                      placeholder: (context, url) => const Center(
                                        child: SizedBox(
                                          width: 20,
                                          height: 20,
                                          child: CircularProgressIndicator(strokeWidth: 2),
                                        ),
                                      ),
                                      errorWidget: (context, url, error) => Icon(
                                        Icons.person,
                                        size: 40,
                                        color: Colors.white.withOpacity(0.6),
                                      ),
                                    )
                                  : Icon(
                                      Icons.person,
                                      size: 40,
                                      color: Colors.white.withOpacity(0.6),
                                    ),
                            ),
                          ),
                          if (isCurrentUser)
                            Positioned(
                              top: 0,
                              right: 0,
                              child: Container(
                                padding: const EdgeInsets.all(4),
                                decoration: const BoxDecoration(
                                  color: Colors.green,
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(
                                  Icons.check,
                                  color: Colors.white,
                                  size: 10,
                                ),
                              ),
                            ),
                          // Validation status indicator (cotisation + certificat)
                          Positioned(
                            bottom: 5,
                            right: 15,
                            child: Container(
                              padding: const EdgeInsets.all(4),
                              decoration: BoxDecoration(
                                color: _isMemberValid(member) ? Colors.green : Colors.red,
                                shape: BoxShape.circle,
                                border: Border.all(color: Colors.white, width: 1),
                              ),
                              child: Icon(
                                _isMemberValid(member) ? Icons.check : Icons.close,
                                color: Colors.white,
                                size: 10,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Alleen voornaam (geen familienaam)
                    Padding(
                      padding: const EdgeInsets.only(left: 4, right: 4, bottom: 12),
                      child: Text(
                        member.prenom,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                          shadows: [
                            Shadow(
                              color: Colors.black26,
                              offset: Offset(1, 1),
                              blurRadius: 2,
                            ),
                          ],
                        ),
                        textAlign: TextAlign.center,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }

  void _showMemberDetails(MemberProfile member, bool isCurrentUser) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            Expanded(
              child: Text(
                member.fullName,
                style: const TextStyle(fontSize: 20),
              ),
            ),
            if (isCurrentUser)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.green.shade50,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.green),
                ),
                child: const Text(
                  'Vous',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.green,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Photo with sea star overlay
              SizedBox(
                width: 240,
                height: 240,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    // Photo (bigger size: 160x160)
                    Center(
                      child: Container(
                        width: 160,
                        height: 160,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.grey.shade200,
                        ),
                        child: ClipOval(
                          child: member.hasPhoto && member.consentInternalPhoto
                              ? CachedNetworkImage(
                                  imageUrl: member.photoUrl!,
                                  fit: BoxFit.cover,
                                  placeholder: (context, url) => const Center(
                                    child: CircularProgressIndicator(),
                                  ),
                                  errorWidget: (context, url, error) => Icon(
                                    Icons.person,
                                    size: 80,
                                    color: Colors.grey.shade400,
                                  ),
                                )
                              : Icon(
                                  Icons.person,
                                  size: 80,
                                  color: Colors.grey.shade400,
                                ),
                        ),
                      ),
                    ),
                    // Validation status indicator (cotisation + certificat)
                    Positioned(
                      bottom: 40,
                      left: 40,
                      child: Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: _isMemberValid(member) ? Colors.green : Colors.red,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2),
                        ),
                        child: Icon(
                          _isMemberValid(member) ? Icons.check : Icons.close,
                          color: Colors.white,
                          size: 16,
                        ),
                      ),
                    ),
                    // Sea star with diver level - positioned bottom right, overlapping
                    if (member.plongeurCode != null)
                      Positioned(
                        bottom: -40,
                        right: -50,
                        child: SizedBox(
                          width: 180,
                          height: 180,
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              // Sea star image
                              Image.asset(
                                'assets/images/Etoile.png',
                                width: 180,
                                height: 180,
                                fit: BoxFit.contain,
                              ),
                              // Level text centered in the middle of the star
                              Positioned(
                                bottom: 68,
                                child: Text(
                                  _formatLevelCode(member.plongeurCode!),
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.white,
                                    shadows: [
                                      Shadow(
                                        color: Colors.black54,
                                        offset: Offset(1, 1),
                                        blurRadius: 2,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),

              const SizedBox(height: 20),

              // Boutons de contact
              Column(
                children: [
                  // Exercices validés (visible pour le membre lui-même, moniteurs et admins)
                  if (isCurrentUser || _canManageExercises)
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => MemberExercisesScreen(
                                memberId: member.id,
                                memberName: member.fullName,
                                isMonitor: _canManageExercises,
                                isOwnProfile: isCurrentUser,
                              ),
                            ),
                          );
                        },
                        icon: const Icon(Icons.assignment_turned_in),
                        label: Text(isCurrentUser ? 'Mes exercices validés' : 'Voir exercices'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.middenblauw,
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ),

                  if ((isCurrentUser || _canManageExercises) && member.shareEmail)
                    const SizedBox(height: 8),

                  // Email
                  if (member.shareEmail)
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          _launchEmail(member.email);
                        },
                        icon: const Icon(Icons.email),
                        label: const Text('Envoyer un email'),
                      ),
                    ),

                  if (member.shareEmail && member.sharePhone && member.phoneNumber != null)
                    const SizedBox(height: 8),

                  // Phone call
                  if (member.sharePhone && member.phoneNumber != null)
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          _launchPhone(member.phoneNumber!);
                        },
                        icon: const Icon(Icons.phone),
                        label: Text('Appeler ${member.phoneNumber}'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          foregroundColor: Colors.white,
                        ),
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
            child: const Text('Fermer'),
          ),
        ],
      ),
    );
  }

  void _showFilterDialog() {
    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Filtres'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Filtre niveau
              const Text(
                'Niveau de plongée',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  FilterChip(
                    label: const Text('NB'),
                    selected: _filterLevel == 'NB',
                    onSelected: (selected) {
                      setState(() {
                        _filterLevel = selected ? 'NB' : null;
                      });
                    },
                  ),
                  FilterChip(
                    label: const Text('P2'),
                    selected: _filterLevel == 'P2',
                    onSelected: (selected) {
                      setState(() {
                        _filterLevel = selected ? 'P2' : null;
                      });
                    },
                  ),
                  FilterChip(
                    label: const Text('P3'),
                    selected: _filterLevel == 'P3',
                    onSelected: (selected) {
                      setState(() {
                        _filterLevel = selected ? 'P3' : null;
                      });
                    },
                  ),
                  FilterChip(
                    label: const Text('P4'),
                    selected: _filterLevel == 'P4',
                    onSelected: (selected) {
                      setState(() {
                        _filterLevel = selected ? 'P4' : null;
                      });
                    },
                  ),
                  FilterChip(
                    label: const Text('AM'),
                    selected: _filterLevel == 'AM',
                    onSelected: (selected) {
                      setState(() {
                        _filterLevel = selected ? 'AM' : null;
                      });
                    },
                  ),
                  FilterChip(
                    label: const Text('MC'),
                    selected: _filterLevel == 'MC',
                    onSelected: (selected) {
                      setState(() {
                        _filterLevel = selected ? 'MC' : null;
                      });
                    },
                  ),
                ],
              ),

              const SizedBox(height: 16),

              // Filtre photo
              SwitchListTile(
                value: _onlyWithPhotos,
                onChanged: (value) {
                  setState(() {
                    _onlyWithPhotos = value;
                  });
                },
                title: const Text('Avec photo uniquement'),
                contentPadding: EdgeInsets.zero,
              ),

              const SizedBox(height: 16),

              // Tri
              const Text(
                'Trier par',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: RadioListTile<String>(
                      value: 'prenom',
                      groupValue: _sortBy,
                      onChanged: (value) {
                        setState(() {
                          _sortBy = value!;
                        });
                      },
                      title: const Text('Prénom'),
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                    ),
                  ),
                  Expanded(
                    child: RadioListTile<String>(
                      value: 'nom',
                      groupValue: _sortBy,
                      onChanged: (value) {
                        setState(() {
                          _sortBy = value!;
                        });
                      },
                      title: const Text('Nom'),
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                    ),
                  ),
                ],
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () {
                setState(() {
                  _filterLevel = null;
                  _onlyWithPhotos = false;
                  _sortBy = 'prenom';
                });
                Navigator.pop(context);
                this.setState(() {});
              },
              child: const Text('Réinitialiser'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
                this.setState(() {});
              },
              child: const Text('Appliquer'),
            ),
          ],
        ),
      ),
    );
  }

  Color _getNiveauColor(String? code) {
    if (code == null) return Colors.grey;

    switch (code.toUpperCase()) {
      case '1':
      case 'NB':
        return Colors.grey;
      case '2':
      case 'P2':
        return AppColors.middenblauw;
      case '3':
      case 'P3':
        return AppColors.success;
      case '4':
      case 'P4':
        return AppColors.oranje;
      case 'AM':
        return AppColors.donkerblauw;
      case 'MC':
      case 'MF':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  /// Check if member has valid cotisation AND certificat médical
  bool _isMemberValid(MemberProfile member) {
    return (member.cotisationStatus == ValidationStatus.valid ||
            member.cotisationStatus == ValidationStatus.warning) &&
           (member.certificatStatus == ValidationStatus.valid ||
            member.certificatStatus == ValidationStatus.warning);
  }

  /// Format the level code for display in the sea star
  /// Extracts just the number/code (e.g., "P2" -> "2")
  String _formatLevelCode(String code) {
    final upperCode = code.toUpperCase();
    // If it's like "P2", "P3", etc., extract just the number
    if (upperCode.startsWith('P') && upperCode.length == 2) {
      return upperCode.substring(1);
    }
    return upperCode;
  }
}


/// WP-10 — Liste « Formation » de Who's who (encadrants uniquement).
/// Lit les snapshots matérialisés (collectionGroup) + joint les profils.
/// Triée « attention d'abord ». Tap → fiche 360°.
class FormationListView extends StatefulWidget {
  final String clubId;
  final String searchQuery;
  final String? filterLevel;

  const FormationListView({
    super.key,
    required this.clubId,
    required this.searchQuery,
    this.filterLevel,
  });

  @override
  State<FormationListView> createState() => _FormationListViewState();
}

class _FormationRow {
  final MemberProfile profile;
  final FormationSnapshotDoc snapshot;
  const _FormationRow({required this.profile, required this.snapshot});
}

class _FormationListViewState extends State<FormationListView> {
  final ProfileService _profileService = ProfileService();
  final FormationSnapshotReader _reader = FormationSnapshotReader();
  late final Future<List<_FormationRow>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<_FormationRow>> _load() async {
    final results = await Future.wait<dynamic>([
      _profileService.getAllProfiles(widget.clubId),
      _reader.getAllSnapshots(widget.clubId),
    ]);
    final profiles = (results[0] as List<MemberProfile>);
    final snaps = (results[1] as List<FormationSnapshotDoc>);
    final byId = {for (final p in profiles) p.id: p};
    final rows = <_FormationRow>[];
    for (final s in snaps) {
      final p = byId[s.memberId];
      if (p == null) continue;
      rows.add(_FormationRow(profile: p, snapshot: s));
    }
    rows.sort((a, b) =>
        b.snapshot.attentionScore.compareTo(a.snapshot.attentionScore));
    return rows;
  }

  List<_FormationRow> _filter(List<_FormationRow> rows) {
    var out = rows;
    final q = widget.searchQuery.trim().toLowerCase();
    if (q.isNotEmpty) {
      out = out
          .where((r) =>
              r.profile.fullName.toLowerCase().contains(q) ||
              r.profile.nom.toLowerCase().contains(q) ||
              r.profile.prenom.toLowerCase().contains(q))
          .toList();
    }
    if (widget.filterLevel != null) {
      out = out
          .where((r) =>
              (r.profile.plongeurCode ?? '').toUpperCase() == widget.filterLevel)
          .toList();
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<_FormationRow>>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Center(
              child: CircularProgressIndicator(color: Colors.white));
        }
        final rows = _filter(snap.data ?? const []);
        if (rows.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                widget.searchQuery.isNotEmpty || widget.filterLevel != null
                    ? 'Aucun élève ne correspond aux filtres.'
                    : 'Aucun élève en formation pour le moment.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white.withValues(alpha: 0.8)),
              ),
            ),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.fromLTRB(12, 6, 12, 16),
          itemCount: rows.length,
          itemBuilder: (context, i) => _buildRow(context, rows[i]),
        );
      },
    );
  }

  Widget _buildRow(BuildContext context, _FormationRow row) {
    final m = row.profile;
    final s = row.snapshot;
    final trajet = s.targetLevel != null && s.targetLevel!.isNotEmpty
        ? '${s.currentCode.isEmpty ? '—' : s.currentCode} → ${s.targetLevel}'
        : (s.currentCode.isEmpty ? '' : s.currentCode);

    return GestureDetector(
      onTap: () {
        Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => Student360Screen(clubId: widget.clubId, member: m),
        ));
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _photo(m, 48),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          m.fullName,
                          style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 15),
                        ),
                      ),
                      if (s.attentionCount > 0) _badge('⚠ ${s.attentionCount}', Colors.redAccent),
                      if (s.pendingCount > 0) _badge('⏳ ${s.pendingCount}', Colors.amberAccent),
                      if (s.goalCount > 0) _badge('🎯 ${s.goalCount}', Colors.tealAccent),
                    ],
                  ),
                  if (trajet.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 1),
                      child: Text(trajet,
                          style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.75),
                              fontSize: 12,
                              fontWeight: FontWeight.w600)),
                    ),
                  const SizedBox(height: 6),
                  _miniBar('Exercices', s.exercisePct, AppColors.lichtblauw),
                  if (s.hasMil) ...[
                    const SizedBox(height: 4),
                    _miniBar('Exp. MIL', s.milPct, Colors.amberAccent),
                  ],
                  const SizedBox(height: 6),
                  Text(
                    s.pedagogicalLine,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.9),
                        fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _badge(String text, Color color) {
    return Container(
      margin: const EdgeInsets.only(left: 5),
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.22),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(text,
          style: TextStyle(
              color: color, fontSize: 11, fontWeight: FontWeight.w700)),
    );
  }

  Widget _miniBar(String label, int pct, Color color) {
    final p = (pct.clamp(0, 100)) / 100.0;
    return Row(
      children: [
        SizedBox(
          width: 64,
          child: Text(label,
              style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.75), fontSize: 11)),
        ),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(5),
            child: LinearProgressIndicator(
              value: p,
              minHeight: 6,
              backgroundColor: Colors.white.withValues(alpha: 0.16),
              valueColor: AlwaysStoppedAnimation<Color>(color),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text('$pct %',
            style: const TextStyle(
                color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
      ],
    );
  }

  Widget _photo(MemberProfile m, double size) {
    final hasPhoto = m.hasPhoto && m.consentInternalPhoto && m.photoUrl != null;
    if (hasPhoto) {
      return ClipOval(
        child: CachedNetworkImage(
          imageUrl: m.photoUrl!,
          width: size,
          height: size,
          fit: BoxFit.cover,
          errorWidget: (_, __, ___) => _initials(m, size),
        ),
      );
    }
    return _initials(m, size);
  }

  Widget _initials(MemberProfile m, double size) {
    final initials =
        '${m.prenom.isNotEmpty ? m.prenom[0] : ''}${m.nom.isNotEmpty ? m.nom[0] : ''}'
            .toUpperCase();
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white.withValues(alpha: 0.2),
      ),
      alignment: Alignment.center,
      child: Text(initials,
          style: TextStyle(
              color: Colors.white,
              fontSize: size * 0.36,
              fontWeight: FontWeight.bold)),
    );
  }
}

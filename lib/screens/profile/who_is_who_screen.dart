import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:lottie/lottie.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../../models/member_profile.dart';
import '../../services/profile_service.dart';
import '../../services/member_service.dart';
import '../../utils/permission_helper.dart';
import '../exercises/member_exercises_screen.dart';

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

  Future<void> _checkPermissions() async {
    final userId = context.read<AuthProvider>().currentUser?.uid ?? '';
    if (userId.isNotEmpty) {
      // Check if user is a monitor
      final isMonitor = await _memberService.isMonitor(_clubId, userId);

      // Check if user is admin based on clubStatuten
      final profile = await _profileService.getProfile(_clubId, userId);
      final isAdmin = profile != null && PermissionHelper.isAdmin(profile.clubStatuten);

      if (mounted) {
        setState(() => _canManageExercises = isMonitor || isAdmin);
      }
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
    var filtered = members;

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
      body: Stack(
        children: [
          // Donkerblauwe achtergrond
          Container(
            width: double.infinity,
            height: double.infinity,
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage(AppAssets.backgroundFull),
                fit: BoxFit.cover,
              ),
            ),
          ),

          // Bubbels animatie - ACHTER de cards
          AnimatedBuilder(
            animation: _bubblesPosition,
            builder: (context, child) {
              return Positioned(
                top: MediaQuery.of(context).size.height * _bubblesPosition.value,
                left: 0,
                right: 0,
                child: IgnorePointer(
                  child: Opacity(
                    opacity: 0.5,
                    child: Lottie.asset(
                      'assets/animations/bubbles2.json',
                      width: MediaQuery.of(context).size.width,
                      height: MediaQuery.of(context).size.height,
                      fit: BoxFit.cover,
                      repeat: true,
                    ),
                  ),
                ),
              );
            },
          ),

          // Hoofdinhoud
          SafeArea(
            child: Column(
        children: [
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

          // Grille des membres (2 colonnes)
          Expanded(
            child: FutureBuilder<List<MemberProfile>>(
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
                  padding: const EdgeInsets.all(16),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    childAspectRatio: 0.75,
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 16,
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
        ],
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
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Photo
                Stack(
                  children: [
                    Container(
                      width: 100,
                      height: 100,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white.withOpacity(0.2),
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
                              size: 50,
                              color: Colors.white.withOpacity(0.6),
                            ),
                          )
                        : Icon(
                            Icons.person,
                            size: 50,
                            color: Colors.white.withOpacity(0.6),
                          ),
                  ),
                ),
                if (isCurrentUser)
                  Positioned(
                    top: 0,
                    right: 0,
                    child: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: const BoxDecoration(
                        color: Colors.green,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.check,
                        color: Colors.white,
                        size: 14,
                      ),
                    ),
                  ),
              ],
            ),

            const SizedBox(height: 12),

                // Nom
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text(
                    member.fullName,
                    style: const TextStyle(
                      fontSize: 14,
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
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),

                const SizedBox(height: 6),

                // Niveau de plongée (compact)
                if (member.plongeurNiveau != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: _getNiveauColor(member.plongeurCode),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      member.plongeurNiveau!,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
              ],
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

              const SizedBox(height: 16),

              // Rôle
              if (member.role != null)
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.badge, size: 18, color: Colors.grey.shade600),
                    const SizedBox(width: 6),
                    Text(
                      member.role!,
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.grey.shade700,
                      ),
                    ),
                  ],
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

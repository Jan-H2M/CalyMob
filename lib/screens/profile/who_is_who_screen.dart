import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:url_launcher/url_launcher.dart';
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

class _WhoIsWhoScreenState extends State<WhoIsWhoScreen> {
  final String _clubId = 'calypso';
  final ProfileService _profileService = ProfileService();
  final MemberService _memberService = MemberService();
  final TextEditingController _searchController = TextEditingController();

  String _searchQuery = '';
  String? _filterLevel;
  bool _onlyWithPhotos = false;
  String _sortBy = 'prenom'; // 'prenom' (first name) or 'nom' (last name)
  bool _canManageExercises = false; // Monitor, admin, or super admin

  @override
  void initState() {
    super.initState();
    _checkPermissions();
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

    // Filtre par membres actifs uniquement
    filtered = filtered.where((member) => member.isActive).toList();

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
      appBar: AppBar(
        title: const Text('Who\'s Who', style: TextStyle(color: Colors.white)),
        backgroundColor: const Color(0xFF2196F3), // Blue
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: _showFilterDialog,
            tooltip: 'Filtres',
          ),
        ],
      ),
      body: Column(
        children: [
          // Barre de recherche
          Container(
            padding: const EdgeInsets.all(16),
            color: Colors.grey.shade100,
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Rechercher un membre...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
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
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: Colors.white,
                contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              ),
              onChanged: (value) {
                setState(() {
                  _searchQuery = value;
                });
              },
            ),
          ),

          // Filtres actifs
          if (_filterLevel != null || _onlyWithPhotos)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: Colors.blue.shade50,
              child: Row(
                children: [
                  const Icon(Icons.filter_alt, size: 16, color: Colors.blue),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Wrap(
                      spacing: 8,
                      children: [
                        if (_filterLevel != null)
                          Chip(
                            label: Text('Niveau: $_filterLevel'),
                            onDeleted: () {
                              setState(() {
                                _filterLevel = null;
                              });
                            },
                            deleteIcon: const Icon(Icons.close, size: 16),
                          ),
                        if (_onlyWithPhotos)
                          Chip(
                            label: const Text('Avec photo'),
                            onDeleted: () {
                              setState(() {
                                _onlyWithPhotos = false;
                              });
                            },
                            deleteIcon: const Icon(Icons.close, size: 16),
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
                    child: const Text('Réinitialiser'),
                  ),
                ],
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
                          color: Colors.grey.shade400,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          _searchQuery.isNotEmpty
                              ? 'Aucun membre trouvé pour "$_searchQuery"'
                              : 'Aucun membre correspondant aux filtres',
                          style: TextStyle(color: Colors.grey.shade600),
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
    );
  }

  Widget _buildMemberGridTile(MemberProfile member, bool isCurrentUser) {
    return GestureDetector(
      onTap: () => _showMemberDetails(member, isCurrentUser),
      child: Card(
        elevation: 2,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
                              size: 50,
                              color: Colors.grey.shade400,
                            ),
                          )
                        : Icon(
                            Icons.person,
                            size: 50,
                            color: Colors.grey.shade400,
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
              // Photo (bigger size: 160x160)
              Container(
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

              const SizedBox(height: 16),

              // Niveau de plongée
              if (member.plongeurNiveau != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: _getNiveauColor(member.plongeurCode),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    member.plongeurNiveau!,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                    ),
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
                          backgroundColor: Colors.teal,
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
        return Colors.blue;
      case '3':
      case 'P3':
        return Colors.green;
      case '4':
      case 'P4':
        return Colors.orange;
      case 'AM':
        return Colors.purple;
      case 'MC':
      case 'MF':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }
}

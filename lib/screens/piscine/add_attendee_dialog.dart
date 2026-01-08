import 'package:flutter/material.dart';
import '../../config/app_colors.dart';
import '../../services/member_service.dart';

/// Simple member data class for the dialog
class _SimpleMember {
  final String id;
  final String prenom;
  final String nom;

  _SimpleMember({required this.id, required this.prenom, required this.nom});

  String get fullName => '$prenom $nom';
}

/// Dialog pour ajouter manuellement un participant à une séance piscine
/// Permet de sélectionner un membre existant ou d'ajouter un invité
class AddAttendeeDialog extends StatefulWidget {
  final String clubId;

  const AddAttendeeDialog({
    super.key,
    required this.clubId,
  });

  @override
  State<AddAttendeeDialog> createState() => _AddAttendeeDialogState();
}

class _AddAttendeeDialogState extends State<AddAttendeeDialog> {
  final MemberService _memberService = MemberService();
  final TextEditingController _searchController = TextEditingController();
  final TextEditingController _guestPrenomController = TextEditingController();
  final TextEditingController _guestNomController = TextEditingController();

  List<_SimpleMember> _allMembers = [];
  List<_SimpleMember> _filteredMembers = [];
  bool _isLoading = true;
  bool _showGuestForm = false;

  @override
  void initState() {
    super.initState();
    _loadMembers();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _guestPrenomController.dispose();
    _guestNomController.dispose();
    super.dispose();
  }

  Future<void> _loadMembers() async {
    try {
      final membersData = await _memberService.getAllMembers(widget.clubId);
      final members = membersData.map((data) => _SimpleMember(
        id: data['id'] as String? ?? '',
        prenom: data['prenom'] as String? ?? '',
        nom: data['nom'] as String? ?? '',
      )).toList();
      setState(() {
        _allMembers = members;
        _filteredMembers = members;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
      });
    }
  }

  void _filterMembers(String query) {
    if (query.isEmpty) {
      setState(() {
        _filteredMembers = _allMembers;
      });
      return;
    }

    final lowerQuery = query.toLowerCase();
    setState(() {
      _filteredMembers = _allMembers.where((member) {
        final fullName = '${member.prenom} ${member.nom}'.toLowerCase();
        final reverseName = '${member.nom} ${member.prenom}'.toLowerCase();
        return fullName.contains(lowerQuery) || reverseName.contains(lowerQuery);
      }).toList();
    });
  }

  void _selectMember(_SimpleMember member) {
    Navigator.of(context).pop({
      'memberId': member.id,
      'memberName': member.fullName,
      'isGuest': false,
    });
  }

  void _addGuest() {
    final prenom = _guestPrenomController.text.trim();
    final nom = _guestNomController.text.trim();

    if (prenom.isEmpty || nom.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Veuillez remplir le prénom et le nom'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    Navigator.of(context).pop({
      'memberId': 'guest_${DateTime.now().millisecondsSinceEpoch}',
      'memberName': '$prenom $nom',
      'isGuest': true,
    });
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 400, maxHeight: 500),
        decoration: BoxDecoration(
          color: AppColors.donkerblauw,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Container(
              padding: const EdgeInsets.all(16),
              decoration: const BoxDecoration(
                color: AppColors.middenblauw,
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(20),
                  topRight: Radius.circular(20),
                ),
              ),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  const Expanded(
                    child: Text(
                      'Ajouter un participant',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(width: 48), // Balance for close button
                ],
              ),
            ),

            // Content
            Flexible(
              child: _showGuestForm ? _buildGuestForm() : _buildMemberList(),
            ),

            // Toggle button
            Padding(
              padding: const EdgeInsets.all(16),
              child: TextButton.icon(
                onPressed: () {
                  setState(() {
                    _showGuestForm = !_showGuestForm;
                  });
                },
                icon: Icon(
                  _showGuestForm ? Icons.people : Icons.person_add,
                  color: AppColors.oranje,
                ),
                label: Text(
                  _showGuestForm ? 'Sélectionner un membre' : 'Ajouter un invité',
                  style: const TextStyle(color: AppColors.oranje),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMemberList() {
    return Column(
      children: [
        // Search field
        Padding(
          padding: const EdgeInsets.all(16),
          child: TextField(
            controller: _searchController,
            onChanged: _filterMembers,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'Rechercher un membre...',
              hintStyle: TextStyle(color: Colors.white.withOpacity(0.5)),
              prefixIcon: const Icon(Icons.search, color: Colors.white54),
              filled: true,
              fillColor: Colors.white.withOpacity(0.1),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
          ),
        ),

        // Member list
        Expanded(
          child: _isLoading
              ? const Center(
                  child: CircularProgressIndicator(color: AppColors.oranje),
                )
              : _filteredMembers.isEmpty
                  ? Center(
                      child: Text(
                        _searchController.text.isEmpty
                            ? 'Aucun membre trouvé'
                            : 'Aucun résultat pour "${_searchController.text}"',
                        style: TextStyle(color: Colors.white.withOpacity(0.7)),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      itemCount: _filteredMembers.length,
                      itemBuilder: (context, index) {
                        final member = _filteredMembers[index];
                        return ListTile(
                          leading: CircleAvatar(
                            backgroundColor: AppColors.oranje,
                            child: Text(
                              member.prenom.isNotEmpty
                                  ? member.prenom[0].toUpperCase()
                                  : '?',
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          title: Text(
                            member.fullName,
                            style: const TextStyle(color: Colors.white),
                          ),
                          onTap: () => _selectMember(member),
                        );
                      },
                    ),
        ),
      ],
    );
  }

  Widget _buildGuestForm() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'Ajouter un invité',
            style: TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _guestPrenomController,
            style: const TextStyle(color: Colors.black),
            decoration: InputDecoration(
              hintText: 'Prénom',
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _guestNomController,
            style: const TextStyle(color: Colors.black),
            decoration: InputDecoration(
              hintText: 'Nom',
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _addGuest,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.oranje,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text(
                'Ajouter',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

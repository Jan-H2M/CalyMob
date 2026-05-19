import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_colors.dart';
import '../../models/banking_info.dart';
import '../../models/emergency_contact.dart';
import '../../models/emergency_info.dart';
import '../../models/medical_info.dart';
import '../../models/member_profile.dart';
import '../../providers/auth_provider.dart';
import '../../services/profile_service.dart';
import '../../services/sensitive_info_service.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import 'identite_screen.dart';
import 'settings_screen.dart';

class MesInformationsScreen extends StatefulWidget {
  const MesInformationsScreen({super.key});

  @override
  State<MesInformationsScreen> createState() => _MesInformationsScreenState();
}

class _MesInformationsScreenState extends State<MesInformationsScreen> {
  static const String _clubId = 'calypso';
  final ProfileService _profileService = ProfileService();
  final SensitiveInfoService _sensitiveInfoService = SensitiveInfoService();
  bool _saving = false;

  @override
  Widget build(BuildContext context) {
    final userId = context.watch<AuthProvider>().currentUser?.uid ?? '';
    if (userId.isEmpty) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'Mes informations',
          style: TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: StreamBuilder<MemberProfile?>(
            stream: _profileService.watchProfile(_clubId, userId),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(
                  child: CircularProgressIndicator(color: Colors.white),
                );
              }
              final profile = snapshot.data;
              if (profile == null) {
                return const Center(
                  child: Text(
                    'Erreur de chargement',
                    style: TextStyle(color: Colors.white),
                  ),
                );
              }

              return Stack(
                children: [
                  SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _Header(profile: profile),
                        const SizedBox(height: 16),
                        _identitySection(profile),
                        const SizedBox(height: 16),
                        _bankingSection(userId, profile),
                        const SizedBox(height: 16),
                        _emergencySection(userId),
                        const SizedBox(height: 16),
                        _preferencesSection(profile),
                        const SizedBox(height: 16),
                        _privacySection(userId, profile),
                        const SizedBox(height: 16),
                        _medicalSection(userId),
                      ],
                    ),
                  ),
                  if (_saving)
                    Container(
                      color: Colors.black45,
                      child: const Center(
                        child: CircularProgressIndicator(color: Colors.white),
                      ),
                    ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _identitySection(MemberProfile profile) {
    return _SectionCard(
      icon: Icons.person_outline,
      title: 'Identité',
      children: [
        _InfoRow(label: 'Nom complet', value: profile.fullName),
        _InfoRow(
          label: 'Email',
          value: profile.email,
          sub: 'Modifiable par un admin uniquement',
        ),
        _InfoRow(
          label: 'Niveau LIFRAS',
          value: profile.plongeurNiveau ?? '—',
          sub: 'Modifiable par l’administration',
        ),
        _InfoRow(
          label: 'Téléphone',
          value: profile.phoneNumber ?? 'Non renseigné',
          muted: profile.phoneNumber == null,
          trailing: IconButton(
            icon: const Icon(Icons.edit_outlined),
            onPressed: () => _editPhone(profile),
          ),
        ),
        _InfoRow(
          label: 'Date de naissance',
          value: _formatDate(profile.birthDate) ?? 'Non renseignée',
          muted: profile.birthDate == null,
          trailing: IconButton(
            icon: const Icon(Icons.edit_outlined),
            onPressed: () => _editBirthDate(profile),
          ),
        ),
        _InfoRow(
          label: 'Adresse',
          value: profile.formattedAddress ?? 'Non renseignée',
          muted: profile.formattedAddress == null,
          trailing: IconButton(
            icon: const Icon(Icons.edit_outlined),
            onPressed: () => _editAddress(profile),
          ),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const IdentiteScreen()),
          ),
          icon: const Icon(Icons.add_a_photo_outlined),
          label: const Text('Changer la photo'),
        ),
      ],
    );
  }

  Widget _bankingSection(String userId, MemberProfile profile) {
    return StreamBuilder<BankingInfo?>(
      stream: _sensitiveInfoService.watchBanking(_clubId, userId),
      builder: (context, snapshot) {
        final info = snapshot.data;
        final iban = info?.iban ?? profile.primaryIban;
        final holder = info?.ibanHolderName ?? profile.fullName;
        return _SectionCard(
          icon: Icons.account_balance_outlined,
          title: 'Coordonnées bancaires',
          intro: 'Pour remboursements du club.',
          children: [
            _InfoRow(
              label: 'IBAN',
              value: iban == null ? 'Non renseigné' : _maskIban(iban),
              muted: iban == null,
            ),
            _InfoRow(label: 'Titulaire', value: holder),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _editBanking(info, profile),
                    icon: const Icon(Icons.edit_outlined),
                    label: const Text('Modifier'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _deleteBanking(userId),
                    icon: const Icon(Icons.delete_outline),
                    label: const Text('Supprimer'),
                  ),
                ),
              ],
            ),
          ],
        );
      },
    );
  }

  Widget _emergencySection(String userId) {
    return StreamBuilder<EmergencyInfo?>(
      stream: _sensitiveInfoService.watchEmergency(_clubId, userId),
      builder: (context, snapshot) {
        final info = snapshot.data ?? const EmergencyInfo();
        return _SectionCard(
          icon: Icons.contact_emergency_outlined,
          title: 'Contacts d’urgence',
          intro:
              'Pour être aidé rapidement en cas de problème pendant une activité.',
          children: [
            if (info.contacts.isEmpty)
              const _MutedText('Aucun contact d’urgence renseigné.')
            else
              ...info.contacts.map(
                (contact) => _EmergencyContactTile(
                  contact: contact,
                  onEdit: () => _editEmergencyContact(userId, info, contact),
                  onDelete: () =>
                      _removeEmergencyContact(userId, info, contact),
                ),
              ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: info.contacts.length >= 3
                  ? null
                  : () => _editEmergencyContact(userId, info, null),
              icon: const Icon(Icons.add),
              label: const Text('Ajouter un contact'),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: info.shareWithStaff,
              title: const Text('Partager avec encadrants et CA si nécessaire'),
              subtitle: Text(_consentLabel(info.consentDate)),
              onChanged: (value) => _saveEmergency(
                userId,
                contacts: info.contacts,
                shareWithStaff: value,
                previousConsentDate: info.consentDate,
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _preferencesSection(MemberProfile profile) {
    return _SectionCard(
      icon: Icons.tune_outlined,
      title: 'Préférences',
      children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.notifications_outlined),
          title: const Text('Notifications'),
          subtitle:
              Text(profile.notificationsEnabled ? 'Activées' : 'Désactivées'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const SettingsScreen()),
          ),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: profile.shareEmail,
          title: const Text('Email visible dans Who’s Who'),
          onChanged: (value) => _updateContactSharing(
            shareEmail: value,
            sharePhone: profile.sharePhone,
          ),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: profile.sharePhone,
          title: const Text('Téléphone visible dans Who’s Who'),
          subtitle:
              const Text('Activé par défaut, désactivable à tout moment.'),
          onChanged: (value) => _updateContactSharing(
            shareEmail: profile.shareEmail,
            sharePhone: value,
          ),
        ),
      ],
    );
  }

  Widget _privacySection(String userId, MemberProfile profile) {
    return StreamBuilder<EmergencyInfo?>(
      stream: _sensitiveInfoService.watchEmergency(_clubId, userId),
      builder: (context, emergencySnap) {
        final emergency = emergencySnap.data;
        return _SectionCard(
          icon: Icons.privacy_tip_outlined,
          title: 'Confidentialité & RGPD',
          children: [
            _ConsentLine(
              label: 'Photo usage interne',
              on: profile.consentInternalPhoto,
              date: profile.consentInternalPhotoDate,
            ),
            _ConsentLine(
              label: 'Photo usage externe',
              on: profile.consentExternalPhoto,
              date: profile.consentExternalPhotoDate,
            ),
            _ConsentLine(
              label: 'Contacts d’urgence staff/CA',
              on: emergency?.shareWithStaff == true,
              date: emergency?.consentDate,
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () => _deleteBanking(userId),
              icon: const Icon(Icons.delete_outline),
              label: const Text('Supprimer coordonnées bancaires'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => _deleteEmergency(userId),
              icon: const Icon(Icons.delete_outline),
              label: const Text('Supprimer contacts d’urgence'),
            ),
          ],
        );
      },
    );
  }

  Widget _medicalSection(String userId) {
    return StreamBuilder<MedicalInfo?>(
      stream: _sensitiveInfoService.watchMedical(_clubId, userId),
      builder: (context, snapshot) {
        final info = snapshot.data ?? const MedicalInfo();
        return _SectionCard(
          icon: Icons.medical_information_outlined,
          title: 'Informations médicales',
          intro:
              'Cette section est facultative. Ces données ne sont visibles que par vous, sauf partage activé ci-dessous.',
          children: [
            _InfoRow(
              label: 'Médication',
              value: info.medication ?? 'Non renseignée',
              muted: info.medication == null,
            ),
            _InfoRow(
              label: 'Allergies',
              value: info.allergies ?? 'Non renseignées',
              muted: info.allergies == null,
            ),
            _InfoRow(
              label: 'Groupe sanguin',
              value: info.bloodGroup ?? '—',
              muted: info.bloodGroup == null,
            ),
            _InfoRow(
              label: 'Notes utiles',
              value: info.notes ?? 'Non renseignées',
              muted: info.notes == null,
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => _editMedical(userId, info),
              icon: const Icon(Icons.edit_outlined),
              label: const Text('Modifier'),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: info.shareWithStaff,
              title:
                  const Text('Partager avec encadrants et CA en cas d’urgence'),
              subtitle: Text(_consentLabel(info.consentDate)),
              onChanged: (value) => _saveMedical(
                userId,
                info: info,
                shareWithStaff: value,
              ),
            ),
            OutlinedButton.icon(
              onPressed: () => _deleteMedical(userId),
              icon: const Icon(Icons.delete_outline),
              label: const Text('Supprimer mes informations médicales'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _editPhone(MemberProfile profile) async {
    final controller = TextEditingController(text: profile.phoneNumber ?? '');
    final result = await _textDialog(
      title: 'Téléphone',
      controller: controller,
      hint: '+32 XXX XX XX XX',
      keyboardType: TextInputType.phone,
    );
    if (result == null) return;
    await _runSave(() => _profileService.updatePhoneNumber(
          _clubId,
          profile.id,
          result.isEmpty ? null : result,
        ));
  }

  Future<void> _editBirthDate(MemberProfile profile) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: profile.birthDate ?? DateTime(now.year - 30),
      firstDate: DateTime(1920),
      lastDate: now,
      locale: const Locale('fr', 'BE'),
    );
    if (picked == null) return;
    await _runSave(
        () => _profileService.updateBirthDate(_clubId, profile.id, picked));
  }

  Future<void> _editAddress(MemberProfile profile) async {
    final street = TextEditingController(
        text: profile.addressStreet ?? profile.legacyAddress ?? '');
    final postcode = TextEditingController(text: profile.addressPostcode ?? '');
    final city = TextEditingController(text: profile.addressCity ?? '');
    final country =
        TextEditingController(text: profile.addressCountry ?? 'Belgique');

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Adresse'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _field(street, 'Rue et numéro'),
              _field(postcode, 'Code postal',
                  keyboardType: TextInputType.number),
              _field(city, 'Commune'),
              _field(country, 'Pays'),
            ],
          ),
        ),
        actions: _dialogActions(ctx),
      ),
    );
    if (ok != true) return;
    await _runSave(() => _profileService.updateAddress(
          _clubId,
          profile.id,
          street: street.text,
          postcode: postcode.text,
          city: city.text,
          country: country.text,
        ));
  }

  Future<void> _editBanking(BankingInfo? info, MemberProfile profile) async {
    final iban =
        TextEditingController(text: info?.iban ?? profile.primaryIban ?? '');
    final holder =
        TextEditingController(text: info?.ibanHolderName ?? profile.fullName);

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Coordonnées bancaires'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _field(iban, 'IBAN'),
            _field(holder, 'Titulaire'),
          ],
        ),
        actions: _dialogActions(ctx),
      ),
    );
    if (ok != true) return;
    if (iban.text.trim().isNotEmpty && !_isValidBelgianIban(iban.text)) {
      _showSnack('IBAN belge invalide', isError: true);
      return;
    }
    await _runSave(() => _sensitiveInfoService.saveBanking(
          _clubId,
          profile.id,
          iban: _cleanIban(iban.text),
          holderName: holder.text,
        ));
  }

  Future<void> _editEmergencyContact(
    String userId,
    EmergencyInfo info,
    EmergencyContact? existing,
  ) async {
    final name = TextEditingController(text: existing?.name ?? '');
    final relation = TextEditingController(text: existing?.relation ?? '');
    final phone = TextEditingController(text: existing?.phone ?? '');
    final email = TextEditingController(text: existing?.email ?? '');
    int priority = existing?.priority ?? info.contacts.length + 1;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(
              existing == null ? 'Ajouter un contact' : 'Contact d’urgence'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _field(name, 'Nom'),
                _field(relation, 'Relation'),
                _field(phone, 'Téléphone', keyboardType: TextInputType.phone),
                _field(email, 'Email',
                    keyboardType: TextInputType.emailAddress),
                Row(
                  children: [
                    const Text('Priorité'),
                    const Spacer(),
                    IconButton(
                      onPressed: priority <= 1
                          ? null
                          : () => setDialogState(() => priority--),
                      icon: const Icon(Icons.remove_circle_outline),
                    ),
                    Text('$priority'),
                    IconButton(
                      onPressed: priority >= 3
                          ? null
                          : () => setDialogState(() => priority++),
                      icon: const Icon(Icons.add_circle_outline),
                    ),
                  ],
                ),
              ],
            ),
          ),
          actions: _dialogActions(ctx),
        ),
      ),
    );
    if (ok != true || name.text.trim().isEmpty || phone.text.trim().isEmpty) {
      return;
    }

    final next = [...info.contacts];
    final contact = EmergencyContact(
      name: name.text.trim(),
      relation: relation.text.trim(),
      phone: phone.text.trim(),
      email: email.text.trim().isEmpty ? null : email.text.trim(),
      priority: priority,
    );
    if (existing == null) {
      next.add(contact);
    } else {
      final index = next.indexOf(existing);
      if (index >= 0) next[index] = contact;
    }
    await _saveEmergency(
      userId,
      contacts: next.take(3).toList(),
      shareWithStaff: info.shareWithStaff,
      previousConsentDate: info.consentDate,
    );
  }

  Future<void> _removeEmergencyContact(
    String userId,
    EmergencyInfo info,
    EmergencyContact contact,
  ) async {
    final next = info.contacts.where((item) => item != contact).toList();
    await _saveEmergency(
      userId,
      contacts: next,
      shareWithStaff: info.shareWithStaff,
      previousConsentDate: info.consentDate,
    );
  }

  Future<void> _editMedical(String userId, MedicalInfo info) async {
    final medication = TextEditingController(text: info.medication ?? '');
    final allergies = TextEditingController(text: info.allergies ?? '');
    final notes = TextEditingController(text: info.notes ?? '');
    String? bloodGroup = info.bloodGroup;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Informations médicales'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _field(medication, 'Médication'),
                _field(allergies, 'Allergies'),
                DropdownButtonFormField<String>(
                  initialValue: bloodGroup,
                  decoration:
                      const InputDecoration(labelText: 'Groupe sanguin'),
                  items: const [
                    'A+',
                    'A-',
                    'B+',
                    'B-',
                    'AB+',
                    'AB-',
                    'O+',
                    'O-'
                  ]
                      .map((value) =>
                          DropdownMenuItem(value: value, child: Text(value)))
                      .toList(),
                  onChanged: (value) =>
                      setDialogState(() => bloodGroup = value),
                ),
                _field(notes, 'Notes utiles', maxLines: 3),
              ],
            ),
          ),
          actions: _dialogActions(ctx),
        ),
      ),
    );
    if (ok != true) return;
    await _saveMedical(
      userId,
      info: info,
      medication: medication.text,
      allergies: allergies.text,
      bloodGroup: bloodGroup,
      notes: notes.text,
    );
  }

  Future<void> _saveEmergency(
    String userId, {
    required List<EmergencyContact> contacts,
    required bool shareWithStaff,
    DateTime? previousConsentDate,
  }) {
    return _runSave(() => _sensitiveInfoService.saveEmergency(
          _clubId,
          userId,
          contacts: contacts,
          shareWithStaff: shareWithStaff,
          previousConsentDate: previousConsentDate,
        ));
  }

  Future<void> _saveMedical(
    String userId, {
    required MedicalInfo info,
    String? medication,
    String? allergies,
    String? bloodGroup,
    String? notes,
    bool? shareWithStaff,
  }) {
    return _runSave(() => _sensitiveInfoService.saveMedical(
          _clubId,
          userId,
          medication: medication ?? info.medication,
          allergies: allergies ?? info.allergies,
          bloodGroup: bloodGroup ?? info.bloodGroup,
          notes: notes ?? info.notes,
          shareWithStaff: shareWithStaff ?? info.shareWithStaff,
          previousConsentDate: info.consentDate,
        ));
  }

  Future<void> _updateContactSharing({
    required bool shareEmail,
    required bool sharePhone,
  }) {
    final userId = context.read<AuthProvider>().currentUser?.uid ?? '';
    return _runSave(() => _profileService.updateContactSharing(
          _clubId,
          userId,
          shareEmail: shareEmail,
          sharePhone: sharePhone,
        ));
  }

  Future<void> _deleteBanking(String userId) async {
    if (!await _confirm('Supprimer les coordonnées bancaires ?')) return;
    await _runSave(() => _sensitiveInfoService.deleteBanking(_clubId, userId));
  }

  Future<void> _deleteEmergency(String userId) async {
    if (!await _confirm('Supprimer les contacts d’urgence ?')) return;
    await _runSave(
        () => _sensitiveInfoService.deleteEmergency(_clubId, userId));
  }

  Future<void> _deleteMedical(String userId) async {
    if (!await _confirm('Supprimer les informations médicales ?')) return;
    await _runSave(() => _sensitiveInfoService.deleteMedical(_clubId, userId));
  }

  Future<void> _runSave(Future<void> Function() action) async {
    try {
      setState(() => _saving = true);
      await action();
      _showSnack('Modifications enregistrées');
    } catch (e) {
      _showSnack('Erreur: $e', isError: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<String?> _textDialog({
    required String title,
    required TextEditingController controller,
    String? hint,
    TextInputType? keyboardType,
  }) {
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          keyboardType: keyboardType,
          decoration: InputDecoration(
            hintText: hint,
            border: const OutlineInputBorder(),
          ),
          autofocus: true,
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Annuler')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Enregistrer'),
          ),
        ],
      ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    TextInputType? keyboardType,
    int maxLines = 1,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: controller,
        keyboardType: keyboardType,
        maxLines: maxLines,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
        ),
      ),
    );
  }

  List<Widget> _dialogActions(BuildContext ctx) {
    return [
      TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Annuler')),
      ElevatedButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Sauver')),
    ];
  }

  Future<bool> _confirm(String message) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirmation'),
        content: Text(message),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Annuler')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Supprimer')),
        ],
      ),
    );
    return result == true;
  }

  void _showSnack(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red : Colors.green,
      ),
    );
  }

  String? _formatDate(DateTime? date) {
    if (date == null) return null;
    return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
  }

  String _consentLabel(DateTime? date) {
    if (date == null) return 'Consentement non donné';
    return 'Consentement: ${_formatDate(date)}';
  }

  String _cleanIban(String value) =>
      value.replaceAll(RegExp(r'\s+'), '').toUpperCase();

  String _maskIban(String value) {
    final clean = _cleanIban(value);
    if (clean.length < 8) return clean;
    return '${clean.substring(0, 2)}** **** **** ${clean.substring(clean.length - 4)}';
  }

  bool _isValidBelgianIban(String value) {
    final clean = _cleanIban(value);
    if (!RegExp(r'^BE\d{14}$').hasMatch(clean)) return false;
    final rearranged = '${clean.substring(4)}${clean.substring(0, 4)}';
    final numeric = rearranged.split('').map((char) {
      final code = char.codeUnitAt(0);
      if (code >= 65 && code <= 90) return (code - 55).toString();
      return char;
    }).join();
    var remainder = 0;
    for (final digit in numeric.split('')) {
      remainder = (remainder * 10 + int.parse(digit)) % 97;
    }
    return remainder == 1;
  }
}

class _Header extends StatelessWidget {
  final MemberProfile profile;
  const _Header({required this.profile});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          ClipOval(
            child: Container(
              width: 58,
              height: 58,
              color: Colors.white.withValues(alpha: 0.20),
              child: profile.hasPhoto
                  ? CachedNetworkImage(
                      imageUrl: profile.photoUrl!, fit: BoxFit.cover)
                  : const Icon(Icons.person, color: Colors.white, size: 30),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  profile.fullName,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 17,
                  ),
                ),
                Text(
                  '${profile.plongeurNiveau ?? '—'} · ${profile.email}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.82)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? intro;
  final List<Widget> children;

  const _SectionCard({
    required this.icon,
    required this.title,
    required this.children,
    this.intro,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: AppColors.donkerblauw.withValues(alpha: 0.16),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: AppColors.middenblauw),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.bold,
                    color: AppColors.donkerblauw,
                  ),
                ),
              ),
            ],
          ),
          if (intro != null) ...[
            const SizedBox(height: 8),
            Text(intro!, style: TextStyle(color: Colors.grey.shade700)),
          ],
          const Divider(height: 22),
          ...children,
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  final String? sub;
  final bool muted;
  final Widget? trailing;

  const _InfoRow({
    required this.label,
    required this.value,
    this.sub,
    this.muted = false,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style:
                        TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: TextStyle(
                    fontSize: 15,
                    fontStyle: muted ? FontStyle.italic : FontStyle.normal,
                    color: muted ? Colors.grey : Colors.black87,
                  ),
                ),
                if (sub != null)
                  Text(sub!,
                      style:
                          TextStyle(fontSize: 11, color: Colors.grey.shade500)),
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class _MutedText extends StatelessWidget {
  final String text;
  const _MutedText(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style:
          TextStyle(color: Colors.grey.shade600, fontStyle: FontStyle.italic),
    );
  }
}

class _EmergencyContactTile extends StatelessWidget {
  final EmergencyContact contact;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const _EmergencyContactTile({
    required this.contact,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(contact.name),
      subtitle: Text('${contact.relation} · ${contact.phone}'),
      trailing: Wrap(
        children: [
          IconButton(onPressed: onEdit, icon: const Icon(Icons.edit_outlined)),
          IconButton(
              onPressed: onDelete, icon: const Icon(Icons.delete_outline)),
        ],
      ),
    );
  }
}

class _ConsentLine extends StatelessWidget {
  final String label;
  final bool on;
  final DateTime? date;

  const _ConsentLine({
    required this.label,
    required this.on,
    this.date,
  });

  @override
  Widget build(BuildContext context) {
    final formattedDate = date == null
        ? null
        : '${date!.day.toString().padLeft(2, '0')}/${date!.month.toString().padLeft(2, '0')}/${date!.year}';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Icon(
            on ? Icons.check_circle : Icons.cancel,
            color: on ? Colors.green : Colors.grey,
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(label)),
          Text(
            on ? (formattedDate ?? 'Oui') : '—',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

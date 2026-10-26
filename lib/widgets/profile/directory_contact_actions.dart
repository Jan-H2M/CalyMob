import 'package:flutter/material.dart';
import '../../models/member_profile.dart';
import '../../utils/directory_contact_visibility.dart';

/// Contact actions use only the consented directory stream, never a private
/// profile or an old list-card snapshot while the current read is pending.
class DirectoryContactActions extends StatelessWidget {
  final Stream<MemberProfile?> profiles;
  final ValueChanged<String> onEmail, onPhone;
  final bool hasPreviousAction;
  const DirectoryContactActions(
      {super.key,
      required this.profiles,
      required this.onEmail,
      required this.onPhone,
      this.hasPreviousAction = false});

  @override
  Widget build(BuildContext context) => StreamBuilder<MemberProfile?>(
        stream: profiles,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return const Text('Coordonnées momentanément indisponibles.');
          }
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Padding(
                padding: EdgeInsets.all(8), child: LinearProgressIndicator());
          }
          final profile = snapshot.data;
          final email = profile != null && canShowDirectoryEmail(profile)
              ? profile.email.trim()
              : '';
          final phone = profile != null && canShowDirectoryPhone(profile)
              ? profile.phoneNumber!.trim()
              : '';
          if (email.isEmpty && phone.isEmpty) {
            return const Text('Aucune coordonnée disponible dans l’annuaire.');
          }
          return Column(mainAxisSize: MainAxisSize.min, children: [
            if (hasPreviousAction) const SizedBox(height: 8),
            if (email.isNotEmpty)
              SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                      key: const Key('directory-contact-email'),
                      onPressed: () => onEmail(email),
                      icon: const Icon(Icons.email),
                      label: const Text('Envoyer un email'))),
            if (email.isNotEmpty && phone.isNotEmpty) const SizedBox(height: 8),
            if (phone.isNotEmpty)
              SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                      key: const Key('directory-contact-phone'),
                      onPressed: () => onPhone(phone),
                      icon: const Icon(Icons.phone),
                      label: Text('Appeler $phone'),
                      style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          foregroundColor: Colors.white))),
          ]);
        },
      );
}

import 'package:flutter/material.dart';
import '../../models/member_profile.dart';
import '../../utils/directory_birthday.dart';

/// An open dialog must also react to a subsequent birthday opt-out. Pending,
/// revoked, missing or unavailable directory data never reuses the list card.
class DirectoryBirthday extends StatelessWidget {
  const DirectoryBirthday({super.key, required this.profiles});

  final Stream<MemberProfile?> profiles;

  @override
  Widget build(BuildContext context) => StreamBuilder<MemberProfile?>(
        stream: profiles,
        builder: (context, snapshot) {
          if (snapshot.hasError ||
              snapshot.connectionState != ConnectionState.active) {
            return const SizedBox.shrink();
          }
          final profile = snapshot.data;
          final label =
              profile == null ? null : formatDirectoryBirthday(profile);
          if (label == null) return const SizedBox.shrink();
          return Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(
              'Anniversaire : $label',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Colors.grey.shade800,
              ),
            ),
          );
        },
      );
}

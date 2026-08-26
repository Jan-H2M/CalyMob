import 'package:flutter/material.dart';

import '../../models/emergency_info.dart';

class EmergencyContactsCard extends StatelessWidget {
  final Stream<EmergencyInfo?> emergencyInfo;
  final Future<void> Function(String phoneNumber) onCall;

  const EmergencyContactsCard({
    super.key,
    required this.emergencyInfo,
    required this.onCall,
  });

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<EmergencyInfo?>(
      stream: emergencyInfo,
      builder: (context, snapshot) {
        // A contact without consent is rejected by Firestore. Keep that state
        // deliberately indistinguishable from "no emergency contact".
        if (snapshot.hasError || !snapshot.hasData) {
          return const SizedBox.shrink();
        }

        final info = snapshot.data!;
        if (!info.shareWithStaff || info.contacts.isEmpty) {
          return const SizedBox.shrink();
        }

        return Container(
          width: double.infinity,
          margin: const EdgeInsets.only(top: 16),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.red.shade50,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.red.shade300, width: 1.5),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.contact_emergency, color: Colors.red.shade700),
                  const SizedBox(width: 8),
                  Text(
                    'CONTACT D’URGENCE',
                    style: TextStyle(
                      color: Colors.red.shade800,
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      letterSpacing: .4,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              ...info.contacts.map(
                (contact) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              contact.name,
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            if (contact.relation.trim().isNotEmpty)
                              Text(
                                contact.relation,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey.shade700,
                                ),
                              ),
                            Text(
                              contact.phone,
                              style: TextStyle(color: Colors.red.shade800),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: 'Appeler ${contact.name}',
                        onPressed: contact.phone.trim().isEmpty
                            ? null
                            : () => onCall(contact.phone),
                        icon: const Icon(Icons.phone),
                        color: Colors.red.shade700,
                      ),
                    ],
                  ),
                ),
              ),
              Text(
                'Visible uniquement par les encadrants et le CA.',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.grey.shade700,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

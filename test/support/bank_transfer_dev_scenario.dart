import 'package:calymob/widgets/event_payment_options_dialog.dart';
import 'package:calymob/widgets/participant_payment_card.dart';
import 'package:flutter/material.dart';

/// The deliberately invalid account prevents generating any payable EPC QR.
class FictionalBankTransfer extends StatelessWidget {
  const FictionalBankTransfer({super.key});

  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'MOB-051 · Virement FICTIF — aucun compte réel, aucun paiement. '
            'Le QR est volontairement invalide. Les copies ne modifient rien.',
          ),
          FilledButton(
            onPressed: () async {
              final choice = await showDialog<String>(
                context: context,
                builder: (_) => const EventPaymentOptionsDialog(
                  amount: 6.62,
                  allowedPaymentMethods: ['qr_email'],
                  installmentLabel: 'Tranche FICTIVE',
                ),
              );
              if (!context.mounted || choice != 'bank_transfer') return;
              await showModalBottomSheet<void>(
                context: context,
                isScrollControlled: true,
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.sizeOf(context).height * .9,
                ),
                builder: (_) => ParticipantPaymentCard(
                  participantFirstName: 'Ada',
                  participantLastName: 'FICTIVE',
                  amount: 6.62,
                  eventTitle: 'Sortie FICTIVE',
                  eventNumber: 'EVT-FICTIF',
                  eventId: 'dev-event',
                  installmentLabel: 'Tranche FICTIVE',
                  clubIban: 'FICTIF-NON-PAYABLE',
                  beneficiaryName: 'CLUB FICTIF',
                  showConfirmButton: false,
                  instructionText: 'Démonstration uniquement. Ne payez rien.',
                  onMarkAsPaid: () => throw StateError('No DEV payment action'),
                ),
              );
            },
            child: const Text('Tester les choix de paiement fictifs'),
          ),
        ],
      );
}

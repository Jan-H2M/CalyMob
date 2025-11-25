import 'package:flutter/material.dart';
import '../screens/profile/privacy_policy_screen.dart';

/// Résultat du dialogue de consentement photo
class PhotoConsentResult {
  final bool internalConsent;
  final bool externalConsent;

  PhotoConsentResult({
    required this.internalConsent,
    required this.externalConsent,
  });
}

/// Dialogue de gestion des consentements photo
class PhotoConsentDialog extends StatefulWidget {
  final bool initialInternalConsent;
  final bool initialExternalConsent;
  final bool isFirstPhoto; // True si c'est la première photo

  const PhotoConsentDialog({
    super.key,
    this.initialInternalConsent = false,
    this.initialExternalConsent = false,
    this.isFirstPhoto = true,
  });

  @override
  State<PhotoConsentDialog> createState() => _PhotoConsentDialogState();
}

class _PhotoConsentDialogState extends State<PhotoConsentDialog> {
  late bool _internalConsent;
  late bool _externalConsent;

  @override
  void initState() {
    super.initState();
    _internalConsent = widget.initialInternalConsent;
    _externalConsent = widget.initialExternalConsent;
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Row(
        children: [
          Icon(
            Icons.privacy_tip,
            color: Theme.of(context).primaryColor,
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Text('Consentement photo'),
          ),
        ],
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (widget.isFirstPhoto) ...[
              const Text(
                'Avant d\'ajouter votre photo, nous avons besoin de votre consentement concernant son utilisation.',
                style: TextStyle(fontSize: 14),
              ),
              const SizedBox(height: 20),
            ],

            // Consentement interne (REQUIS)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: Colors.blue.shade200,
                  width: 1,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.shield,
                        color: Colors.blue.shade700,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Usage interne (REQUIS)',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.blue.shade900,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Votre photo sera visible uniquement par les membres du club Calypso DC dans l\'application mobile et le site web du club.',
                    style: TextStyle(fontSize: 13),
                  ),
                  const SizedBox(height: 12),
                  CheckboxListTile(
                    value: _internalConsent,
                    onChanged: (value) {
                      setState(() {
                        _internalConsent = value ?? false;
                      });
                    },
                    title: const Text(
                      'J\'accepte l\'usage interne de ma photo',
                      style: TextStyle(fontSize: 14),
                    ),
                    controlAffinity: ListTileControlAffinity.leading,
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Consentement externe (OPTIONNEL)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.orange.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: Colors.orange.shade200,
                  width: 1,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.public,
                        color: Colors.orange.shade700,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Usage externe (OPTIONNEL)',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.orange.shade900,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Votre photo pourra être utilisée pour des communications externes : réseaux sociaux, site web public, publications, etc.',
                    style: TextStyle(fontSize: 13),
                  ),
                  const SizedBox(height: 12),
                  CheckboxListTile(
                    value: _externalConsent,
                    onChanged: (value) {
                      setState(() {
                        _externalConsent = value ?? false;
                      });
                    },
                    title: const Text(
                      'J\'accepte l\'usage externe de ma photo',
                      style: TextStyle(fontSize: 14),
                    ),
                    controlAffinity: ListTileControlAffinity.leading,
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Note RGPD avec lien vers politique de confidentialité
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        Icons.info_outline,
                        size: 16,
                        color: Colors.grey.shade700,
                      ),
                      const SizedBox(width: 8),
                      const Expanded(
                        child: Text(
                          'Vous pouvez modifier ces consentements à tout moment depuis votre profil. Vos données sont protégées conformément au RGPD.',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.black87,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  GestureDetector(
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const PrivacyPolicyScreen(),
                        ),
                      );
                    },
                    child: Row(
                      children: [
                        Icon(
                          Icons.privacy_tip,
                          size: 14,
                          color: Theme.of(context).primaryColor,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'Lire la politique de confidentialité',
                          style: TextStyle(
                            fontSize: 12,
                            color: Theme.of(context).primaryColor,
                            decoration: TextDecoration.underline,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Annuler'),
        ),
        ElevatedButton(
          onPressed: _internalConsent
              ? () {
                  Navigator.of(context).pop(
                    PhotoConsentResult(
                      internalConsent: _internalConsent,
                      externalConsent: _externalConsent,
                    ),
                  );
                }
              : null,
          child: const Text('Valider'),
        ),
      ],
    );
  }
}

/// Dialogue simplifié pour modifier les consentements uniquement
class EditConsentDialog extends StatefulWidget {
  final bool currentInternalConsent;
  final bool currentExternalConsent;

  const EditConsentDialog({
    super.key,
    required this.currentInternalConsent,
    required this.currentExternalConsent,
  });

  @override
  State<EditConsentDialog> createState() => _EditConsentDialogState();
}

class _EditConsentDialogState extends State<EditConsentDialog> {
  late bool _internalConsent;
  late bool _externalConsent;

  @override
  void initState() {
    super.initState();
    _internalConsent = widget.currentInternalConsent;
    _externalConsent = widget.currentExternalConsent;
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Modifier les consentements'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SwitchListTile(
            value: _internalConsent,
            onChanged: (value) {
              setState(() {
                _internalConsent = value;
              });
            },
            title: const Text('Usage interne'),
            subtitle: const Text(
              'Visible par les membres du club',
              style: TextStyle(fontSize: 12),
            ),
            secondary: const Icon(Icons.shield),
          ),
          const Divider(),
          SwitchListTile(
            value: _externalConsent,
            onChanged: (value) {
              setState(() {
                _externalConsent = value;
              });
            },
            title: const Text('Usage externe'),
            subtitle: const Text(
              'Réseaux sociaux, site web public',
              style: TextStyle(fontSize: 12),
            ),
            secondary: const Icon(Icons.public),
          ),
          if (!_internalConsent) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.red.shade300, width: 2),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.delete_forever,
                        color: Colors.red.shade700,
                        size: 24,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'ATTENTION: Photo supprimée',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                            color: Colors.red.shade900,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'En retirant le consentement interne, votre photo de profil sera définitivement supprimée de nos serveurs (conformément au RGPD - droit à l\'effacement).',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.red.shade900,
                      height: 1.3,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Vous devrez ajouter une nouvelle photo si vous souhaitez en avoir une à l\'avenir.',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.red.shade900,
                      height: 1.3,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Annuler'),
        ),
        ElevatedButton(
          onPressed: () {
            Navigator.of(context).pop(
              PhotoConsentResult(
                internalConsent: _internalConsent,
                externalConsent: _externalConsent,
              ),
            );
          },
          child: const Text('Enregistrer'),
        ),
      ],
    );
  }
}

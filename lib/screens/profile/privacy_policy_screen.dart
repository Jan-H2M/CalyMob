import 'package:flutter/material.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';

/// Écran de la politique de confidentialité
class PrivacyPolicyScreen extends StatelessWidget {
  const PrivacyPolicyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'Politique de confidentialité',
          style: TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Stack(
        children: [
          // Ocean background
          Positioned.fill(
            child: Image.asset(
              AppAssets.backgroundFull,
              fit: BoxFit.cover,
            ),
          ),
          // Content
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Introduction
                  _buildSection(
                    context,
                    icon: Icons.shield,
                    color: Colors.blue,
                    title: 'Protection de vos données',
                    content:
                        'Le Calypso Diving Club s\'engage à protéger vos données personnelles conformément au Règlement Général sur la Protection des Données (RGPD - UE 2016/679).\n\n'
                        'Cette application mobile collecte et traite uniquement les données nécessaires à la gestion des activités du club.',
                  ),

                  const SizedBox(height: 24),

                  // Responsable du traitement
                  _buildSection(
                    context,
                    icon: Icons.business,
                    color: Colors.purple,
                    title: 'Responsable du traitement',
                    content:
                        'Calypso Diving Club ASBL\n'
                        'Belgique\n\n'
                        'Email: contact@calypsodc.be',
                  ),

                  const SizedBox(height: 24),

                  // Données collectées
                  _buildSection(
                    context,
                    icon: Icons.list_alt,
                    color: Colors.green,
                    title: 'Données collectées',
                    content: 'Nous collectons les données suivantes :',
                    children: [
                      _buildBullet('Nom et prénom'),
                      _buildBullet('Adresse email'),
                      _buildBullet('Numéro de téléphone (optionnel)'),
                      _buildBullet('Niveau de plongée (LIFRAS)'),
                      _buildBullet('Photo de profil (avec consentement)'),
                      _buildBullet('Inscriptions aux activités'),
                      _buildBullet('Notes de frais et justificatifs'),
                    ],
                  ),

                  const SizedBox(height: 24),

                  // Photo de profil - Section détaillée
                  _buildSection(
                    context,
                    icon: Icons.camera_alt,
                    color: Colors.orange,
                    title: 'Photo de profil et consentement',
                    content:
                        'L\'utilisation de votre photo de profil nécessite votre consentement explicite selon deux niveaux :',
                    children: [
                      const SizedBox(height: 12),
                      _buildConsentBox(
                        context,
                        title: 'Usage interne (REQUIS)',
                        icon: Icons.shield,
                        color: Colors.blue,
                        description:
                            'Votre photo sera visible uniquement par les membres du club dans l\'application mobile et le site web réservé aux membres.',
                      ),
                      const SizedBox(height: 12),
                      _buildConsentBox(
                        context,
                        title: 'Usage externe (OPTIONNEL)',
                        icon: Icons.public,
                        color: Colors.orange,
                        description:
                            'Votre photo pourra être utilisée dans les communications externes du club : réseaux sociaux (Facebook, Instagram), site web public, publications, articles de presse, etc.',
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        'Important : Vous pouvez modifier vos consentements à tout moment depuis votre profil. '
                        'Si vous retirez le consentement interne, votre photo sera automatiquement supprimée de nos serveurs.',
                        style: TextStyle(
                          fontSize: 13,
                          fontStyle: FontStyle.italic,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 24),

                  // Détection de visage
                  _buildSection(
                    context,
                    icon: Icons.face,
                    color: Colors.teal,
                    title: 'Détection de visage',
                    content:
                        'Lors de l\'ajout de votre photo de profil, nous utilisons la technologie Google ML Kit Face Detection pour :\n\n'
                        '• Vérifier qu\'un visage est présent sur la photo\n'
                        '• Améliorer le cadrage de la photo\n\n'
                        'Important : Cette analyse se fait localement sur votre appareil. '
                        'Aucune donnée biométrique n\'est stockée sur nos serveurs. '
                        'Seule la photo finale est conservée avec votre consentement.',
                  ),

                  const SizedBox(height: 24),

                  // Finalités du traitement
                  _buildSection(
                    context,
                    icon: Icons.flag,
                    color: Colors.indigo,
                    title: 'Finalités du traitement',
                    content: 'Vos données sont utilisées pour :',
                    children: [
                      _buildBullet('Gestion de votre compte membre'),
                      _buildBullet('Organisation des activités de plongée'),
                      _buildBullet('Communication entre membres'),
                      _buildBullet('Gestion des notes de frais'),
                      _buildBullet('Annuaire interne "Who\'s Who"'),
                      _buildBullet('Envoi de notifications d\'activités'),
                    ],
                  ),

                  const SizedBox(height: 24),

                  // Partage des données
                  _buildSection(
                    context,
                    icon: Icons.share,
                    color: Colors.amber,
                    title: 'Partage de vos données',
                    content:
                        'Vos données personnelles ne sont jamais vendues à des tiers.\n\n'
                        'Partage au sein du club :',
                    children: [
                      _buildBullet(
                          'Votre nom, prénom et niveau de plongée sont visibles par tous les membres'),
                      _buildBullet(
                          'Votre email et téléphone sont visibles selon vos préférences de partage'),
                      _buildBullet(
                          'Votre photo est visible uniquement si vous avez donné votre consentement'),
                      const SizedBox(height: 12),
                      const Text(
                        'Services tiers utilisés :',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                      const SizedBox(height: 8),
                      _buildBullet(
                          'Firebase (Google) : hébergement sécurisé des données'),
                      _buildBullet('Firebase Cloud Messaging : notifications push'),
                      _buildBullet(
                          'Google ML Kit : détection de visage (traitement local uniquement)'),
                    ],
                  ),

                  const SizedBox(height: 24),

                  // Durée de conservation
                  _buildSection(
                    context,
                    icon: Icons.schedule,
                    color: Colors.brown,
                    title: 'Durée de conservation',
                    content:
                        'Vos données sont conservées tant que vous êtes membre actif du club.\n\n'
                        'Après la suppression de votre compte ou votre départ du club, '
                        'vos données personnelles sont supprimées dans un délai de 30 jours, '
                        'sauf obligation légale de conservation (comptabilité, etc.).',
                  ),

                  const SizedBox(height: 24),

                  // Vos droits RGPD
                  _buildSection(
                    context,
                    icon: Icons.verified_user,
                    color: Colors.red,
                    title: 'Vos droits RGPD',
                    content: 'Conformément au RGPD, vous disposez des droits suivants :',
                    children: [
                      _buildRightItem(
                        context,
                        title: 'Droit d\'accès',
                        description:
                            'Vous pouvez consulter toutes vos données personnelles',
                        article: 'Article 15',
                      ),
                      _buildRightItem(
                        context,
                        title: 'Droit de rectification',
                        description:
                            'Vous pouvez modifier vos informations depuis votre profil',
                        article: 'Article 16',
                      ),
                      _buildRightItem(
                        context,
                        title: 'Droit à l\'effacement',
                        description:
                            'Vous pouvez demander la suppression de votre compte',
                        article: 'Article 17',
                      ),
                      _buildRightItem(
                        context,
                        title: 'Droit à la limitation',
                        description: 'Vous pouvez limiter le traitement de vos données',
                        article: 'Article 18',
                      ),
                      _buildRightItem(
                        context,
                        title: 'Droit de retrait du consentement',
                        description:
                            'Vous pouvez retirer vos consentements à tout moment',
                        article: 'Article 7(3)',
                      ),
                      _buildRightItem(
                        context,
                        title: 'Droit à la portabilité',
                        description:
                            'Vous pouvez récupérer vos données dans un format structuré',
                        article: 'Article 20',
                      ),
                      _buildRightItem(
                        context,
                        title: 'Droit d\'opposition',
                        description:
                            'Vous pouvez vous opposer au traitement de vos données',
                        article: 'Article 21',
                      ),
                    ],
                  ),

                  const SizedBox(height: 24),

                  // Sécurité
                  _buildSection(
                    context,
                    icon: Icons.lock,
                    color: Colors.deepPurple,
                    title: 'Sécurité des données',
                    content:
                        'Nous mettons en œuvre des mesures techniques et organisationnelles appropriées :',
                    children: [
                      _buildBullet('Chiffrement des données en transit (HTTPS/TLS)'),
                      _buildBullet('Hébergement sécurisé sur Firebase (Google Cloud)'),
                      _buildBullet('Authentification sécurisée (Firebase Auth)'),
                      _buildBullet('Règles de sécurité Firestore et Storage'),
                      _buildBullet('Accès limité aux données selon les rôles'),
                      _buildBullet('Sauvegardes régulières'),
                    ],
                  ),

                  const SizedBox(height: 24),

                  // Contact
                  _buildSection(
                    context,
                    icon: Icons.contact_mail,
                    color: Colors.cyan,
                    title: 'Exercer vos droits',
                    content:
                        'Pour toute question sur vos données personnelles ou pour exercer vos droits RGPD, '
                        'contactez-nous :\n\n'
                        'Email: contact@calypsodc.be\n\n'
                        'Nous nous engageons à répondre dans un délai d\'un mois maximum.\n\n'
                        'En cas de litige, vous pouvez introduire une réclamation auprès de l\'Autorité de Protection des Données (APD) de Belgique : https://www.autoriteprotectiondonnees.be',
                  ),

                  const SizedBox(height: 24),

                  // Modifications
                  _buildSection(
                    context,
                    icon: Icons.update,
                    color: Colors.blueGrey,
                    title: 'Modifications de la politique',
                    content:
                        'Cette politique de confidentialité peut être mise à jour. '
                        'La date de dernière modification est indiquée ci-dessous. '
                        'Les modifications importantes vous seront notifiées par email ou via l\'application.',
                  ),

                  const SizedBox(height: 24),

                  // Date de dernière mise à jour
                  Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.9),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        'Dernière mise à jour : ${DateTime.now().day}/${DateTime.now().month}/${DateTime.now().year}',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.donkerblauw,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 40),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSection(
    BuildContext context, {
    required IconData icon,
    required Color color,
    required String title,
    required String content,
    List<Widget>? children,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.9),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, color: color, size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: AppColors.donkerblauw,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            content,
            style: TextStyle(
              fontSize: 14,
              height: 1.5,
              color: AppColors.donkerblauw,
            ),
          ),
          if (children != null) ...children,
        ],
      ),
    );
  }

  Widget _buildBullet(String text) {
    return Padding(
      padding: const EdgeInsets.only(left: 16, top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('• ', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.donkerblauw)),
          Expanded(
            child: Text(
              text,
              style: TextStyle(fontSize: 14, height: 1.4, color: AppColors.donkerblauw),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildConsentBox(
    BuildContext context, {
    required String title,
    required IconData icon,
    required Color color,
    required String description,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(width: 8),
              Text(
                title,
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: color,
                  fontSize: 14,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            description,
            style: TextStyle(fontSize: 13, height: 1.4, color: AppColors.donkerblauw),
          ),
        ],
      ),
    );
  }

  Widget _buildRightItem(
    BuildContext context, {
    required String title,
    required String description,
    required String article,
  }) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.red.shade100,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  article,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    color: Colors.red.shade900,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                    color: AppColors.donkerblauw,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.only(left: 16),
            child: Text(
              description,
              style: TextStyle(fontSize: 13, height: 1.3, color: AppColors.donkerblauw),
            ),
          ),
        ],
      ),
    );
  }
}

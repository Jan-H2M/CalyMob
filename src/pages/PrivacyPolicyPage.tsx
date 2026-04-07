import React from 'react';
import {
  privacyPolicyMeta,
  privacyPolicySectionsContent,
} from '@/content/publicDocumentation';

export function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md p-8">
        <div className="text-center mb-8">
          <img
            src="/logo_caly.png"
            alt="Calypso Diving Club"
            className="h-16 mx-auto mb-4"
          />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">
            Politique de Confidentialité
          </h1>
          <p className="text-gray-500 dark:text-dark-text-muted mt-2">CalyMob & CalyCompta</p>
          <p className="text-sm text-gray-400 dark:text-dark-text-muted">
            Dernière mise à jour : {privacyPolicyMeta.updatedAt}
          </p>
        </div>

        <div className="prose prose-blue max-w-none">
          {privacyPolicySectionsContent.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
                {section.title}
              </h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="text-gray-600 dark:text-dark-text-secondary mb-4">
                  {paragraph}
                </p>
              ))}
              {section.bullets && (
                <ul className="list-disc pl-6 text-gray-600 dark:text-dark-text-secondary mb-4">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <h2 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
            10. Contact détaillé
          </h2>
          <p className="text-gray-600 dark:text-dark-text-secondary mb-4">
            <strong>Email :</strong>{' '}
            <a href={`mailto:${privacyPolicyMeta.contactEmail}`} className="text-blue-600 hover:underline">
              {privacyPolicyMeta.contactEmail}
            </a>
            <br />
            <strong>Club :</strong> Calypso Diving Club
            <br />
            <strong>Site web :</strong>{' '}
            <a href={privacyPolicyMeta.siteUrl} className="text-blue-600 hover:underline">
              {privacyPolicyMeta.siteUrl}
            </a>
            <br />
            <strong>Politique publique :</strong>{' '}
            <a href={privacyPolicyMeta.officialPolicyUrl} className="text-blue-600 hover:underline">
              {privacyPolicyMeta.officialPolicyUrl}
            </a>
          </p>
          <p className="text-gray-600 dark:text-dark-text-secondary mb-4">
            Nous nous engageons à répondre à votre demande dans un délai d&apos;un mois maximum.
          </p>

          <h2 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
            11. Réclamations
          </h2>
          <p className="text-gray-600 dark:text-dark-text-secondary mb-4">
            Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire
            une réclamation auprès de l'Autorité de Protection des Données (APD) de Belgique :
          </p>
          <p className="text-gray-600 dark:text-dark-text-secondary mb-4">
            <strong>Autorité de Protection des Données</strong><br />
            Rue de la Presse 35, 1000 Bruxelles<br />
            <a href="https://www.autoriteprotectiondonnees.be" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">www.autoriteprotectiondonnees.be</a><br />
            <a href="mailto:contact@apd-gba.be" className="text-blue-600 hover:underline">contact@apd-gba.be</a>
          </p>

          <h2 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
            12. Modifications
          </h2>
          <p className="text-gray-600 dark:text-dark-text-secondary mb-4">
            Nous pouvons mettre à jour cette politique de confidentialité de temps
            à autre. Nous vous informerons de tout changement important via l'application
            ou par email.
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-dark-border text-center">
          <p className="text-sm text-gray-500 dark:text-dark-text-muted">
            © {new Date().getFullYear()} Calypso Diving Club. Tous droits réservés.
          </p>
          <a
            href="https://caly.club"
            className="text-sm text-blue-600 hover:underline mt-2 inline-block"
          >
            Retour au site
          </a>
        </div>
      </div>
    </div>
  );
}

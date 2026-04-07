import React from 'react';
import { Link } from 'react-router-dom';
import { Smartphone, Monitor, ChevronRight, BookOpen } from 'lucide-react';
import { PublicNavbar } from '@/components/public/PublicNavbar';
import { PublicFooter } from '@/components/public/PublicFooter';
import '@/styles/nautical.css';

export function DocsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#f0f9ff]">
      <PublicNavbar />

      {/* Header */}
      <section className="bg-gradient-to-br from-[#006DB6] to-[#183868] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <BookOpen size={48} className="text-white mx-auto mb-4" />
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Documentation
          </h1>
          <p className="text-[#6BCBE8] text-lg max-w-2xl mx-auto">
            Guides d'utilisation pour CalyMob et CalyCompta
          </p>
        </div>
      </section>

      {/* Documentation Cards */}
      <section className="py-12 flex-grow">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8">
            {/* CalyMob Docs */}
            <Link
              to="/docs/calymob"
              className="nautical-card group cursor-pointer"
            >
              <div className="flex items-center mb-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#6BCBE8] to-[#006DB6] flex items-center justify-center mr-4">
                  <Smartphone size={28} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#183868] group-hover:text-[#006DB6] transition-colors">
                    CalyMob
                  </h2>
                  <p className="text-[#006DB6] text-sm">Application Mobile</p>
                </div>
              </div>

              <p className="text-gray-600 dark:text-dark-text-secondary mb-4">
                Guide complet pour utiliser l'application mobile CalyMob :
                inscription aux événements, paiements, notifications, et plus.
              </p>

              <div className="flex items-center text-[#006DB6] font-medium group-hover:translate-x-2 transition-transform">
                Consulter la documentation
                <ChevronRight size={20} className="ml-1" />
              </div>
            </Link>

            {/* CalyCompta Docs */}
            <Link
              to="/docs/calycompta"
              className="nautical-card group cursor-pointer"
            >
              <div className="flex items-center mb-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#F6921E] to-[#d97706] flex items-center justify-center mr-4">
                  <Monitor size={28} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#183868] group-hover:text-[#F6921E] transition-colors">
                    CalyCompta
                  </h2>
                  <p className="text-[#F6921E] text-sm">Application Web</p>
                </div>
              </div>

              <p className="text-gray-600 dark:text-dark-text-secondary mb-4">
                Guide pour les administrateurs : gestion des membres, comptabilité,
                événements, et communications.
              </p>

              <div className="flex items-center text-[#F6921E] font-medium group-hover:translate-x-2 transition-transform">
                Consulter la documentation
                <ChevronRight size={20} className="ml-1" />
              </div>
            </Link>
          </div>

          {/* Quick Start */}
          <div className="mt-12 p-8 bg-white rounded-xl shadow-sm">
            <h3 className="text-xl font-semibold text-[#183868] mb-4">
              Démarrage Rapide
            </h3>
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-[#006DB6] mb-2">Pour les membres</h4>
                <ol className="text-sm text-gray-600 dark:text-dark-text-secondary space-y-2">
                  <li className="flex items-start">
                    <span className="w-5 h-5 rounded-full bg-[#006DB6] text-white text-xs flex items-center justify-center mr-2 mt-0.5">1</span>
                    Téléchargez CalyMob sur votre téléphone
                  </li>
                  <li className="flex items-start">
                    <span className="w-5 h-5 rounded-full bg-[#006DB6] text-white text-xs flex items-center justify-center mr-2 mt-0.5">2</span>
                    Connectez-vous avec vos identifiants
                  </li>
                  <li className="flex items-start">
                    <span className="w-5 h-5 rounded-full bg-[#006DB6] text-white text-xs flex items-center justify-center mr-2 mt-0.5">3</span>
                    Activez les notifications
                  </li>
                  <li className="flex items-start">
                    <span className="w-5 h-5 rounded-full bg-[#006DB6] text-white text-xs flex items-center justify-center mr-2 mt-0.5">4</span>
                    Inscrivez-vous aux événements !
                  </li>
                </ol>
              </div>
              <div>
                <h4 className="font-medium text-[#F6921E] mb-2">Pour les administrateurs</h4>
                <ol className="text-sm text-gray-600 dark:text-dark-text-secondary space-y-2">
                  <li className="flex items-start">
                    <span className="w-5 h-5 rounded-full bg-[#F6921E] text-white text-xs flex items-center justify-center mr-2 mt-0.5">1</span>
                    Accédez à CalyCompta via votre navigateur
                  </li>
                  <li className="flex items-start">
                    <span className="w-5 h-5 rounded-full bg-[#F6921E] text-white text-xs flex items-center justify-center mr-2 mt-0.5">2</span>
                    Connectez-vous avec vos identifiants admin
                  </li>
                  <li className="flex items-start">
                    <span className="w-5 h-5 rounded-full bg-[#F6921E] text-white text-xs flex items-center justify-center mr-2 mt-0.5">3</span>
                    Explorez le tableau de bord
                  </li>
                  <li className="flex items-start">
                    <span className="w-5 h-5 rounded-full bg-[#F6921E] text-white text-xs flex items-center justify-center mr-2 mt-0.5">4</span>
                    Consultez la documentation pour chaque module
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

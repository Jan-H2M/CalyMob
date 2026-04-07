import React from 'react';
import { Link } from 'react-router-dom';
import {
  Smartphone,
  Monitor,
  HelpCircle,
  BookOpen,
  Mail,
  MapPin,
  ChevronRight
} from 'lucide-react';
import { PublicNavbar } from '@/components/public/PublicNavbar';
import { PublicFooter } from '@/components/public/PublicFooter';
import '@/styles/nautical.css';

// Bubble animation component
function Bubbles() {
  return (
    <div className="bubbles-container">
      <div className="bubble" />
      <div className="bubble" />
      <div className="bubble" />
      <div className="bubble" />
      <div className="bubble" />
      <div className="bubble" />
      <div className="bubble" />
      <div className="bubble" />
    </div>
  );
}

// Animated wave SVG
function WaveSection() {
  return (
    <svg
      className="absolute bottom-0 left-0 w-full"
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
    >
      <path
        fill="#f0f9ff"
        d="M0,60 C240,120 480,0 720,60 C960,120 1200,30 1440,80 L1440,120 L0,120 Z"
      >
        <animate
          attributeName="d"
          dur="8s"
          repeatCount="indefinite"
          values="
            M0,60 C240,120 480,0 720,60 C960,120 1200,30 1440,80 L1440,120 L0,120 Z;
            M0,80 C240,30 480,100 720,50 C960,0 1200,90 1440,60 L1440,120 L0,120 Z;
            M0,60 C240,120 480,0 720,60 C960,120 1200,30 1440,80 L1440,120 L0,120 Z
          "
        />
      </path>
    </svg>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#f0f9ff]">
      <PublicNavbar />

      {/* Hero Section */}
      <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#006DB6] via-[#005a96] to-[#183868]">
        <Bubbles />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <img
            src="/logo-vertical.png"
            alt="Calypso Diving Club"
            className="h-32 w-auto mx-auto mb-8 drop-shadow-lg"
          />

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4">
            Calypso Diving Club
          </h1>

          <p className="text-xl sm:text-2xl text-[#6BCBE8] font-medium mb-2">
            ASBL
          </p>

          <div className="flex items-center justify-center text-white/80 text-sm sm:text-base mb-8">
            <MapPin size={18} className="mr-2" />
            <span>Av. Léopold Wiener 60, 1170 Bruxelles</span>
          </div>

          <p className="text-lg text-white/90 max-w-2xl mx-auto mb-10">
            Bienvenue sur le portail digital du Calypso Diving Club.
            Découvrez nos applications pour les membres et les administrateurs.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/docs/calymob"
              className="glossy-button inline-flex items-center justify-center"
            >
              <Smartphone size={20} className="mr-2" />
              Découvrir CalyMob
            </Link>
            <a
              href="https://calypsodiving.be/"
              target="_blank"
              rel="noopener noreferrer"
              className="glossy-button glossy-button-orange inline-flex items-center justify-center"
            >
              Visiter le site du club
              <ChevronRight size={20} className="ml-1" />
            </a>
          </div>
        </div>

        <WaveSection />
      </section>

      {/* Apps Section */}
      <section className="py-20 bg-[#f0f9ff]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-[#183868] text-center mb-4">
            Nos Applications
          </h2>
          <p className="text-gray-600 dark:text-dark-text-secondary text-center mb-12 max-w-2xl mx-auto">
            Deux outils complémentaires pour faciliter la vie du club
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            {/* CalyMob Card */}
            <div className="nautical-card flex flex-col">
              <div className="flex items-center mb-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#6BCBE8] to-[#006DB6] flex items-center justify-center mr-4">
                  <Smartphone size={28} className="text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[#183868]">CalyMob</h3>
                  <p className="text-[#006DB6] text-sm">Application Mobile</p>
                </div>
              </div>

              <p className="text-gray-600 dark:text-dark-text-secondary mb-6">
                L'application mobile pour tous les membres du club. Inscrivez-vous aux événements,
                consultez le planning piscine, et restez informé des actualités du club.
              </p>

              <div className="space-y-2 mb-6">
                <div className="flex items-center text-sm text-gray-600 dark:text-dark-text-secondary">
                  <ChevronRight size={16} className="text-[#006DB6] mr-2" />
                  Inscription aux plongées et événements
                </div>
                <div className="flex items-center text-sm text-gray-600 dark:text-dark-text-secondary">
                  <ChevronRight size={16} className="text-[#006DB6] mr-2" />
                  Planning des séances piscine
                </div>
                <div className="flex items-center text-sm text-gray-600 dark:text-dark-text-secondary">
                  <ChevronRight size={16} className="text-[#006DB6] mr-2" />
                  Notifications et communications
                </div>
                <div className="flex items-center text-sm text-gray-600 dark:text-dark-text-secondary">
                  <ChevronRight size={16} className="text-[#006DB6] mr-2" />
                  Paiement simplifié par QR code
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-auto">
                <a
                  href="https://apps.apple.com/be/app/calymob/id6755293289?l=fr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-opacity hover:opacity-80"
                >
                  <img
                    src="/badge-app-store-fr.svg"
                    alt="Télécharger sur l'App Store"
                    className="h-[50px] w-auto"
                  />
                </a>
                <a
                  href="https://play.google.com/store/apps/details?id=club.caly.calymob&hl=fr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-opacity hover:opacity-80"
                >
                  <img
                    src="/badge-google-play-fr.svg"
                    alt="Disponible sur Google Play"
                    className="h-[50px] w-auto"
                  />
                </a>
              </div>
            </div>

            {/* CalyCompta Card */}
            <div className="nautical-card flex flex-col">
              <div className="flex items-center mb-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#F6921E] to-[#d97706] flex items-center justify-center mr-4">
                  <Monitor size={28} className="text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[#183868]">CalyCompta</h3>
                  <p className="text-[#F6921E] text-sm">Application Web</p>
                </div>
              </div>

              <p className="text-gray-600 dark:text-dark-text-secondary mb-6">
                L'interface d'administration pour les responsables du club. Gérez les membres,
                les finances, les événements et les communications du club.
              </p>

              <div className="space-y-2 mb-6">
                <div className="flex items-center text-sm text-gray-600 dark:text-dark-text-secondary">
                  <ChevronRight size={16} className="text-[#F6921E] mr-2" />
                  Gestion des membres et cotisations
                </div>
                <div className="flex items-center text-sm text-gray-600 dark:text-dark-text-secondary">
                  <ChevronRight size={16} className="text-[#F6921E] mr-2" />
                  Comptabilité et transactions bancaires
                </div>
                <div className="flex items-center text-sm text-gray-600 dark:text-dark-text-secondary">
                  <ChevronRight size={16} className="text-[#F6921E] mr-2" />
                  Création et gestion des événements
                </div>
                <div className="flex items-center text-sm text-gray-600 dark:text-dark-text-secondary">
                  <ChevronRight size={16} className="text-[#F6921E] mr-2" />
                  Envoi de communications (email, push)
                </div>
              </div>

              <div className="mt-auto">
                <Link
                  to="/connexion"
                  className="inline-flex items-center justify-center w-full sm:w-auto px-6 py-3 bg-[#183868] text-white rounded-lg hover:bg-[#0f2444] transition-colors"
                >
                  <Monitor size={20} className="mr-2" />
                  Accès Administrateurs
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Links Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-3 gap-6">
            <Link
              to="/faq"
              className="flex items-center p-6 rounded-xl border-2 border-gray-100 hover:border-[#006DB6] hover:shadow-lg transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-[#006DB6]/10 flex items-center justify-center mr-4 group-hover:bg-[#006DB6] transition-colors">
                <HelpCircle size={24} className="text-[#006DB6] group-hover:text-white transition-colors" />
              </div>
              <div>
                <h3 className="font-semibold text-[#183868]">FAQ</h3>
                <p className="text-sm text-gray-500 dark:text-dark-text-muted">Questions fréquentes</p>
              </div>
            </Link>

            <Link
              to="/docs"
              className="flex items-center p-6 rounded-xl border-2 border-gray-100 hover:border-[#006DB6] hover:shadow-lg transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-[#006DB6]/10 flex items-center justify-center mr-4 group-hover:bg-[#006DB6] transition-colors">
                <BookOpen size={24} className="text-[#006DB6] group-hover:text-white transition-colors" />
              </div>
              <div>
                <h3 className="font-semibold text-[#183868]">Documentation</h3>
                <p className="text-sm text-gray-500 dark:text-dark-text-muted">Guides d'utilisation</p>
              </div>
            </Link>

            <Link
              to="/aide"
              className="flex items-center p-6 rounded-xl border-2 border-gray-100 hover:border-[#006DB6] hover:shadow-lg transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-[#006DB6]/10 flex items-center justify-center mr-4 group-hover:bg-[#006DB6] transition-colors">
                <Mail size={24} className="text-[#006DB6] group-hover:text-white transition-colors" />
              </div>
              <div>
                <h3 className="font-semibold text-[#183868]">Besoin d'aide ?</h3>
                <p className="text-sm text-gray-500 dark:text-dark-text-muted">Contactez-nous</p>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

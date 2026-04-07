import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, MapPin, ExternalLink } from 'lucide-react';

export function PublicFooter() {
  return (
    <footer className="bg-[#183868] text-white">
      {/* Wave SVG at top */}
      <svg
        className="w-full h-16 -mb-1"
        viewBox="0 0 1440 100"
        preserveAspectRatio="none"
      >
        <path
          fill="#183868"
          d="M0,50 C360,100 720,0 1080,50 C1260,75 1380,50 1440,50 L1440,100 L0,100 Z"
        />
      </svg>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Club Info */}
          <div>
            <img
              src="/logo-vertical.png"
              alt="Calypso Diving Club"
              className="h-16 w-auto mb-4 brightness-0 invert"
            />
            <h3 className="text-lg font-semibold mb-2">Calypso Diving Club ASBL</h3>
            <div className="flex items-start space-x-2 text-gray-300 text-sm mb-2">
              <MapPin size={16} className="mt-0.5 flex-shrink-0" />
              <span>Av. Léopold Wiener 60, 1170 Bruxelles</span>
            </div>
            <div className="flex items-center space-x-2 text-gray-300 text-sm">
              <Mail size={16} className="flex-shrink-0" />
              <a
                href="mailto:calypsodivingclub@gmail.com"
                className="hover:text-[#6BCBE8] transition-colors"
              >
                calypsodivingclub@gmail.com
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Liens rapides</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/faq" className="text-gray-300 hover:text-[#6BCBE8] transition-colors">
                  Questions fréquentes
                </Link>
              </li>
              <li>
                <Link to="/docs" className="text-gray-300 hover:text-[#6BCBE8] transition-colors">
                  Documentation
                </Link>
              </li>
              <li>
                <Link to="/aide" className="text-gray-300 hover:text-[#6BCBE8] transition-colors">
                  Besoin d'aide ?
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-gray-300 hover:text-[#6BCBE8] transition-colors">
                  Politique de confidentialité
                </Link>
              </li>
            </ul>
          </div>

          {/* External Links */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Liens externes</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://calypsodiving.be/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-[#6BCBE8] transition-colors inline-flex items-center"
                >
                  Site principal du club
                  <ExternalLink size={14} className="ml-1" />
                </a>
              </li>
              <li>
                <a
                  href="https://apps.apple.com/be/app/calymob/id6755293289?l=fr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-[#6BCBE8] transition-colors inline-flex items-center"
                >
                  CalyMob sur App Store
                  <ExternalLink size={14} className="ml-1" />
                </a>
              </li>
              <li>
                <a
                  href="https://play.google.com/store/apps/details?id=club.caly.calymob&hl=fr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-[#6BCBE8] transition-colors inline-flex items-center"
                >
                  CalyMob sur Google Play
                  <ExternalLink size={14} className="ml-1" />
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-white/20 text-center text-sm text-gray-400 dark:text-dark-text-muted">
          <p>&copy; {new Date().getFullYear()} Calypso Diving Club ASBL. Tous droits réservés.</p>
        </div>
      </div>
    </footer>
  );
}

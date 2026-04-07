import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

export function PublicNavbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  const navLinks = [
    { path: '/', label: 'Accueil' },
    { path: '/faq', label: 'FAQ' },
    { path: '/docs', label: 'Documentation' },
    { path: '/aide', label: 'Aide' },
    { path: '/privacy', label: 'Confidentialité' },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="bg-white/95 backdrop-blur-sm shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-3">
            <img
              src="/logo-vertical.png"
              alt="Calypso Diving Club"
              className="h-10 w-auto"
            />
            <span className="text-lg font-semibold text-[#183868] hidden sm:block">
              Calypso Diving Club
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.path)
                    ? 'bg-[#006DB6]/10 text-[#006DB6]'
                    : 'text-[#183868] hover:bg-gray-100 dark:bg-dark-bg-tertiary'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/connexion"
              className="ml-4 px-4 py-2 bg-[#006DB6] text-white rounded-lg text-sm font-medium hover:bg-[#005a96] transition-colors"
            >
              Admin
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden p-2 rounded-lg text-[#183868] hover:bg-gray-100 dark:bg-dark-bg-tertiary"
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-100">
            <div className="flex flex-col space-y-2">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setIsMenuOpen(false)}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    isActive(link.path)
                      ? 'bg-[#006DB6]/10 text-[#006DB6]'
                      : 'text-[#183868] hover:bg-gray-100 dark:bg-dark-bg-tertiary'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                to="/connexion"
                onClick={() => setIsMenuOpen(false)}
                className="mx-4 mt-2 px-4 py-3 bg-[#006DB6] text-white rounded-lg text-sm font-medium text-center hover:bg-[#005a96] transition-colors"
              >
                Accès Admin
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

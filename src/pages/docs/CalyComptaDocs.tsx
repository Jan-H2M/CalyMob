import React from 'react';
import { Link } from 'react-router-dom';
import {
  Monitor,
  ChevronLeft,
  Users,
  Wallet,
  Calendar,
  Mail,
  BarChart3,
  Settings,
  ShieldCheck,
  HelpCircle
} from 'lucide-react';
import { PublicNavbar } from '@/components/public/PublicNavbar';
import { PublicFooter } from '@/components/public/PublicFooter';
import { calyComptaDocSectionsContent } from '@/content/publicDocumentation';
import '@/styles/nautical.css';

interface DocSection {
  icon: React.ReactNode;
  title: string;
  content: string;
}

const sectionIcons = {
  dashboard: <BarChart3 size={24} />,
  members: <Users size={24} />,
  accounting: <Wallet size={24} />,
  communication: <Mail size={24} />,
  settings: <Settings size={24} />,
  security: <ShieldCheck size={24} />,
} as const;

const docSections: DocSection[] = calyComptaDocSectionsContent.map((section) => ({
  icon: sectionIcons[section.icon],
  title: section.title,
  content: section.content,
}));

export function CalyComptaDocs() {
  return (
    <div className="min-h-screen flex flex-col bg-[#f0f9ff]">
      <PublicNavbar />

      {/* Header */}
      <section className="bg-gradient-to-br from-[#F6921E] to-[#d97706] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            to="/docs"
            className="inline-flex items-center text-white/80 hover:text-white mb-4 transition-colors"
          >
            <ChevronLeft size={20} className="mr-1" />
            Retour à la documentation
          </Link>
          <div className="flex items-center">
            <div className="w-16 h-16 rounded-xl bg-white/20 flex items-center justify-center mr-4">
              <Monitor size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white">
                CalyCompta
              </h1>
              <p className="text-white/80">Guide d'administration</p>
            </div>
          </div>
        </div>
      </section>

      {/* Table of Contents */}
      <section className="py-8 bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-dark-text-muted uppercase mb-3">Sommaire</h2>
          <div className="flex flex-wrap gap-2">
            {docSections.map((section, index) => (
              <a
                key={index}
                href={`#section-${index}`}
                className="px-3 py-1.5 bg-gray-100 dark:bg-dark-bg-tertiary hover:bg-[#F6921E] hover:text-white rounded-full text-sm text-gray-600 dark:text-dark-text-secondary transition-colors"
              >
                {section.title}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Documentation Content */}
      <section className="py-12 flex-grow">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {docSections.map((section, index) => (
            <div
              key={index}
              id={`section-${index}`}
              className="mb-8 scroll-mt-24"
            >
              <div className="nautical-card">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 rounded-lg bg-[#F6921E] flex items-center justify-center mr-3 text-white">
                    {section.icon}
                  </div>
                  <h2 className="text-xl font-bold text-[#183868]">{section.title}</h2>
                </div>
                <div className="text-gray-600 dark:text-dark-text-secondary whitespace-pre-line leading-relaxed">
                  {section.content}
                </div>
              </div>
            </div>
          ))}

          {/* Help CTA */}
          <div className="mt-12 p-8 bg-gradient-to-br from-[#F6921E] to-[#d97706] rounded-xl text-center">
            <HelpCircle size={40} className="text-white mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              Besoin d'aide supplémentaire ?
            </h3>
            <p className="text-white/80 mb-4">
              Notre équipe est là pour vous accompagner
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/faq"
                className="px-6 py-3 bg-white text-[#F6921E] rounded-lg font-medium hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors"
              >
                Consulter la FAQ
              </Link>
              <Link
                to="/aide"
                className="px-6 py-3 bg-white/20 text-white rounded-lg font-medium hover:bg-white/30 transition-colors"
              >
                Nous contacter
              </Link>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

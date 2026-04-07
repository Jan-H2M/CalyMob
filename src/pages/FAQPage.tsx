import React, { useState } from 'react';
import { ChevronDown, Smartphone, Monitor, HelpCircle } from 'lucide-react';
import { PublicNavbar } from '@/components/public/PublicNavbar';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Link } from 'react-router-dom';
import { faqSectionsContent } from '@/content/publicDocumentation';
import '@/styles/nautical.css';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSection {
  title: string;
  icon: React.ReactNode;
  items: FAQItem[];
}

const sectionIcons = {
  mobile: <Smartphone size={24} />,
  web: <Monitor size={24} />,
  general: <HelpCircle size={24} />,
} as const;

const faqSections: FAQSection[] = faqSectionsContent.map((section) => ({
  title: section.title,
  icon: sectionIcons[section.icon],
  items: section.items,
}));

function FAQAccordion({ item }: { item: FAQItem }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-4 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary transition-colors rounded-lg px-4 -mx-4"
      >
        <span className="font-medium text-[#183868] pr-4">{item.question}</span>
        <ChevronDown
          size={20}
          className={`text-[#006DB6] flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="pb-4 px-4 -mx-4 text-gray-600 dark:text-dark-text-secondary text-sm leading-relaxed">
          {item.answer}
        </div>
      )}
    </div>
  );
}

export function FAQPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#f0f9ff]">
      <PublicNavbar />

      {/* Header */}
      <section className="bg-gradient-to-br from-[#006DB6] to-[#183868] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Questions Fréquentes
          </h1>
          <p className="text-[#6BCBE8] text-lg max-w-2xl mx-auto">
            Trouvez rapidement les réponses à vos questions sur CalyMob et CalyCompta
          </p>
        </div>
      </section>

      {/* FAQ Content */}
      <section className="py-12 flex-grow">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {faqSections.map((section, index) => (
            <div key={index} className="mb-8">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 rounded-lg bg-[#006DB6] flex items-center justify-center mr-3 text-white">
                  {section.icon}
                </div>
                <h2 className="text-xl font-bold text-[#183868]">{section.title}</h2>
              </div>
              <div className="nautical-card">
                {section.items.map((item, itemIndex) => (
                  <FAQAccordion key={itemIndex} item={item} />
                ))}
              </div>
            </div>
          ))}

          {/* Contact CTA */}
          <div className="mt-12 text-center p-8 bg-white rounded-xl shadow-sm">
            <h3 className="text-xl font-semibold text-[#183868] mb-2">
              Vous n'avez pas trouvé votre réponse ?
            </h3>
            <p className="text-gray-600 dark:text-dark-text-secondary mb-4">
              Notre équipe est là pour vous aider
            </p>
            <Link
              to="/aide"
              className="glossy-button inline-flex items-center"
            >
              Contactez-nous
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Send, CheckCircle, AlertCircle, HelpCircle } from 'lucide-react';
import { PublicNavbar } from '@/components/public/PublicNavbar';
import { PublicFooter } from '@/components/public/PublicFooter';
import '@/styles/nautical.css';

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

interface FormData {
  nom: string;
  email: string;
  application: string;
  sujet: string;
  description: string;
}

export function SupportPage() {
  const [formData, setFormData] = useState<FormData>({
    nom: '',
    email: '',
    application: 'CalyMob',
    sujet: '',
    description: '',
  });
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setErrorMessage('');

    try {
      // Send via API endpoint
      const response = await fetch('/api/send-support-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de l\'envoi du message');
      }

      setStatus('success');
      setFormData({
        nom: '',
        email: '',
        application: 'CalyMob',
        sujet: '',
        description: '',
      });
    } catch (error) {
      setStatus('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Une erreur est survenue'
      );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f0f9ff]">
      <PublicNavbar />

      {/* Header */}
      <section className="bg-gradient-to-br from-[#006DB6] to-[#183868] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Mail size={48} className="text-white mx-auto mb-4" />
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Besoin d'aide ?
          </h1>
          <p className="text-[#6BCBE8] text-lg max-w-2xl mx-auto">
            Remplissez le formulaire ci-dessous et nous vous répondrons dans les plus brefs délais
          </p>
        </div>
      </section>

      {/* Form Section */}
      <section className="py-12 flex-grow">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* FAQ Suggestion */}
          <div className="mb-8 p-4 bg-[#6BCBE8]/20 rounded-xl flex items-start">
            <HelpCircle size={24} className="text-[#006DB6] mr-3 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[#183868] font-medium">
                Peut-être votre question a déjà une réponse ?
              </p>
              <Link
                to="/faq"
                className="text-[#006DB6] hover:underline text-sm"
              >
                Consultez notre FAQ
              </Link>
            </div>
          </div>

          {status === 'success' ? (
            <div className="nautical-card text-center py-12">
              <CheckCircle size={64} className="text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-[#183868] mb-2">
                Message envoyé !
              </h2>
              <p className="text-gray-600 dark:text-dark-text-secondary mb-6">
                Nous avons bien reçu votre demande et nous vous répondrons dans les plus brefs délais.
              </p>
              <Link
                to="/"
                className="glossy-button inline-flex items-center"
              >
                Retour à l'accueil
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="nautical-card">
              <h2 className="text-xl font-bold text-[#183868] mb-6">
                Formulaire de contact
              </h2>

              {status === 'error' && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
                  <AlertCircle size={20} className="text-red-500 mr-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-800 font-medium">Erreur d'envoi</p>
                    <p className="text-red-600 text-sm">{errorMessage}</p>
                  </div>
                </div>
              )}

              <div className="space-y-5">
                {/* Nom */}
                <div>
                  <label
                    htmlFor="nom"
                    className="block text-sm font-medium text-[#183868] mb-1"
                  >
                    Nom complet *
                  </label>
                  <input
                    type="text"
                    id="nom"
                    name="nom"
                    required
                    value={formData.nom}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-[#006DB6] focus:border-transparent transition-all"
                    placeholder="Jean Dupont"
                  />
                </div>

                {/* Email */}
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-[#183868] mb-1"
                  >
                    Adresse email *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-[#006DB6] focus:border-transparent transition-all"
                    placeholder="jean.dupont@email.com"
                  />
                </div>

                {/* Application */}
                <div>
                  <label
                    htmlFor="application"
                    className="block text-sm font-medium text-[#183868] mb-1"
                  >
                    Application concernée *
                  </label>
                  <select
                    id="application"
                    name="application"
                    required
                    value={formData.application}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-[#006DB6] focus:border-transparent transition-all bg-white"
                  >
                    <option value="CalyMob">CalyMob (Application mobile)</option>
                    <option value="CalyCompta">CalyCompta (Administration)</option>
                    <option value="Autre">Autre / Question générale</option>
                  </select>
                </div>

                {/* Sujet */}
                <div>
                  <label
                    htmlFor="sujet"
                    className="block text-sm font-medium text-[#183868] mb-1"
                  >
                    Sujet *
                  </label>
                  <input
                    type="text"
                    id="sujet"
                    name="sujet"
                    required
                    value={formData.sujet}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-[#006DB6] focus:border-transparent transition-all"
                    placeholder="Problème de connexion"
                  />
                </div>

                {/* Description */}
                <div>
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium text-[#183868] mb-1"
                  >
                    Description de votre demande *
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    required
                    rows={5}
                    value={formData.description}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-200 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-[#006DB6] focus:border-transparent transition-all resize-none"
                    placeholder="Décrivez votre problème ou question en détail..."
                  />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={status === 'submitting'}
                  className="w-full glossy-button flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === 'submitting' ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2" />
                      Envoi en cours...
                    </>
                  ) : (
                    <>
                      <Send size={20} className="mr-2" />
                      Envoyer le message
                    </>
                  )}
                </button>
              </div>

              <p className="mt-4 text-xs text-gray-500 dark:text-dark-text-muted text-center">
                * Champs obligatoires. Vos données sont traitées conformément à notre{' '}
                <Link to="/privacy" className="text-[#006DB6] hover:underline">
                  politique de confidentialité
                </Link>
                .
              </p>
            </form>
          )}
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { sendPasswordReset } from '@/lib/firebase';
import { Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';
import { logger } from '@/utils/logger';

// Calypso Logo Component (same as LoginForm)
const CalypsoLogo = ({ className = '' }: { className?: string }) => {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return (
      <div className="inline-flex items-center justify-center w-16 h-16 bg-calypso-blue rounded-full">
        <span className="text-white text-2xl font-bold">C</span>
      </div>
    );
  }

  return (
    <img
      src="/logo-vertical.svg"
      alt="Calypso Diving Club"
      className={cn("h-32 w-auto", className)}
      onError={() => setImageError(true)}
    />
  );
};

// Validation schema
const forgotPasswordSchema = z.object({
  email: z.string().email('Adresse email invalide'),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsLoading(true);
    try {
      await sendPasswordReset(data.email);
      setSentEmail(data.email);
      setEmailSent(true);
      toast.success('Email envoyé !');
    } catch (error: any) {
      logger.error('Erreur réinitialisation:', error);
      let errorMessage = "Erreur lors de l'envoi de l'email";

      if (error.code === 'auth/user-not-found') {
        errorMessage = 'Aucun compte trouvé avec cette adresse email';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Adresse email invalide';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Trop de tentatives. Veuillez réessayer plus tard.';
      }

      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Success state - email sent
  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-calypso-blue to-calypso-aqua dark:from-dark-bg-primary dark:to-dark-bg-secondary px-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-xl p-8">
            <div className="text-center mb-6">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary mt-4">
                Email envoyé !
              </h1>
              <p className="text-gray-600 dark:text-dark-text-secondary mt-4">
                Un email de réinitialisation a été envoyé à :
              </p>
              <p className="font-medium text-calypso-blue dark:text-calypso-aqua mt-2">
                {sentEmail}
              </p>
              <p className="text-gray-600 dark:text-dark-text-secondary mt-4 text-sm">
                Vérifiez votre boîte de réception et cliquez sur le lien pour réinitialiser votre mot de passe.
              </p>
              <p className="text-gray-500 dark:text-dark-text-muted mt-2 text-xs">
                Si vous ne trouvez pas l'email, vérifiez votre dossier spam.
              </p>
            </div>

            <button
              onClick={() => navigate('/connexion')}
              className="w-full bg-calypso-blue hover:bg-calypso-blue-dark dark:bg-calypso-aqua dark:hover:bg-calypso-aqua-light text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Retour à la connexion
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Form state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-calypso-blue to-calypso-aqua dark:from-dark-bg-primary dark:to-dark-bg-secondary px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-xl p-8">
          {/* Logo and title */}
          <div className="text-center mb-8">
            <div className="mb-4 flex justify-center">
              <CalypsoLogo />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
              Mot de passe oublié ?
            </h1>
            <p className="text-gray-600 dark:text-dark-text-secondary mt-2">
              Pas de panique ! Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                Adresse email
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  className={`w-full px-4 py-2 pl-10 border rounded-lg focus:ring-2 focus:ring-calypso-blue dark:focus:ring-calypso-aqua focus:border-transparent transition-all bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary ${
                    errors.email ? 'border-red-500' : 'border-gray-300 dark:border-dark-border'
                  }`}
                  placeholder="nom@exemple.com"
                  {...register('email')}
                  disabled={isLoading}
                />
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-dark-text-muted" />
              </div>
              {errors.email && (
                <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email.message}</p>
              )}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-calypso-blue hover:bg-calypso-blue-dark dark:bg-calypso-aqua dark:hover:bg-calypso-aqua-light text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Envoi en cours...
                </>
              ) : (
                <>
                  <Mail className="w-5 h-5" />
                  Envoyer le lien de réinitialisation
                </>
              )}
            </button>
          </form>

          {/* Back to login link */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-dark-border text-center">
            <button
              type="button"
              onClick={() => navigate('/connexion')}
              className="text-sm text-calypso-blue dark:text-calypso-aqua hover:text-calypso-blue-dark dark:hover:text-calypso-aqua-light flex items-center justify-center gap-1 mx-auto"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour à la connexion
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

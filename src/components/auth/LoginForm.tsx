import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { signIn, sendPasswordReset } from '@/lib/firebase';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';

// Calypso Logo Component
const CalypsoLogo = ({ variant = 'icon', className = '' }: { variant?: 'horizontal' | 'icon', className?: string }) => {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    // Fallback to text version
    return (
      <div className="inline-flex items-center justify-center w-16 h-16 bg-calypso-blue rounded-full">
        <span className="text-white text-2xl font-bold">C</span>
      </div>
    );
  }

  if (variant === 'icon') {
    return (
      <img
        src="/logo-vertical.png"
        alt="Calypso Diving Club"
        className={cn("h-32 w-auto", className)}
        onError={() => setImageError(true)}
      />
    );
  }

  return (
    <img
      src="/logo-horizontal.jpg"
      alt="Calypso Diving Club"
      className={cn("h-16 w-auto", className)}
      onError={() => setImageError(true)}
    />
  );
};

// Schéma de validation
const loginSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const userCredential = await signIn(data.email, data.password);
      const user = userCredential.user;

      // Connexion réussie - la modal de changement de mot de passe s'affichera automatiquement
      // via le Layout component si requirePasswordChange: true
      console.log('✅ [LOGIN] User logged in:', user.email);
      toast.success('Connexion réussie !');
      navigate('/accueil');
    } catch (error: any) {
      console.error('Erreur de connexion:', error);

      // Messages d'erreur en français
      let errorMessage = 'Erreur lors de la connexion';
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'Aucun compte trouvé avec cette adresse email';
      } else if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        // Message spécifique pour mot de passe incorrect ou credentials invalides
        errorMessage = 'Mot de passe incorrect. Si votre mot de passe a été réinitialisé récemment par un administrateur, veuillez utiliser le mot de passe temporaire qui vous a été envoyé par email.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Adresse email invalide';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Trop de tentatives. Veuillez réessayer plus tard';
      }

      toast.error(errorMessage, {
        duration: 6000, // Plus long pour laisser le temps de lire
        style: {
          maxWidth: '500px', // Message plus large pour être lisible
        }
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const email = (document.getElementById('email') as HTMLInputElement)?.value;

    if (!email) {
      toast.error('Veuillez entrer votre adresse email');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      toast.error('Adresse email invalide');
      return;
    }

    try {
      await sendPasswordReset(email);
      toast.success(
        'Email de réinitialisation envoyé ! Vérifiez votre boîte de réception.',
        { duration: 5000 }
      );
    } catch (error: any) {
      console.error('Erreur réinitialisation:', error);
      let errorMessage = 'Erreur lors de l\'envoi de l\'email';

      if (error.code === 'auth/user-not-found') {
        errorMessage = 'Aucun compte trouvé avec cette adresse email';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Adresse email invalide';
      }

      toast.error(errorMessage);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-calypso-blue to-calypso-aqua dark:from-dark-bg-primary dark:to-dark-bg-secondary px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-xl p-8">
          {/* Logo et titre */}
          <div className="text-center mb-8">
            <div className="mb-4 flex justify-center">
              <CalypsoLogo variant="icon" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">CalyCompta</h1>
            <p className="text-gray-600 dark:text-dark-text-secondary mt-2">Comptabilité du Club Calypso</p>
          </div>

          {/* Formulaire */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                Adresse email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-calypso-blue dark:focus:ring-calypso-aqua focus:border-transparent transition-all bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary ${
                  errors.email ? 'border-red-500' : 'border-gray-300 dark:border-dark-border'
                }`}
                placeholder="nom@exemple.com"
                {...register('email')}
                disabled={isLoading}
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email.message}</p>
              )}
            </div>

            {/* Mot de passe */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-calypso-blue dark:focus:ring-calypso-aqua focus:border-transparent transition-all pr-10 bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary ${
                    errors.password ? 'border-red-500' : 'border-gray-300 dark:border-dark-border'
                  }`}
                  placeholder="••••••••"
                  {...register('password')}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:hover:text-dark-text-primary"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.password.message}</p>
              )}
            </div>

            {/* Options */}
            <div className="flex items-center justify-between">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 dark:border-dark-border text-calypso-blue dark:text-calypso-aqua focus:ring-calypso-blue dark:focus:ring-calypso-aqua"
                />
                <span className="ml-2 text-sm text-gray-600 dark:text-dark-text-secondary">Se souvenir de moi</span>
              </label>
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-sm text-calypso-blue dark:text-calypso-aqua hover:text-calypso-blue-dark dark:hover:text-calypso-aqua-light"
              >
                Mot de passe oublié ?
              </button>
            </div>

            {/* Bouton de connexion */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-calypso-blue hover:bg-calypso-blue-dark dark:bg-calypso-aqua dark:hover:bg-calypso-aqua-light text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Connexion en cours...
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  Se connecter
                </>
              )}
            </button>
          </form>

          {/* Séparateur */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-dark-border text-center">
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
              Pas encore de compte ?{' '}
              <button
                type="button"
                onClick={() => navigate('/inscription')}
                className="text-calypso-blue dark:text-calypso-aqua hover:text-calypso-blue-dark dark:hover:text-calypso-aqua-light font-medium"
              >
                Créer un compte
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
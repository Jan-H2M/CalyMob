import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { signIn, signOut, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';
import { logger } from '@/utils/logger';
import { canAccessCalyCompta } from '@/utils/fieldMapper';

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
        src="/logo-vertical.svg"
        alt="Calypso Diving Club"
        className={cn("h-32 w-auto", className)}
        onError={() => setImageError(true)}
      />
    );
  }

  return (
    <img
      src="/logo-horizontal.svg"
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

      // Vérifier si l'utilisateur a accès à CalyCompta (bloquer les comptes "membre" mobile-only)
      const clubId = 'calypso';
      const memberDoc = await getDoc(doc(db, `clubs/${clubId}/members/${user.uid}`));
      if (memberDoc.exists()) {
        const memberData = memberDoc.data();
        if (!canAccessCalyCompta(memberData as any)) {
          // Déconnecter immédiatement — ce compte est réservé à CalyMob
          logger.warn(`⛔ [LOGIN] Membre-only account blocked from CalyCompta: ${user.email}`);
          await signOut();
          toast.error(
            'Ce compte est réservé à l\'application mobile CalyMob. Téléchargez CalyMob sur l\'App Store ou le Play Store pour accéder à votre espace membre.',
            { duration: 8000, style: { maxWidth: '500px' } }
          );
          return;
        }
      }

      // Connexion réussie - la modal de changement de mot de passe s'affichera automatiquement
      // via le Layout component si requirePasswordChange: true
      logger.debug('✅ [LOGIN] User logged in:', user.email);
      toast.success('Connexion réussie !');
      navigate('/accueil');
    } catch (error) {
      logger.error('Erreur de connexion:', error);

      // Messages d'erreur en français
      const firebaseError = error as { code?: string };
      let errorMessage = 'Erreur lors de la connexion';
      if (firebaseError.code === 'auth/user-not-found') {
        errorMessage = 'Aucun compte trouvé avec cette adresse email';
      } else if (firebaseError.code === 'auth/wrong-password' || firebaseError.code === 'auth/invalid-credential') {
        // Message spécifique pour mot de passe incorrect ou credentials invalides
        errorMessage = 'Mot de passe incorrect. Utilisez votre mot de passe le plus récent ou relancez la procédure via "Mot de passe oublié". Si un administrateur a réinitialisé votre accès, vérifiez aussi le dernier email reçu.';
      } else if (firebaseError.code === 'auth/invalid-email') {
        errorMessage = 'Adresse email invalide';
      } else if (firebaseError.code === 'auth/too-many-requests') {
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

  const handleForgotPassword = () => {
    navigate('/mot-de-passe-oublie');
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
                <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email.message}</p>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary dark:hover:text-dark-text-primary"
                  tabIndex={-1}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.password.message}</p>
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

          {/* Info compte */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-dark-border text-center">
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
              Pas encore de compte ? Contactez un responsable du club.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

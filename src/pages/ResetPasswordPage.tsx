import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Eye, EyeOff, Loader2, KeyRound, CheckCircle, XCircle, Smartphone, Monitor } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';
import { logger } from '@/utils/logger';

// Check if user is on mobile device
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// Choice screen component for mobile users
const ChoiceScreen = ({
  email,
  oobCode,
  onContinueHere
}: {
  email: string | null;
  oobCode: string;
  onContinueHere: () => void;
}) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-calypso-blue to-calypso-aqua px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Logo and title */}
          <div className="text-center mb-8">
            <div className="mb-4 flex justify-center">
              <img
                src="/logo-vertical.svg"
                alt="Calypso Diving Club"
                className="h-24 w-auto"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">Réinitialiser le mot de passe</h1>
            {email && (
              <p className="text-gray-600 dark:text-dark-text-secondary mt-2">
                pour <span className="font-medium">{email}</span>
              </p>
            )}
          </div>

          {/* Choice description */}
          <p className="text-center text-gray-600 dark:text-dark-text-secondary mb-6">
            Où souhaitez-vous réinitialiser votre mot de passe ?
          </p>

          {/* Buttons */}
          <div className="space-y-4">
            {/* Open in CalyMob */}
            <a
              href={`calymob://reset-password?oobCode=${oobCode}&mode=resetPassword`}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-4 rounded-lg transition-colors flex items-center justify-center gap-3"
            >
              <Smartphone className="w-6 h-6" />
              <span>Ouvrir dans l'app CalyMob</span>
            </a>

            {/* Continue in browser */}
            <button
              onClick={onContinueHere}
              className="w-full bg-calypso-blue hover:bg-calypso-blue-dark text-white font-semibold py-4 px-4 rounded-lg transition-colors flex items-center justify-center gap-3"
            >
              <Monitor className="w-6 h-6" />
              <span>Continuer dans le navigateur</span>
            </button>
          </div>

          {/* Help text */}
          <p className="text-center text-sm text-gray-500 dark:text-dark-text-muted mt-6">
            Si vous utilisez l'application mobile CalyMob, choisissez la première option pour une meilleure expérience.
          </p>
        </div>
      </div>
    </div>
  );
};

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
const resetSchema = z.object({
  password: z.string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
    .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword'],
});

type ResetFormData = z.infer<typeof resetSchema>;

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showChoice, setShowChoice] = useState(true); // Show choice screen first on mobile

  const oobCode = searchParams.get('oobCode');
  const mode = searchParams.get('mode');
  const source = searchParams.get('source'); // 'app' if request came from CalyMob

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
  });

  // Verify the reset code on mount
  useEffect(() => {
    const verifyCode = async () => {
      if (!oobCode) {
        setError('Lien de réinitialisation invalide ou expiré.');
        setIsVerifying(false);
        return;
      }

      if (mode !== 'resetPassword') {
        setError('Type de lien non supporté.');
        setIsVerifying(false);
        return;
      }

      try {
        const userEmail = await verifyPasswordResetCode(auth, oobCode);
        setEmail(userEmail);
        setIsVerifying(false);
      } catch (err: any) {
        logger.error('Error verifying code:', err);
        if (err.code === 'auth/expired-action-code') {
          setError('Ce lien a expiré. Veuillez demander un nouveau lien de réinitialisation.');
        } else if (err.code === 'auth/invalid-action-code') {
          setError('Ce lien est invalide ou a déjà été utilisé.');
        } else {
          setError('Erreur lors de la vérification du lien.');
        }
        setIsVerifying(false);
      }
    };

    verifyCode();
  }, [oobCode, mode]);

  // Auto-redirect to app if source=app (request came from CalyMob)
  useEffect(() => {
    if (source === 'app' && oobCode && !isVerifying && !error) {
      // Automatically redirect to CalyMob app
      window.location.href = `calymob://reset-password?oobCode=${oobCode}&mode=resetPassword`;
    }
  }, [source, oobCode, isVerifying, error]);

  const onSubmit = async (data: ResetFormData) => {
    if (!oobCode) return;

    setIsLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, data.password);
      setSuccess(true);
      toast.success('Mot de passe modifié avec succès !');

      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/connexion');
      }, 2000);
    } catch (err: any) {
      logger.error('Error resetting password:', err);
      let errorMessage = 'Erreur lors de la réinitialisation du mot de passe';

      if (err.code === 'auth/expired-action-code') {
        errorMessage = 'Ce lien a expiré. Veuillez demander un nouveau lien.';
      } else if (err.code === 'auth/invalid-action-code') {
        errorMessage = 'Ce lien est invalide ou a déjà été utilisé.';
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'Le mot de passe est trop faible.';
      }

      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state while verifying
  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-calypso-blue to-calypso-aqua px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-calypso-blue mx-auto" />
            <p className="mt-4 text-gray-600 dark:text-dark-text-secondary">Vérification du lien...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-calypso-blue to-calypso-aqua px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-6">
              <XCircle className="w-16 h-16 text-red-500 mx-auto" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary mt-4">Lien invalide</h1>
              <p className="text-gray-600 dark:text-dark-text-secondary mt-2">{error}</p>
            </div>
            <button
              onClick={() => navigate('/connexion')}
              className="w-full bg-calypso-blue hover:bg-calypso-blue-dark text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Retour à la connexion
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If source=app, show a redirect screen while we try to open the app
  if (source === 'app' && oobCode && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-calypso-blue to-calypso-aqua px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <Smartphone className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary mb-2">Ouverture de CalyMob...</h1>
            <p className="text-gray-600 dark:text-dark-text-secondary mb-6">
              L'application CalyMob devrait s'ouvrir automatiquement.
            </p>
            <p className="text-sm text-gray-500 dark:text-dark-text-muted mb-4">
              Si l'application ne s'ouvre pas, cliquez sur le bouton ci-dessous :
            </p>
            <a
              href={`calymob://reset-password?oobCode=${oobCode}&mode=resetPassword`}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 mb-4"
            >
              <Smartphone className="w-5 h-5" />
              Ouvrir CalyMob
            </a>
            <button
              onClick={() => {
                // Remove source param and reload to show browser form
                const newParams = new URLSearchParams(searchParams);
                newParams.delete('source');
                navigate(`/reset-password?${newParams.toString()}`, { replace: true });
              }}
              className="text-sm text-calypso-blue hover:text-calypso-blue-dark"
            >
              Continuer dans le navigateur
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Choice screen for mobile users (only if source is not 'app')
  if (isMobileDevice() && showChoice && oobCode && source !== 'app') {
    return (
      <ChoiceScreen
        email={email}
        oobCode={oobCode}
        onContinueHere={() => setShowChoice(false)}
      />
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-calypso-blue to-calypso-aqua px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-6">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary mt-4">Mot de passe modifié !</h1>
              <p className="text-gray-600 dark:text-dark-text-secondary mt-2">
                Votre mot de passe a été réinitialisé avec succès.
                Redirection vers la page de connexion...
              </p>
            </div>
            <button
              onClick={() => navigate('/connexion')}
              className="w-full bg-calypso-blue hover:bg-calypso-blue-dark text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Se connecter maintenant
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Reset form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-calypso-blue to-calypso-aqua px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Logo and title */}
          <div className="text-center mb-8">
            <div className="mb-4 flex justify-center">
              <CalypsoLogo />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">Réinitialiser le mot de passe</h1>
            {email && (
              <p className="text-gray-600 dark:text-dark-text-secondary mt-2">
                pour <span className="font-medium">{email}</span>
              </p>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* New password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                Nouveau mot de passe
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent transition-all pr-10 ${
                    errors.password ? 'border-red-500' : 'border-gray-300 dark:border-dark-border'
                  }`}
                  placeholder="••••••••"
                  {...register('password')}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary"
                  tabIndex={-1}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && (
                <p role="alert" className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent transition-all pr-10 ${
                    errors.confirmPassword ? 'border-red-500' : 'border-gray-300 dark:border-dark-border'
                  }`}
                  placeholder="••••••••"
                  {...register('confirmPassword')}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p role="alert" className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
              )}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-calypso-blue hover:bg-calypso-blue-dark text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Réinitialisation...
                </>
              ) : (
                <>
                  <KeyRound className="w-5 h-5" />
                  Réinitialiser le mot de passe
                </>
              )}
            </button>
          </form>

          {/* Back to login link */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => navigate('/connexion')}
              className="text-sm text-calypso-blue hover:text-calypso-blue-dark"
            >
              Retour à la connexion
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PasswordService } from '@/services/passwordService';
import { Eye, EyeOff, Loader2, Lock, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';

// Validation schema
const changePasswordSchema = z.object({
  newPassword: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
});

type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

export function ChangePasswordForm() {
  const navigate = useNavigate();
  const { appUser } = useAuth();
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onSubmit = async (data: ChangePasswordFormData) => {
    if (!appUser) {
      toast.error('Vous devez être authentifié');
      return;
    }

    setIsLoading(true);
    try {
      await PasswordService.changeMyPassword(data.newPassword, appUser.clubId);
      toast.success('Mot de passe changé avec succès !');
      navigate('/accueil');
    } catch (error: any) {
      console.error('Erreur changement mot de passe:', error);

      let errorMessage = 'Erreur lors du changement de mot de passe';
      if (error.code === 'auth/requires-recent-login') {
        errorMessage = 'Veuillez vous reconnecter avant de changer votre mot de passe';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Le mot de passe est trop faible';
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-calypso-blue to-calypso-aqua px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mb-4 flex justify-center">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center">
                <Shield className="w-8 h-8 text-orange-600" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">Changement de mot de passe requis</h1>
            <p className="text-gray-600 dark:text-dark-text-secondary mt-2">
              Pour des raisons de sécurité, vous devez définir un nouveau mot de passe.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* New Password */}
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                Nouveau mot de passe *
              </label>
              <div className="relative">
                <input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  className={cn(
                    "w-full px-4 py-2 pl-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",
                    errors.newPassword ? 'border-red-500' : 'border-gray-300'
                  )}
                  placeholder="Minimum 6 caractères"
                  {...register('newPassword')}
                  disabled={isLoading}
                />
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-dark-text-muted" />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary"
                  tabIndex={-1}
                >
                  {showNewPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.newPassword && (
                <p className="mt-1 text-sm text-red-600">{errors.newPassword.message}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                Confirmer le mot de passe *
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className={cn(
                    "w-full px-4 py-2 pl-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",
                    errors.confirmPassword ? 'border-red-500' : 'border-gray-300'
                  )}
                  placeholder="Confirmer le mot de passe"
                  {...register('confirmPassword')}
                  disabled={isLoading}
                />
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-dark-text-muted" />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
              )}
            </div>

            {/* Info box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Conseils de sécurité:</strong>
              </p>
              <ul className="mt-2 text-sm text-blue-700 list-disc list-inside space-y-1">
                <li>Utilisez au moins 6 caractères</li>
                <li>Mélangez lettres, chiffres et symboles</li>
                <li>N'utilisez pas un mot de passe évident</li>
              </ul>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Changement en cours...
                </>
              ) : (
                <>
                  <Shield className="w-5 h-5" />
                  Changer mon mot de passe
                </>
              )}
            </button>
          </form>

          {/* Warning */}
          <div className="mt-6 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <p className="text-xs text-orange-800 text-center">
              Vous ne pourrez pas accéder à l'application tant que vous n'aurez pas changé votre mot de passe.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

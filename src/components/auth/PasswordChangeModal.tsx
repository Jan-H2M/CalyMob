import React, { useState, useMemo } from 'react';
import { auth } from '@/lib/firebase';
import toast from 'react-hot-toast';
import { logger } from '@/utils/logger';

/**
 * Password validation result (matches CalyMob password_service.dart)
 */
interface PasswordValidation {
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  isValid: boolean;
}

/**
 * Validate password against requirements (consistent with CalyMob)
 * Requirements:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 */
function validatePassword(password: string): PasswordValidation {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  return {
    hasMinLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    isValid: hasMinLength && hasUppercase && hasLowercase && hasNumber,
  };
}

interface PasswordChangeModalProps {
  userId: string;
  clubId: string;
  userEmail: string;
  onComplete: () => void;
}

export default function PasswordChangeModal({
  userId,
  clubId,
  userEmail,
  onComplete
}: PasswordChangeModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Live password validation (consistent with CalyMob)
  const validation = useMemo(() => validatePassword(newPassword), [newPassword]);

  // Log when modal mounts
  React.useEffect(() => {
    logger.debug('🔐 [PASSWORD_MODAL] Component mounted for user:', userEmail);
    return () => {
      logger.debug('🔐 [PASSWORD_MODAL] Component unmounted');
    };
  }, [userEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation (consistent with CalyMob - 8 chars + complexity)
    if (!validation.isValid) {
      toast.error('Le mot de passe ne respecte pas les exigences de sécurité');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }

    setIsLoading(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Utilisateur non connecté');
      }

      // Get auth token
      const authToken = await currentUser.getIdToken();

      // Call API to change password (updates both Auth and Firestore)
      const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          clubId: clubId,
          authToken: authToken,
          newPassword: newPassword
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du changement de mot de passe');
      }

      toast.success(data.message);
      onComplete();
    } catch (error: any) {
      logger.error('Error changing password:', error);
      toast.error(error.message || 'Erreur lors du changement de mot de passe');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary mb-4">
          Changement de mot de passe obligatoire
        </h2>

        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            <span className="font-semibold">⚠️ Sécurité:</span> Votre accès doit être sécurisé avec un mot de passe personnel.
            Vous devez définir un mot de passe conforme avant de continuer.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              Email
            </label>
            <input
              type="email"
              value={userEmail}
              disabled
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-gray-50 dark:bg-dark-bg-tertiary text-gray-600 dark:text-dark-text-secondary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              Nouveau mot de passe <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Minimum 8 caractères"
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Password requirements checklist (consistent with CalyMob) */}
          <div className="p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
            <p className="text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-2">Exigences :</p>
            <ul className="space-y-1">
              <RequirementItem met={validation.hasMinLength} text="Au moins 8 caractères" />
              <RequirementItem met={validation.hasUppercase} text="Une lettre majuscule" />
              <RequirementItem met={validation.hasLowercase} text="Une lettre minuscule" />
              <RequirementItem met={validation.hasNumber} text="Un chiffre" />
            </ul>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              Confirmer le mot de passe <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Répétez le mot de passe"
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={isLoading || !validation.isValid || !confirmPassword}
              className={`px-6 py-2 text-white rounded-lg transition-colors font-medium ${
                validation.isValid
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-gray-400 cursor-not-allowed'
              } disabled:bg-gray-300 disabled:cursor-not-allowed`}
            >
              {isLoading ? 'Modification...' : 'Modifier le mot de passe'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Password requirement item with check icon
 */
function RequirementItem({ met, text }: { met: boolean; text: string }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      {met ? (
        <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeWidth="2" />
        </svg>
      )}
      <span className={met ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-dark-text-secondary'}>
        {text}
      </span>
    </li>
  );
}

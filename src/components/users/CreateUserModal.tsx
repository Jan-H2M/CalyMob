import { useState } from 'react';
import { X, UserPlus, Eye, EyeOff, AlertTriangle, Loader2 } from 'lucide-react';
import { UserRole } from '@/types/user.types';
import { UserService } from '@/services/userService';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import toast from 'react-hot-toast';

interface CreateUserModalProps {
  clubId: string;
  createdBy: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateUserModal({ clubId, createdBy, onClose, onSuccess }: CreateUserModalProps) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!email || !email.includes('@')) {
      toast.error('Email invalide');
      return;
    }
    if (!firstName || !lastName) {
      toast.error('Prénom et nom obligatoires');
      return;
    }
    if (!password || password.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setLoading(true);
    try {
      // Step 1: Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const userId = userCredential.user.uid;

      // Step 2: Create Firestore document
      await UserService.createUser(clubId, userId, {
        email,
        displayName: `${firstName} ${lastName}`,
        firstName,
        lastName,
        role,
        clubId
      }, createdBy);

      toast.success('✓ Utilisateur créé avec succès');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error creating user:', error);

      // Handle specific Firebase errors
      if (error.code === 'auth/email-already-in-use') {
        toast.error('Cet email est déjà utilisé');
      } else if (error.code === 'auth/weak-password') {
        toast.error('Mot de passe trop faible (minimum 6 caractères)');
      } else if (error.code === 'auth/invalid-email') {
        toast.error('Format d\'email invalide');
      } else {
        toast.error(error.message || 'Erreur lors de la création de l\'utilisateur');
      }
    } finally {
      setLoading(false);
    }
  };

  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(pwd);
    setShowPassword(true);
    toast.success('Mot de passe généré');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <UserPlus className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
              Créer un utilisateur
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-dark-text-muted" />
          </button>
        </div>

        {/* Warning */}
        <div className="mx-6 mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium mb-1">Avertissement</p>
              <p>La création d'un utilisateur via l'interface vous déconnectera temporairement. Vous devrez vous reconnecter après.</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
              Email *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
              placeholder="utilisateur@calypso.be"
              required
              disabled={loading}
            />
          </div>

          {/* Prénom */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
              Prénom *
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
              placeholder="Jean"
              required
              disabled={loading}
            />
          </div>

          {/* Nom */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
              Nom *
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
              placeholder="Dupont"
              required
              disabled={loading}
            />
          </div>

          {/* Rôle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
              Rôle *
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
              disabled={loading}
            >
              <option value="user">Utilisateur</option>
              <option value="validateur">Validateur</option>
              <option value="admin">Administrateur</option>
              <option value="superadmin">Super Admin</option>
            </select>
          </div>

          {/* Mot de passe */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
              Mot de passe *
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                  placeholder="Minimum 6 caractères"
                  required
                  minLength={6}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-dark-bg-primary rounded"
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 text-gray-500 dark:text-dark-text-muted" />
                  ) : (
                    <Eye className="w-4 h-4 text-gray-500 dark:text-dark-text-muted" />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={generatePassword}
                className="px-3 py-2 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-secondary rounded-lg hover:bg-gray-200 dark:hover:bg-dark-bg-primary text-sm font-medium whitespace-nowrap"
                disabled={loading}
              >
                Générer
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
              Minimum 6 caractères. Utilisez le bouton "Générer" pour créer un mot de passe sécurisé.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-secondary rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary font-medium"
              disabled={loading}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Création...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Créer
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

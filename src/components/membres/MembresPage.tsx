import { UserManagement } from '@/components/users/UserManagement';

export function MembresPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
          Membres
        </h1>
        <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary mt-1">
          Gestion des membres du club
        </p>
      </div>

      <UserManagement />
    </div>
  );
}

import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { BookOpen, Calendar, BarChart3, Dumbbell, BarChart2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCarnetFormationGuard } from '@/hooks/useFeatureFlags';

const tabs = [
  { to: '/formation/progression', label: 'Progression', icon: BarChart3 },
  { to: '/formation/exercices', label: 'Exercices', icon: Dumbbell },
  { to: '/formation/planning', label: 'Planning', icon: Calendar },
  { to: '/formation/themes', label: 'Thèmes', icon: BookOpen },
  { to: '/formation/statistiques', label: 'Statistiques', icon: BarChart2 },
];

/**
 * Layout wrapper for the Formation section.
 * Provides sub-navigation tabs + passes clubId down.
 */
export function FormationLayout() {
  const { clubId } = useAuth();
  const { visible } = useCarnetFormationGuard(clubId);

  if (!visible) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Le Carnet de Formation n'est pas activé.
      </div>
    );
  }

  return (
    <div>
      {/* Sub-navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-6xl mx-auto px-4">
          <nav className="flex gap-1 -mb-px">
            {tabs.map(tab => (
              <NavLink key={tab.to} to={tab.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                  ${isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`
                }>
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      {/* Page content */}
      <Outlet />
    </div>
  );
}

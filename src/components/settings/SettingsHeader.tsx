import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SettingsHeaderProps {
  breadcrumb: string[];
  title: string;
  description?: string;
}

export function SettingsHeader({ breadcrumb, title, description }: SettingsHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="mb-6">
      {/* Back button + Breadcrumb */}
      <button
        onClick={() => navigate('/parametres')}
        className="flex items-center gap-2 text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary transition-colors mb-4"
      >
        <ArrowLeft className="h-5 w-5" />
        <span className="text-sm">
          {breadcrumb.join(' > ')}
        </span>
      </button>

      {/* Title */}
      <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">
        {title}
      </h1>

      {/* Description */}
      {description && (
        <p className="text-gray-600 dark:text-dark-text-secondary mt-2">
          {description}
        </p>
      )}
    </div>
  );
}

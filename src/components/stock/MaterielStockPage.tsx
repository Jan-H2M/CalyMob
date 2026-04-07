/**
 * MaterielStockPage - Wrapper for Matériel page within Stock section
 */

import React from 'react';
import { StockHeader } from './StockHeader';
import { MaterielPage } from '../inventaire/materiel/MaterielPage';

export function MaterielStockPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        <StockHeader
          title="Matériel"
          description="Gestion des équipements du club et documentation"
        />
        <MaterielPage />
      </div>
    </div>
  );
}

/**
 * PretsStockPage - Wrapper for Prêts page within Stock section
 */

import React from 'react';
import { StockHeader } from './StockHeader';
import { PretsPage } from '../inventaire/prets/PretsPage';

export function PretsStockPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        <StockHeader
          title="Prêts"
          description="Suivi des emprunts de matériel par les membres"
        />
        <PretsPage />
      </div>
    </div>
  );
}

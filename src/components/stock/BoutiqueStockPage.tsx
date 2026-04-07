/**
 * BoutiqueStockPage - Wrapper for Boutique page within Stock section
 */

import React from 'react';
import { StockHeader } from './StockHeader';
import { BoutiquePage } from '../boutique/BoutiquePage';

export function BoutiqueStockPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        <StockHeader
          title="Boutique"
          description="Stock et ventes de la boutique club et LIFRAS"
        />
        <BoutiquePage />
      </div>
    </div>
  );
}

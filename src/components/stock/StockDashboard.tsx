/**
 * StockDashboard - Dashboard voor alle stock-gerelateerde modules
 *
 * Grid met kaarten voor:
 * - Matériel (equipment management)
 * - Prêts (loan tracking)
 * - Boutique (merchandise stock)
 * - Inventaire (annual audit)
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package,
  ClipboardList,
  ShoppingBag,
  ClipboardCheck,
  Warehouse,
  Settings
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface StockCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  route: string;
}

export function StockDashboard() {
  const navigate = useNavigate();
  const { appUser } = useAuth();

  const baseCards: StockCard[] = [
    {
      id: 'materiel',
      title: 'Matériel',
      description: 'Gestion des équipements du club et documentation',
      icon: <Package className="h-8 w-8" />,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
      route: '/stock/materiel'
    },
    {
      id: 'prets',
      title: 'Prêts',
      description: 'Suivi des emprunts de matériel par les membres',
      icon: <ClipboardList className="h-8 w-8" />,
      iconBg: 'bg-green-100 dark:bg-green-900/30',
      iconColor: 'text-green-600 dark:text-green-400',
      route: '/stock/prets'
    },
    {
      id: 'boutique',
      title: 'Boutique',
      description: 'Stock et ventes de la boutique club et LIFRAS',
      icon: <ShoppingBag className="h-8 w-8" />,
      iconBg: 'bg-purple-100 dark:bg-purple-900/30',
      iconColor: 'text-purple-600 dark:text-purple-400',
      route: '/stock/boutique'
    },
    {
      id: 'audit',
      title: 'Inventaire',
      description: 'Audit annuel et vérification du matériel',
      icon: <ClipboardCheck className="h-8 w-8" />,
      iconBg: 'bg-orange-100 dark:bg-orange-900/30',
      iconColor: 'text-orange-600 dark:text-orange-400',
      route: '/stock/audit'
    }
  ];

  // Add Configuration card for superadmin only
  const cards: StockCard[] = appUser?.role === 'superadmin'
    ? [
        ...baseCards,
        {
          id: 'config',
          title: 'Configuration',
          description: 'Types de matériel, checklists et cautions',
          icon: <Settings className="h-8 w-8" />,
          iconBg: 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-800',
          iconColor: 'text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted',
          route: '/stock/config'
        }
      ]
    : baseCards;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary flex items-center gap-3">
            <Warehouse className="h-8 w-8" />
            Stock
          </h1>
          <p className="text-gray-600 dark:text-dark-text-secondary mt-2">
            Gestion du matériel, des prêts et de la boutique
          </p>
        </div>

        {/* Cards Grid - 2x2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cards.map((card) => (
            <button
              key={card.id}
              onClick={() => navigate(card.route)}
              className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6 hover:shadow-md hover:border-calypso-blue dark:hover:border-calypso-aqua transition-all text-left group"
            >
              {/* Icon */}
              <div className={`inline-flex p-4 rounded-lg ${card.iconBg} ${card.iconColor} mb-4 group-hover:scale-110 transition-transform`}>
                {card.icon}
              </div>

              {/* Title */}
              <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-2">
                {card.title}
              </h3>

              {/* Description */}
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-4">
                {card.description}
              </p>

              {/* Button */}
              <div className="flex items-center gap-2 text-calypso-blue dark:text-calypso-aqua font-medium text-sm group-hover:gap-3 transition-all">
                <span>Accéder</span>
                <span>→</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
